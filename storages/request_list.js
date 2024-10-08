"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RequestList = exports.REQUESTS_PERSISTENCE_KEY = exports.STATE_PERSISTENCE_KEY = void 0;
const tslib_1 = require("tslib");
const utils_1 = require("@crawlee/utils");
const ow_1 = tslib_1.__importStar(require("ow"));
const key_value_store_1 = require("./key_value_store");
const utils_2 = require("./utils");
const configuration_1 = require("../configuration");
const log_1 = require("../log");
const request_1 = require("../request");
const serialization_1 = require("../serialization");
/** @internal */
exports.STATE_PERSISTENCE_KEY = 'REQUEST_LIST_STATE';
/** @internal */
exports.REQUESTS_PERSISTENCE_KEY = 'REQUEST_LIST_REQUESTS';
const CONTENT_TYPE_BINARY = 'application/octet-stream';
/**
 * Represents a static list of URLs to crawl.
 * The URLs can be provided either in code or parsed from a text file hosted on the web.
 * `RequestList` is used by {@apilink BasicCrawler}, {@apilink CheerioCrawler}, {@apilink PuppeteerCrawler}
 * and {@apilink PlaywrightCrawler} as a source of URLs to crawl.
 *
 * Each URL is represented using an instance of the {@apilink Request} class.
 * The list can only contain unique URLs. More precisely, it can only contain `Request` instances
 * with distinct `uniqueKey` properties. By default, `uniqueKey` is generated from the URL, but it can also be overridden.
 * To add a single URL to the list multiple times, corresponding {@apilink Request} objects will need to have different
 * `uniqueKey` properties. You can use the `keepDuplicateUrls` option to do this for you when initializing the
 * `RequestList` from sources.
 *
 * `RequestList` doesn't have a public constructor, you need to create it with the asynchronous {@apilink RequestList.open} function. After
 * the request list is created, no more URLs can be added to it.
 * Unlike {@apilink RequestQueue}, `RequestList` is static but it can contain even millions of URLs.
 * > Note that `RequestList` can be used together with `RequestQueue` by the same crawler.
 * > In such cases, each request from `RequestList` is enqueued into `RequestQueue` first and then consumed from the latter.
 * > This is necessary to avoid the same URL being processed more than once (from the list first and then possibly from the queue).
 * > In practical terms, such a combination can be useful when there is a large number of initial URLs,
 * > but more URLs would be added dynamically by the crawler.
 *
 * `RequestList` has an internal state where it stores information about which requests were already handled,
 * which are in progress and which were reclaimed. The state may be automatically persisted to the default
 * {@apilink KeyValueStore} by setting the `persistStateKey` option so that if the Node.js process is restarted,
 * the crawling can continue where it left off. The automated persisting is launched upon receiving the `persistState`
 * event that is periodically emitted by {@apilink EventManager}.
 *
 * The internal state is closely tied to the provided sources (URLs). If the sources change on crawler restart, the state will become corrupted and
 * `RequestList` will raise an exception. This typically happens when the sources is a list of URLs downloaded from the web.
 * In such case, use the `persistRequestsKey` option in conjunction with `persistStateKey`,
 * to make the `RequestList` store the initial sources to the default key-value store and load them after restart,
 * which will prevent any issues that a live list of URLs might cause.
 *
 * **Basic usage:**
 * ```javascript
 * const requestList = await RequestList.open('my-request-list', [
 *     'http://www.example.com/page-1',
 *     { url: 'http://www.example.com/page-2', method: 'POST', userData: { foo: 'bar' }},
 *     { requestsFromUrl: 'http://www.example.com/my-url-list.txt', userData: { isFromUrl: true } },
 * ]);
 * ```
 *
 * **Advanced usage:**
 * ```javascript
 * const requestList = await RequestList.open(null, [
 *     // Separate requests
 *     { url: 'http://www.example.com/page-1', method: 'GET', headers: { ... } },
 *     { url: 'http://www.example.com/page-2', userData: { foo: 'bar' }},
 *
 *     // Bulk load of URLs from file `http://www.example.com/my-url-list.txt`
 *     // Note that all URLs must start with http:// or https://
 *     { requestsFromUrl: 'http://www.example.com/my-url-list.txt', userData: { isFromUrl: true } },
 * ], {
 *     // Persist the state to avoid re-crawling which can lead to data duplications.
 *     // Keep in mind that the sources have to be immutable or this will throw an error.
 *     persistStateKey: 'my-state',
 * });
 * ```
 * @category Sources
 */
