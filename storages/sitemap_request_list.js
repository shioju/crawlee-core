"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SitemapRequestList = void 0;
const tslib_1 = require("tslib");
const node_stream_1 = require("node:stream");
const log_1 = tslib_1.__importDefault(require("@apify/log"));
const utils_1 = require("@crawlee/utils");
const ow_1 = tslib_1.__importDefault(require("ow"));
const key_value_store_1 = require("./key_value_store");
const utils_2 = require("./utils");
const request_1 = require("../request");
/**
 * A list of URLs to crawl parsed from a sitemap.
 *
 * The loading of the sitemap is performed in the background so that crawling can start before the sitemap is fully loaded.
 */
class SitemapRequestList {
    /** @internal */
    constructor(options) {
        /**
         * Set of URLs that were returned by `fetchNextRequest()` and not marked as handled yet.
         * @internal
         */
        Object.defineProperty(this, "inProgress", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: new Set()
        });
        /** Set of URLs for which `reclaimRequest()` was called. */
        Object.defineProperty(this, "reclaimed", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: new Set()
        });
        /**
         * Map of returned Request objects that have not been marked as handled yet.
         *
         * We use this to persist custom user fields on the in-progress (or reclaimed) requests.
         */
        Object.defineProperty(this, "requestData", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: new Map()
        });
        /**
         * Object for keeping track of the sitemap parsing progress.
         */
        Object.defineProperty(this, "sitemapParsingProgress", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: {
                /**
                 * URL of the sitemap that is currently being parsed. `null` if no sitemap is being parsed.
                 */
                inProgressSitemapUrl: null,
                /**
                 * Buffer for URLs from the currently parsed sitemap. Used for tracking partially loaded sitemaps across migrations.
                 */
                inProgressEntries: new Set(),
                /**
                 * Set of sitemap URLs that have not been fully parsed yet. If the set is empty and `inProgressSitemapUrl` is `null`, the sitemap loading is finished.
                 */
                pendingSitemapUrls: new Set(),
            }
        });
        /**
         * Object stream of URLs parsed from the sitemaps.
         * Using `highWaterMark`, this can manage the speed of the sitemap loading.
         *
         * Fetch the next URL to be processed using `fetchNextRequest()`.
         */
        Object.defineProperty(this, "urlQueueStream", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        /**
         * Indicates whether the request list sitemap loading was aborted.
         *
         * If the loading was aborted before the sitemaps were fully loaded, the request list might be missing some URLs.
         * The `isSitemapFullyLoaded` method can be used to check if the sitemaps were fully loaded.
         *
         * If the loading is aborted and all the requests are handled, `isFinished()` will return `true`.
         */
        Object.defineProperty(this, "abortLoading", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: false
        });
        /** Number of URLs that were marked as handled */
        Object.defineProperty(this, "handledUrlCount", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0
        });
        Object.defineProperty(this, "persistStateKey", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "store", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        /**
         * Proxy URL to be used for sitemap loading.
         */
        Object.defineProperty(this, "proxyUrl", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        /**
         * Logger instance.
         */
        Object.defineProperty(this, "log", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: log_1.default.child({ prefix: 'SitemapRequestList' })
        });
        (0, ow_1.default)(options, ow_1.default.object.exactShape({
            sitemapUrls: ow_1.default.array.ofType(ow_1.default.string),
            proxyUrl: ow_1.default.optional.string,
            persistStateKey: ow_1.default.optional.string,
            signal: ow_1.default.optional.any(),
            timeoutMillis: ow_1.default.optional.number,
            maxBufferSize: ow_1.default.optional.number,
        }));
        this.persistStateKey = options.persistStateKey;
        this.proxyUrl = options.proxyUrl;
        this.urlQueueStream = new node_stream_1.Transform({
            objectMode: true,
            highWaterMark: options.maxBufferSize ?? 200,
        });
        this.urlQueueStream.pause();
        this.sitemapParsingProgress.pendingSitemapUrls = new Set(options.sitemapUrls);
    }
    /**
     * Adds a URL to the queue of parsed URLs.
     *
     * Blocks if the stream is full until it is drained.
     */
    async pushNextUrl(url) {
        return new Promise((resolve) => {
            if (!this.urlQueueStream.push(url)) {
                // This doesn't work with the 'drain' event (it's not emitted for some reason).
                this.urlQueueStream.once('readdata', () => {
                    resolve();
                });
            }
            else {
                resolve();
            }
        });
    }
    /**
     * Reads the next URL from the queue of parsed URLs.
     *
     * If the stream is empty, blocks until a new URL is pushed.
     * @returns The next URL from the queue or `null` if we have read all URLs.
     */
    async readNextUrl() {
        return new Promise((resolve) => {
            const result = this.urlQueueStream.read();
            if (!result && !this.isSitemapFullyLoaded()) {
                this.urlQueueStream.once('readable', () => {
                    const nextUrl = this.urlQueueStream.read();
                    resolve(nextUrl);
                });
            }
            else {
                resolve(result);
            }
            this.urlQueueStream.emit('readdata');
        });
    }
    /**
     * Indicates whether the background processing of sitemap contents has successfully finished.
     *
     * If this is `false`, the background processing is either still in progress or was aborted.
     */
    isSitemapFullyLoaded() {
        return (this.sitemapParsingProgress.inProgressSitemapUrl === null &&
            this.sitemapParsingProgress.pendingSitemapUrls.size === 0);
    }
    /**
     * Start processing the sitemaps and loading the URLs.
     *
     * Resolves once all the sitemaps URLs have been fully loaded (sets `isSitemapFullyLoaded` to `true`).
     */
    async load() {
        while (!this.isSitemapFullyLoaded() && !this.abortLoading) {
            const sitemapUrl = this.sitemapParsingProgress.inProgressSitemapUrl ??
                this.sitemapParsingProgress.pendingSitemapUrls.values().next().value;
            try {
                for await (const item of (0, utils_1.parseSitemap)([{ type: 'url', url: sitemapUrl }], this.proxyUrl, {
                    maxDepth: 0,
                    emitNestedSitemaps: true,
                })) {
                    if (!item.originSitemapUrl) {
                        // This is a nested sitemap
                        this.sitemapParsingProgress.pendingSitemapUrls.add(item.loc);
                        continue;
                    }
                    if (!this.sitemapParsingProgress.inProgressEntries.has(item.loc)) {
                        await this.pushNextUrl(item.loc);
                        this.sitemapParsingProgress.inProgressEntries.add(item.loc);
                    }
                }
            }
            catch (e) {
                this.log.error('Error loading sitemap contents:', e);
            }
            this.sitemapParsingProgress.pendingSitemapUrls.delete(sitemapUrl);
            this.sitemapParsingProgress.inProgressEntries.clear();
            this.sitemapParsingProgress.inProgressSitemapUrl = null;
        }
        await this.pushNextUrl(null);
    }
    /**
     * Open a sitemap and start processing it.
     *
     * Resolves to a new instance of `SitemapRequestList`, which **might not be fully loaded yet** - i.e. the sitemap might still be loading in the background.
     *
     * Track the loading progress using the `isSitemapFullyLoaded` property.
     */
    static async open(options) {
        const requestList = new SitemapRequestList(options);
        await requestList.restoreState();
        void requestList.load();
        options?.signal?.addEventListener('abort', () => {
            requestList.abortLoading = true;
        });
        if (options.timeoutMillis) {
            setTimeout(() => {
                requestList.abortLoading = true;
            }, options.timeoutMillis);
        }
        return requestList;
    }
    /**
     * @inheritDoc
     */
    length() {
        return this.urlQueueStream.readableLength + this.handledUrlCount - this.inProgress.size - this.reclaimed.size;
    }
    /**
     * @inheritDoc
     */
    async isFinished() {
        return ((await this.isEmpty()) && this.inProgress.size === 0 && (this.isSitemapFullyLoaded() || this.abortLoading));
    }
    /**
     * @inheritDoc
     */
    async isEmpty() {
        return this.reclaimed.size === 0 && this.urlQueueStream.readableLength === 0;
    }
    /**
     * @inheritDoc
     */
    handledCount() {
        return this.handledUrlCount;
    }
    /**
     * @inheritDoc
     */
    async persistState() {
        if (this.persistStateKey === undefined) {
            return;
        }
        this.store ?? (this.store = await key_value_store_1.KeyValueStore.open());
        const urlQueue = [];
        while (this.urlQueueStream.readableLength > 0) {
            const url = this.urlQueueStream.read();
            if (url === null) {
                break;
            }
            urlQueue.push(url);
        }
        for (const url of urlQueue) {
            this.urlQueueStream.push(url);
        }
        await this.store.setValue(this.persistStateKey, {
            sitemapParsingProgress: {
                pendingSitemapUrls: Array.from(this.sitemapParsingProgress.pendingSitemapUrls),
                inProgressSitemapUrl: this.sitemapParsingProgress.inProgressSitemapUrl,
                inProgressEntries: Array.from(this.sitemapParsingProgress.inProgressEntries),
            },
            urlQueue,
            reclaimed: [...this.inProgress, ...this.reclaimed], // In-progress and reclaimed requests will be both retried if state is restored
            requestData: Array.from(this.requestData.entries()),
            abortLoading: this.abortLoading,
        });
    }
    async restoreState() {
        await (0, utils_2.purgeDefaultStorages)({ onlyPurgeOnce: true });
        if (this.persistStateKey === undefined) {
            return;
        }
        this.store ?? (this.store = await key_value_store_1.KeyValueStore.open());
        const state = await this.store.getValue(this.persistStateKey);
        if (state === null) {
            return;
        }
        this.reclaimed = new Set(state.reclaimed);
        this.sitemapParsingProgress = {
            pendingSitemapUrls: new Set(state.sitemapParsingProgress.pendingSitemapUrls),
            inProgressSitemapUrl: state.sitemapParsingProgress.inProgressSitemapUrl,
            inProgressEntries: new Set(state.sitemapParsingProgress.inProgressEntries),
        };
        this.requestData = new Map(state.requestData ?? []);
        for (const url of state.urlQueue) {
            this.urlQueueStream.push(url);
        }
        this.abortLoading = state.abortLoading;
    }
    /**
     * @inheritDoc
     */
    async fetchNextRequest() {
        // Try to return a reclaimed request first
        let nextUrl = this.reclaimed.values().next().value;
        if (nextUrl) {
            this.reclaimed.delete(nextUrl);
        }
        else {
            // Otherwise read next url from the stream
            nextUrl = await this.readNextUrl();
            if (!nextUrl) {
                return null;
            }
            this.requestData.set(nextUrl, new request_1.Request({ url: nextUrl }));
        }
        this.inProgress.add(nextUrl);
        return this.requestData.get(nextUrl);
    }
    /**
     * @inheritDoc
     */
    async *[Symbol.asyncIterator]() {
        while ((!this.isSitemapFullyLoaded() && !this.abortLoading) || !(await this.isEmpty())) {
            const request = await this.fetchNextRequest();
            if (!request)
                break;
            yield request;
        }
    }
    /**
     * @inheritDoc
     */
    async reclaimRequest(request) {
        this.ensureInProgressAndNotReclaimed(request.url);
        this.reclaimed.add(request.url);
        this.inProgress.delete(request.url);
    }
    /**
     * @inheritDoc
     */
    async markRequestHandled(request) {
        this.handledUrlCount += 1;
        this.ensureInProgressAndNotReclaimed(request.url);
        this.inProgress.delete(request.url);
        this.requestData.delete(request.url);
    }
    ensureInProgressAndNotReclaimed(url) {
        if (!this.inProgress.has(url)) {
            throw new Error(`The request is not being processed (url: ${url})`);
        }
        if (this.reclaimed.has(url)) {
            throw new Error(`The request was already reclaimed (url: ${url})`);
        }
    }
}
exports.SitemapRequestList = SitemapRequestList;
//# sourceMappingURL=sitemap_request_list.js.map