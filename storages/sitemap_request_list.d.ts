import type { IRequestList } from './request_list';
import { Request } from '../request';
export interface SitemapRequestListOptions {
    /**
     * List of sitemap URLs to parse.
     */
    sitemapUrls: string[];
    /**
     * Proxy URL to be used for sitemap loading.
     */
    proxyUrl?: string;
    /**
     * Key for persisting the state of the request list in the `KeyValueStore`.
     */
    persistStateKey?: string;
    /**
     * Abort signal to be used for sitemap loading.
     */
    signal?: AbortSignal;
    /**
     * Timeout for sitemap loading in milliseconds. If both `signal` and `timeoutMillis` are provided, either of them can abort the loading.
     */
    timeoutMillis?: number;
    /**
     * Maximum number of buffered URLs for the sitemap loading stream.
     * If the buffer is full, the stream will pause until the buffer is drained.
     *
     * @default 200
     */
    maxBufferSize?: number;
}
/**
 * A list of URLs to crawl parsed from a sitemap.
 *
 * The loading of the sitemap is performed in the background so that crawling can start before the sitemap is fully loaded.
 */
export declare class SitemapRequestList implements IRequestList {
    /**
     * Set of URLs that were returned by `fetchNextRequest()` and not marked as handled yet.
     * @internal
     */
    inProgress: Set<string>;
    /** Set of URLs for which `reclaimRequest()` was called. */
    private reclaimed;
    /**
     * Map of returned Request objects that have not been marked as handled yet.
     *
     * We use this to persist custom user fields on the in-progress (or reclaimed) requests.
     */
    private requestData;
    /**
     * Object for keeping track of the sitemap parsing progress.
     */
    private sitemapParsingProgress;
    /**
     * Object stream of URLs parsed from the sitemaps.
     * Using `highWaterMark`, this can manage the speed of the sitemap loading.
     *
     * Fetch the next URL to be processed using `fetchNextRequest()`.
     */
    private urlQueueStream;
    /**
     * Indicates whether the request list sitemap loading was aborted.
     *
     * If the loading was aborted before the sitemaps were fully loaded, the request list might be missing some URLs.
     * The `isSitemapFullyLoaded` method can be used to check if the sitemaps were fully loaded.
     *
     * If the loading is aborted and all the requests are handled, `isFinished()` will return `true`.
     */
    private abortLoading;
    /** Number of URLs that were marked as handled */
    private handledUrlCount;
    private persistStateKey?;
    private store?;
    /**
     * Proxy URL to be used for sitemap loading.
     */
    private proxyUrl;
    /**
     * Logger instance.
     */
    private log;
    /** @internal */
    private constructor();
    /**
     * Adds a URL to the queue of parsed URLs.
     *
     * Blocks if the stream is full until it is drained.
     */
    private pushNextUrl;
    /**
     * Reads the next URL from the queue of parsed URLs.
     *
     * If the stream is empty, blocks until a new URL is pushed.
     * @returns The next URL from the queue or `null` if we have read all URLs.
     */
    private readNextUrl;
    /**
     * Indicates whether the background processing of sitemap contents has successfully finished.
     *
     * If this is `false`, the background processing is either still in progress or was aborted.
     */
    isSitemapFullyLoaded(): boolean;
    /**
     * Start processing the sitemaps and loading the URLs.
     *
     * Resolves once all the sitemaps URLs have been fully loaded (sets `isSitemapFullyLoaded` to `true`).
     */
    private load;
    /**
     * Open a sitemap and start processing it.
     *
     * Resolves to a new instance of `SitemapRequestList`, which **might not be fully loaded yet** - i.e. the sitemap might still be loading in the background.
     *
     * Track the loading progress using the `isSitemapFullyLoaded` property.
     */
    static open(options: SitemapRequestListOptions): Promise<SitemapRequestList>;
    /**
     * @inheritDoc
     */
    length(): number;
    /**
     * @inheritDoc
     */
    isFinished(): Promise<boolean>;
    /**
     * @inheritDoc
     */
    isEmpty(): Promise<boolean>;
    /**
     * @inheritDoc
     */
    handledCount(): number;
    /**
     * @inheritDoc
     */
    persistState(): Promise<void>;
    private restoreState;
    /**
     * @inheritDoc
     */
    fetchNextRequest(): Promise<Request | null>;
    /**
     * @inheritDoc
     */
// @ts-ignore optional peer dependency or compatibility with es2022
    [Symbol.asyncIterator](): AsyncGenerator<Request<import("@crawlee/utils").Dictionary>, void, unknown>;
    /**
     * @inheritDoc
     */
    reclaimRequest(request: Request): Promise<void>;
    /**
     * @inheritDoc
     */
    markRequestHandled(request: Request): Promise<void>;
    private ensureInProgressAndNotReclaimed;
}
//# sourceMappingURL=sitemap_request_list.d.ts.map