class RequestList {
    /**
     * To create new instance of `RequestList` we need to use `RequestList.open()` factory method.
     * @param options All `RequestList` configuration options
     * @internal
     */
    constructor(options = {}) {
        Object.defineProperty(this, "log", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: log_1.log.child({ prefix: 'RequestList' })
        });
        /**
         * Array of all requests from all sources, in the order as they appeared in sources.
         * All requests in the array have distinct uniqueKey!
         * @internal
         */
        Object.defineProperty(this, "requests", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: []
        });
        /** Index to the next item in requests array to fetch. All previous requests are either handled or in progress. */
        Object.defineProperty(this, "nextIndex", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0
        });
        /** Dictionary, key is Request.uniqueKey, value is corresponding index in the requests array. */
        Object.defineProperty(this, "uniqueKeyToIndex", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: {}
        });
        /**
         * Set of `uniqueKey`s of requests that were returned by fetchNextRequest().
         * @internal
         */
        Object.defineProperty(this, "inProgress", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: new Set()
        });
        /**
         * Set of `uniqueKey`s of requests for which reclaimRequest() was called.
         * @internal
         */
        Object.defineProperty(this, "reclaimed", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: new Set()
        });
        /**
         * Starts as true because until we handle the first request, the list is effectively persisted by doing nothing.
         * @internal
         */
        Object.defineProperty(this, "isStatePersisted", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: true
        });
        /**
         * Starts as false because we don't know yet and sources might change in the meantime (eg. download from live list).
         * @internal
         */
        Object.defineProperty(this, "areRequestsPersisted", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: false
        });
        Object.defineProperty(this, "isLoading", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: false
        });
        Object.defineProperty(this, "isInitialized", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: false
        });
        Object.defineProperty(this, "persistStateKey", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "persistRequestsKey", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "initialState", {
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
        Object.defineProperty(this, "keepDuplicateUrls", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "sources", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "sourcesFunction", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "proxyConfiguration", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "events", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        const { sources, sourcesFunction, persistStateKey, persistRequestsKey, state, proxyConfiguration, keepDuplicateUrls = false, config = configuration_1.Configuration.getGlobalConfig(), } = options;
        if (!(sources || sourcesFunction)) {
            throw new ow_1.ArgumentError('At least one of "sources" or "sourcesFunction" must be provided.', this.constructor);
        }
        (0, ow_1.default)(options, ow_1.default.object.exactShape({
            sources: ow_1.default.optional.array, // check only for array and not subtypes to avoid iteration over the whole thing
            sourcesFunction: ow_1.default.optional.function,
            persistStateKey: ow_1.default.optional.string,
            persistRequestsKey: ow_1.default.optional.string,
            state: ow_1.default.optional.object.exactShape({
                nextIndex: ow_1.default.number,
                nextUniqueKey: ow_1.default.string,
                inProgress: ow_1.default.object,
            }),
            keepDuplicateUrls: ow_1.default.optional.boolean,
            proxyConfiguration: ow_1.default.optional.object,
        }));
        this.persistStateKey = persistStateKey ? `SDK_${persistStateKey}` : persistStateKey;
        this.persistRequestsKey = persistRequestsKey ? `SDK_${persistRequestsKey}` : persistRequestsKey;
        this.initialState = state;
        this.events = config.getEventManager();
        // If this option is set then all requests will get a pre-generated unique ID and duplicate URLs will be kept in the list.
        this.keepDuplicateUrls = keepDuplicateUrls;
        // Will be empty after initialization to save memory.
        this.sources = sources ? [...sources] : [];
        this.sourcesFunction = sourcesFunction;
        // The proxy configuration used for `requestsFromUrl` requests.
        this.proxyConfiguration = proxyConfiguration;
    }
    /**
     * Loads all remote sources of URLs and potentially starts periodic state persistence.
     * This function must be called before you can start using the instance in a meaningful way.
     */
    async initialize() {
        if (this.isLoading) {
            throw new Error('RequestList sources are already loading or were loaded.');
        }
        this.isLoading = true;
        await (0, utils_2.purgeDefaultStorages)({ onlyPurgeOnce: true });
        const [state, persistedRequests] = await this._loadStateAndPersistedRequests();
        // Add persisted requests / new sources in a memory efficient way because with very
        // large lists, we were running out of memory.
        if (persistedRequests) {
            await this._addPersistedRequests(persistedRequests);
        }
        else {
            await this._addRequestsFromSources();
        }
        this._restoreState(state);
        this.isInitialized = true;
        if (this.persistRequestsKey && !this.areRequestsPersisted)
            await this._persistRequests();
        if (this.persistStateKey) {
            this.events.on("persistState" /* EventType.PERSIST_STATE */, this.persistState.bind(this));
        }
        return this;
    }
    /**
     * Adds previously persisted Requests, as retrieved from the key-value store.
     * This needs to be done in a memory efficient way. We should update the input
     * to a Stream once apify-client supports streams.
     */
    async _addPersistedRequests(persistedRequests) {
        // We don't need the sources so we purge them to
        // prevent them from hanging in memory.
        for (let i = 0; i < this.sources.length; i++) {
            delete this.sources[i];
        }
        this.sources = [];
        this.areRequestsPersisted = true;
        const requestStream = (0, serialization_1.createDeserialize)(persistedRequests);
        for await (const request of requestStream) {
            this._addRequest(request);
        }
    }
    /**
     * Add Requests from both options.sources and options.sourcesFunction.
     * This function is called only when persisted sources were not loaded.
     * We need to avoid keeping both sources and requests in memory
     * to reduce memory footprint with very large sources.
     */
    async _addRequestsFromSources() {
        // We'll load all sources in sequence to ensure that they get loaded in the right order.
        const sourcesCount = this.sources.length;
        for (let i = 0; i < sourcesCount; i++) {
            const source = this.sources[i];
            // Using delete here to drop the original object ASAP to free memory
            // .pop would reverse the array and .shift is SLOW.
            delete this.sources[i];
            if (typeof source === 'object' && source.requestsFromUrl) {
                const fetchedRequests = await this._fetchRequestsFromUrl(source);
                await this._addFetchedRequests(source, fetchedRequests);
            }
            else {
                this._addRequest(source);
            }
        }
        // Drop the original array full of empty indexes.
        this.sources = [];
        if (this.sourcesFunction) {
            try {
                const sourcesFromFunction = await this.sourcesFunction();
                const sourcesFromFunctionCount = sourcesFromFunction.length;
                for (let i = 0; i < sourcesFromFunctionCount; i++) {
                    const source = sourcesFromFunction.shift();
                    this._addRequest(source);
                }
            }
            catch (e) {
                const err = e;
                throw new Error(`Loading requests with sourcesFunction failed.\nCause: ${err.message}`);
            }
        }
    }
    /**
     * @inheritDoc
     */
    async persistState() {
        if (!this.persistStateKey) {
            throw new Error('Cannot persist state. options.persistStateKey is not set.');
        }
        if (this.isStatePersisted)
            return;
        try {
            this.store ?? (this.store = await key_value_store_1.KeyValueStore.open());
            await this.store.setValue(this.persistStateKey, this.getState());
            this.isStatePersisted = true;
        }
        catch (e) {
            const err = e;
            this.log.exception(err, 'Attempted to persist state, but failed.');
        }
    }
    /**
     * Unlike persistState(), this is used only internally, since the sources
     * are automatically persisted at RequestList initialization (if the persistRequestsKey is set),
     * but there's no reason to persist it again afterwards, because RequestList is immutable.
     */
    async _persistRequests() {
        const serializedRequests = await (0, serialization_1.serializeArray)(this.requests);
        this.store ?? (this.store = await key_value_store_1.KeyValueStore.open());
        await this.store.setValue(this.persistRequestsKey, serializedRequests, { contentType: CONTENT_TYPE_BINARY });
        this.areRequestsPersisted = true;
    }
    /**
     * Restores RequestList state from a state object.
     */
    _restoreState(state) {
        // If there's no state it means we've not persisted any (yet).
        if (!state)
            return;
        // Restore previous state.
        if (typeof state.nextIndex !== 'number' || state.nextIndex < 0) {
            throw new Error('The state object is invalid: nextIndex must be a non-negative number.');
        }
        if (state.nextIndex > this.requests.length) {
            throw new Error('The state object is not consistent with RequestList, too few requests loaded.');
        }
        if (state.nextIndex < this.requests.length &&
            this.requests[state.nextIndex].uniqueKey !== state.nextUniqueKey) {
            throw new Error('The state object is not consistent with RequestList the order of URLs seems to have changed.');
        }
        const deleteFromInProgress = [];
        state.inProgress.forEach((uniqueKey) => {
            const index = this.uniqueKeyToIndex[uniqueKey];
            if (typeof index !== 'number') {
                throw new Error('The state object is not consistent with RequestList. Unknown uniqueKey is present in the state.');
            }
            if (index >= state.nextIndex) {
                deleteFromInProgress.push(uniqueKey);
            }
        });
        this.nextIndex = state.nextIndex;
        this.inProgress = new Set(state.inProgress);
        // WORKAROUND:
        // It happened to some users that state object contained something like:
        // {
        //   "nextIndex": 11308,
        //   "nextUniqueKey": "https://www.anychart.com",
        //   "inProgress": {
        //      "https://www.ams360.com": true,
        //      ...
        //        "https://www.anychart.com": true,
        // }
        // Which then caused error "The request is not being processed (uniqueKey: https://www.anychart.com)"
        // As a workaround, we just remove all inProgress requests whose index >= nextIndex,
        // since they will be crawled again.
        if (deleteFromInProgress.length) {
            this.log.warning("RequestList's in-progress field is not consistent, skipping invalid in-progress entries", {
                deleteFromInProgress,
            });
            for (const uniqueKey of deleteFromInProgress) {
                this.inProgress.delete(uniqueKey);
            }
        }
        // All in-progress requests need to be re-crawled
        this.reclaimed = new Set(this.inProgress);
    }
    /**
     * Attempts to load state and requests using the `RequestList` configuration
     * and returns a tuple of [state, requests] where each may be null if not loaded.
     */
    async _loadStateAndPersistedRequests() {
        let state;
        let persistedRequests;
        if (this.initialState) {
            state = this.initialState;
            this.log.debug('Loaded state from options.state argument.');
        }
        else if (this.persistStateKey) {
            state = await this._getPersistedState(this.persistStateKey);
            if (state)
                this.log.debug('Loaded state from key value store using the persistStateKey.');
        }
        if (this.persistRequestsKey) {
            persistedRequests = await this._getPersistedState(this.persistRequestsKey);
            if (persistedRequests)
                this.log.debug('Loaded requests from key value store using the persistRequestsKey.');
        }
        return [state, persistedRequests];
    }
    /**
     * Returns an object representing the internal state of the `RequestList` instance.
     * Note that the object's fields can change in future releases.
     */
    getState() {
        this._ensureIsInitialized();
        return {
            nextIndex: this.nextIndex,
            nextUniqueKey: this.nextIndex < this.requests.length ? this.requests[this.nextIndex].uniqueKey : null,
            inProgress: [...this.inProgress],
        };
    }
    /**
     * @inheritDoc
     */
    async isEmpty() {
        this._ensureIsInitialized();
        return this.reclaimed.size === 0 && this.nextIndex >= this.requests.length;
    }
    /**
     * @inheritDoc
     */
    async isFinished() {
        this._ensureIsInitialized();
        return this.inProgress.size === 0 && this.nextIndex >= this.requests.length;
    }
    /**
     * @inheritDoc
     */
    async fetchNextRequest() {
        this._ensureIsInitialized();
        // First return reclaimed requests if any.
        const uniqueKey = this.reclaimed.values().next().value;
        if (uniqueKey) {
            this.reclaimed.delete(uniqueKey);
            const index = this.uniqueKeyToIndex[uniqueKey];
            return this.ensureRequest(this.requests[index], index);
        }
        // Otherwise return next request.
        if (this.nextIndex < this.requests.length) {
            const index = this.nextIndex;
            const request = this.requests[index];
            this.inProgress.add(request.uniqueKey);
            this.nextIndex++;
            this.isStatePersisted = false;
            return this.ensureRequest(request, index);
        }
        return null;
    }
    /**
     * @inheritDoc
     */
    async *[Symbol.asyncIterator]() {
        while (true) {
            const req = await this.fetchNextRequest();
            if (!req)
                break;
            yield req;
        }
    }
    ensureRequest(requestLike, index) {
        if (requestLike instanceof request_1.Request) {
            return requestLike;
        }
        this.requests[index] = new request_1.Request(requestLike);
        return this.requests[index];
    }
    /**
     * @inheritDoc
     */
    async markRequestHandled(request) {
        const { uniqueKey } = request;
        this._ensureUniqueKeyValid(uniqueKey);
        this._ensureInProgressAndNotReclaimed(uniqueKey);
        this._ensureIsInitialized();
        this.inProgress.delete(uniqueKey);
        this.isStatePersisted = false;
    }
    /**
     * @inheritDoc
     */
    async reclaimRequest(request) {
        const { uniqueKey } = request;
        this._ensureUniqueKeyValid(uniqueKey);
        this._ensureInProgressAndNotReclaimed(uniqueKey);
        this._ensureIsInitialized();
        this.reclaimed.add(uniqueKey);
    }
    /**
     * Adds all fetched requests from a URL from a remote resource.
     */
    async _addFetchedRequests(source, fetchedRequests) {
        const { requestsFromUrl, regex } = source;
        const originalLength = this.requests.length;
        fetchedRequests.forEach((request) => this._addRequest(request));
        const fetchedCount = fetchedRequests.length;
        const importedCount = this.requests.length - originalLength;
        this.log.info('Fetched and loaded Requests from a remote resource.', {
            requestsFromUrl,
            regex,
            fetchedCount,
            importedCount,
            duplicateCount: fetchedCount - importedCount,
            sample: JSON.stringify(fetchedRequests.slice(0, 5)),
        });
    }
    async _getPersistedState(key) {
        this.store ?? (this.store = await key_value_store_1.KeyValueStore.open());
        const state = await this.store.getValue(key);
        return state;
    }
    /**
     * Fetches URLs from requestsFromUrl and returns them in format of list of requests
     */
    async _fetchRequestsFromUrl(source) {
        const { requestsFromUrl, regex, ...sharedOpts } = source;
        // Download remote resource and parse URLs.
        let urlsArr;
        try {
            urlsArr = await this._downloadListOfUrls({
                url: requestsFromUrl,
                urlRegExp: regex,
                proxyUrl: await this.proxyConfiguration?.newUrl(),
            });
        }
        catch (err) {
            throw new Error(`Cannot fetch a request list from ${requestsFromUrl}: ${err}`);
        }
        // Skip if resource contained no URLs.
        if (!urlsArr.length) {
            this.log.warning('The fetched list contains no valid URLs.', { requestsFromUrl, regex });
            return [];
        }
        return urlsArr.map((url) => ({ url, ...sharedOpts }));
    }
    /**
     * Adds given request.
     * If the `source` parameter is a string or plain object and not an instance
     * of a `Request`, then the function creates a `Request` instance.
     */
    _addRequest(source) {
        let request;
        const type = typeof source;
        if (type === 'string') {
            request = { url: source };
        }
        else if (source instanceof request_1.Request) {
            request = source;
        }
        else if (source && type === 'object') {
            request = source;
        }
        else {
            throw new Error(`Cannot create Request from type: ${type}`);
        }
        const hasUniqueKey = Reflect.has(Object(source), 'uniqueKey');
        request.uniqueKey ?? (request.uniqueKey = request_1.Request.computeUniqueKey(request));
        // Add index to uniqueKey if duplicates are to be kept
        if (this.keepDuplicateUrls && !hasUniqueKey) {
            request.uniqueKey += `-${this.requests.length}`;
        }
        const { uniqueKey } = request;
        this._ensureUniqueKeyValid(uniqueKey);
        // Skip requests with duplicate uniqueKey
        if (!this.uniqueKeyToIndex.hasOwnProperty(uniqueKey)) {
            this.uniqueKeyToIndex[uniqueKey] = this.requests.length;
            this.requests.push(request);
        }
        else if (this.keepDuplicateUrls) {
            this.log.warning(`Duplicate uniqueKey: ${uniqueKey} found while the keepDuplicateUrls option was set. Check your sources' unique keys.`);
        }
    }
    /**
     * Helper function that validates unique key.
     * Throws an error if uniqueKey is not a non-empty string.
     */
    _ensureUniqueKeyValid(uniqueKey) {
        if (typeof uniqueKey !== 'string' || !uniqueKey) {
            throw new Error("Request object's uniqueKey must be a non-empty string");
        }
    }
    /**
     * Checks that request is not reclaimed and throws an error if so.
     */
    _ensureInProgressAndNotReclaimed(uniqueKey) {
        if (!this.inProgress.has(uniqueKey)) {
            throw new Error(`The request is not being processed (uniqueKey: ${uniqueKey})`);
        }
        if (this.reclaimed.has(uniqueKey)) {
            throw new Error(`The request was already reclaimed (uniqueKey: ${uniqueKey})`);
        }
    }
    /**
     * Throws an error if request list wasn't initialized.
     */
    _ensureIsInitialized() {
        if (!this.isInitialized) {
            throw new Error('RequestList is not initialized; you must call "await requestList.initialize()" before using it!');
        }
    }
    /**
     * Returns the total number of unique requests present in the `RequestList`.
     */
    length() {
        this._ensureIsInitialized();
        return this.requests.length;
    }
    /**
     * @inheritDoc
     */
    handledCount() {
        this._ensureIsInitialized();
        return this.nextIndex - this.inProgress.size;
    }
    /**
     * Opens a request list and returns a promise resolving to an instance
     * of the {@apilink RequestList} class that is already initialized.
     *
     * {@apilink RequestList} represents a list of URLs to crawl, which is always stored in memory.
     * To enable picking up where left off after a process restart, the request list sources
     * are persisted to the key-value store at initialization of the list. Then, while crawling,
     * a small state object is regularly persisted to keep track of the crawling status.
     *
     * For more details and code examples, see the {@apilink RequestList} class.
     *
     * **Example usage:**
     *
     * ```javascript
     * const sources = [
     *     'https://www.example.com',
     *     'https://www.google.com',
     *     'https://www.bing.com'
     * ];
     *
     * const requestList = await RequestList.open('my-name', sources);
     * ```
     *
     * @param listNameOrOptions
     *   Name of the request list to be opened, or the options object. Setting a name enables the `RequestList`'s
     *   state to be persisted in the key-value store. This is useful in case of a restart or migration. Since `RequestList`
     *   is only stored in memory, a restart or migration wipes it clean. Setting a name will enable the `RequestList`'s
     *   state to survive those situations and continue where it left off.
     *
     *   The name will be used as a prefix in key-value store, producing keys such as `NAME-REQUEST_LIST_STATE`
     *   and `NAME-REQUEST_LIST_SOURCES`.
     *
     *   If `null`, the list will not be persisted and will only be stored in memory. Process restart
     *   will then cause the list to be crawled again from the beginning. We suggest always using a name.
     * @param [sources]
     *  An array of sources of URLs for the {@apilink RequestList}. It can be either an array of strings,
     *  plain objects that define at least the `url` property, or an array of {@apilink Request} instances.
     *
     *  **IMPORTANT:** The `sources` array will be consumed (left empty) after {@apilink RequestList} initializes.
     *  This is a measure to prevent memory leaks in situations when millions of sources are
     *  added.
     *
     *  Additionally, the `requestsFromUrl` property may be used instead of `url`,
     *  which will instruct {@apilink RequestList} to download the source URLs from a given remote location.
     *  The URLs will be parsed from the received response. In this case you can limit the URLs
     *  using `regex` parameter containing regular expression pattern for URLs to be included.
     *
     *  For details, see the {@apilink RequestListOptions.sources}
     * @param [options]
     *   The {@apilink RequestList} options. Note that the `listName` parameter supersedes
     *   the {@apilink RequestListOptions.persistStateKey} and {@apilink RequestListOptions.persistRequestsKey}
     *   options and the `sources` parameter supersedes the {@apilink RequestListOptions.sources} option.
     */
    static async open(listNameOrOptions, sources, options = {}) {
        if (listNameOrOptions != null && typeof listNameOrOptions === 'object') {
            options = { ...listNameOrOptions, ...options };
            const rl = new RequestList(options);
            await rl.initialize();
            return rl;
        }
        const listName = listNameOrOptions;
        (0, ow_1.default)(listName, ow_1.default.optional.any(ow_1.default.string, ow_1.default.null));
        (0, ow_1.default)(sources, ow_1.default.array);
        (0, ow_1.default)(options, ow_1.default.object.is((v) => !Array.isArray(v)));
        const rl = new RequestList({
            ...options,
            persistStateKey: listName ? `${listName}-${exports.STATE_PERSISTENCE_KEY}` : options.persistStateKey,
            persistRequestsKey: listName ? `${listName}-${exports.REQUESTS_PERSISTENCE_KEY}` : options.persistRequestsKey,
            sources: sources ?? options.sources,
        });
        await rl.initialize();
        return rl;
    }
    /**
     * @internal wraps public utility for mocking purposes
     */
    async _downloadListOfUrls(options) {
        return (0, utils_1.downloadListOfUrls)(options);
    }
}
exports.RequestList = RequestList;
//# sourceMappingURL=request_list.js.map