"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProxyConfiguration = void 0;
const tslib_1 = require("tslib");
const log_1 = tslib_1.__importDefault(require("@apify/log"));
const utilities_1 = require("@apify/utilities");
const ow_1 = tslib_1.__importDefault(require("ow"));
/**
 * Internal class for tracking the proxy tier history for a specific domain.
 *
 * Predicts the best proxy tier for the next request based on the error history for different proxy tiers.
 */
class ProxyTierTracker {
    constructor(tieredProxyUrls) {
        Object.defineProperty(this, "histogram", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "currentTier", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        this.histogram = tieredProxyUrls.map(() => 0);
        this.currentTier = 0;
    }
    /**
     * Processes a single step of the algorithm and updates the current tier prediction based on the error history.
     */
    processStep() {
        this.histogram.forEach((x, i) => {
            if (this.currentTier === i)
                return;
            if (x > 0)
                this.histogram[i]--;
        });
        const left = this.currentTier > 0 ? this.histogram[this.currentTier - 1] : Infinity;
        const right = this.currentTier < this.histogram.length - 1 ? this.histogram[this.currentTier + 1] : Infinity;
        if (this.histogram[this.currentTier] > Math.min(left, right)) {
            this.currentTier = left <= right ? this.currentTier - 1 : this.currentTier + 1;
        }
        else if (this.histogram[this.currentTier] === left) {
            this.currentTier--;
        }
    }
    /**
     * Increases the error score for the given proxy tier. This raises the chance of picking a different proxy tier for the subsequent requests.
     *
     * The error score is increased by 10 for the given tier. This means that this tier will be disadvantaged for the next 10 requests (every new request prediction decreases the error score by 1).
     * @param tier The proxy tier to mark as problematic.
     */
    addError(tier) {
        this.histogram[tier] += 10;
    }
    /**
     * Returns the best proxy tier for the next request based on the error history for different proxy tiers.
     * @returns The proxy tier prediction
     */
    predictTier() {
        this.processStep();
        return this.currentTier;
    }
}
/**
 * Configures connection to a proxy server with the provided options. Proxy servers are used to prevent target websites from blocking
 * your crawlers based on IP address rate limits or blacklists. Setting proxy configuration in your crawlers automatically configures
 * them to use the selected proxies for all connections. You can get information about the currently used proxy by inspecting
 * the {@apilink ProxyInfo} property in your crawler's page function. There, you can inspect the proxy's URL and other attributes.
 *
 * If you want to use your own proxies, use the {@apilink ProxyConfigurationOptions.proxyUrls} option. Your list of proxy URLs will
 * be rotated by the configuration if this option is provided.
 *
 * **Example usage:**
 *
 * ```javascript
 *
 * const proxyConfiguration = new ProxyConfiguration({
 *   proxyUrls: ['...', '...'],
 * });
 *
 * const crawler = new CheerioCrawler({
 *   // ...
 *   proxyConfiguration,
 *   requestHandler({ proxyInfo }) {
 *      const usedProxyUrl = proxyInfo.url; // Getting the proxy URL
 *   }
 * })
 *
 * ```
 * @category Scaling
 */
class ProxyConfiguration {
    /**
     * Creates a {@apilink ProxyConfiguration} instance based on the provided options. Proxy servers are used to prevent target websites from
     * blocking your crawlers based on IP address rate limits or blacklists. Setting proxy configuration in your crawlers automatically configures
     * them to use the selected proxies for all connections.
     *
     * ```javascript
     * const proxyConfiguration = new ProxyConfiguration({
     *     proxyUrls: ['http://user:pass@proxy-1.com', 'http://user:pass@proxy-2.com'],
     * });
     *
     * const crawler = new CheerioCrawler({
     *   // ...
     *   proxyConfiguration,
     *   requestHandler({ proxyInfo }) {
     *       const usedProxyUrl = proxyInfo.url; // Getting the proxy URL
     *   }
     * })
     *
     * ```
     */
    constructor(options = {}) {
        Object.defineProperty(this, "isManInTheMiddle", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: false
        });
        Object.defineProperty(this, "nextCustomUrlIndex", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0
        });
        Object.defineProperty(this, "proxyUrls", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "tieredProxyUrls", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "usedProxyUrls", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: new Map()
        });
        Object.defineProperty(this, "newUrlFunction", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "log", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: log_1.default.child({ prefix: 'ProxyConfiguration' })
        });
        Object.defineProperty(this, "domainTiers", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: new Map()
        });
        const { validateRequired, ...rest } = options;
        (0, ow_1.default)(rest, ow_1.default.object.exactShape({
            proxyUrls: ow_1.default.optional.array.nonEmpty.ofType(ow_1.default.string.url),
            newUrlFunction: ow_1.default.optional.function,
            tieredProxyUrls: ow_1.default.optional.array.nonEmpty.ofType(ow_1.default.array.nonEmpty.ofType(ow_1.default.string.url)),
        }));
        const { proxyUrls, newUrlFunction, tieredProxyUrls } = options;
        if ([proxyUrls, newUrlFunction, tieredProxyUrls].filter((x) => x).length > 1)
            this._throwCannotCombineCustomMethods();
        if (!proxyUrls && !newUrlFunction && validateRequired)
            this._throwNoOptionsProvided();
        this.proxyUrls = proxyUrls;
        this.newUrlFunction = newUrlFunction;
        this.tieredProxyUrls = tieredProxyUrls;
    }
    /**
     * This function creates a new {@apilink ProxyInfo} info object.
     * It is used by CheerioCrawler and PuppeteerCrawler to generate proxy URLs and also to allow the user to inspect
     * the currently used proxy via the requestHandler parameter `proxyInfo`.
     * Use it if you want to work with a rich representation of a proxy URL.
     * If you need the URL string only, use {@apilink ProxyConfiguration.newUrl}.
     * @param [sessionId]
     *  Represents the identifier of user {@apilink Session} that can be managed by the {@apilink SessionPool} or
     *  you can use the Apify Proxy [Session](https://docs.apify.com/proxy#sessions) identifier.
     *  When the provided sessionId is a number, it's converted to a string. Property sessionId of
     *  {@apilink ProxyInfo} is always returned as a type string.
     *
     *  All the HTTP requests going through the proxy with the same session identifier
     *  will use the same target proxy server (i.e. the same IP address).
     *  The identifier must not be longer than 50 characters and include only the following: `0-9`, `a-z`, `A-Z`, `"."`, `"_"` and `"~"`.
     * @return Represents information about used proxy and its configuration.
     */
    async newProxyInfo(sessionId, options) {
        if (typeof sessionId === 'number')
            sessionId = `${sessionId}`;
        let url;
        let tier;
        if (this.tieredProxyUrls) {
            const { proxyUrl, proxyTier } = this._handleTieredUrl(sessionId ?? (0, utilities_1.cryptoRandomObjectId)(6), options);
            url = proxyUrl;
            tier = proxyTier;
        }
        else {
            url = await this.newUrl(sessionId, options);
        }
        if (!url)
            return undefined;
        const { username, password, port, hostname } = new URL(url);
        return {
            sessionId,
            url,
            username,
            password,
            hostname,
            port: port,
            proxyTier: tier,
        };
    }
    /**
     * Given a session identifier and a request / proxy tier, this function returns a new proxy URL based on the provided configuration options.
     * @param _sessionId Session identifier
     * @param options Options for the tiered proxy rotation
     * @returns An object with the proxy URL and the proxy tier used.
     */
    _handleTieredUrl(_sessionId, options) {
        if (!this.tieredProxyUrls)
            throw new Error('Tiered proxy URLs are not set');
        if (!options || (!options?.request && options?.proxyTier === undefined)) {
            const allProxyUrls = this.tieredProxyUrls.flat();
            return {
                proxyUrl: allProxyUrls[this.nextCustomUrlIndex++ % allProxyUrls.length],
            };
        }
        let tierPrediction = options.proxyTier;
        if (typeof tierPrediction !== 'number') {
            tierPrediction = this.predictProxyTier(options.request);
        }
        const proxyTier = this.tieredProxyUrls[tierPrediction];
        return {
            proxyUrl: proxyTier[this.nextCustomUrlIndex++ % proxyTier.length],
            proxyTier: tierPrediction,
        };
    }
    /**
     * Given a `Request` object, this function returns the tier of the proxy that should be used for the request.
     *
     * This returns `null` if `tieredProxyUrls` option is not set.
     */
    predictProxyTier(request) {
        var _a;
        if (!this.tieredProxyUrls)
            return null;
        const domain = new URL(request.url).hostname;
        if (!this.domainTiers.has(domain)) {
            this.domainTiers.set(domain, new ProxyTierTracker(this.tieredProxyUrls));
        }
        (_a = request.userData).__crawlee ?? (_a.__crawlee = {});
        const tracker = this.domainTiers.get(domain);
        if (typeof request.userData.__crawlee.lastProxyTier === 'number') {
            tracker.addError(request.userData.__crawlee.lastProxyTier);
        }
        const tierPrediction = tracker.predictTier();
        if (typeof request.userData.__crawlee.lastProxyTier === 'number' &&
            request.userData.__crawlee.lastProxyTier !== tierPrediction) {
            log_1.default.debug(`Changing proxy tier for domain "${domain}" from ${request.userData.__crawlee.lastProxyTier} to ${tierPrediction}.`);
        }
        request.userData.__crawlee.lastProxyTier = tierPrediction;
        request.userData.__crawlee.forefront = true;
        return tierPrediction;
    }
    /**
     * Returns a new proxy URL based on provided configuration options and the `sessionId` parameter.
     * @param [sessionId]
     *  Represents the identifier of user {@apilink Session} that can be managed by the {@apilink SessionPool} or
     *  you can use the Apify Proxy [Session](https://docs.apify.com/proxy#sessions) identifier.
     *  When the provided sessionId is a number, it's converted to a string.
     *
     *  All the HTTP requests going through the proxy with the same session identifier
     *  will use the same target proxy server (i.e. the same IP address).
     *  The identifier must not be longer than 50 characters and include only the following: `0-9`, `a-z`, `A-Z`, `"."`, `"_"` and `"~"`.
     * @return A string with a proxy URL, including authentication credentials and port number.
     *  For example, `http://bob:password123@proxy.example.com:8000`
     */
    async newUrl(sessionId, options) {
        if (typeof sessionId === 'number')
            sessionId = `${sessionId}`;
        if (this.newUrlFunction) {
            return (await this._callNewUrlFunction(sessionId, { request: options?.request })) ?? undefined;
        }
        if (this.tieredProxyUrls) {
            return this._handleTieredUrl(sessionId ?? (0, utilities_1.cryptoRandomObjectId)(6), options).proxyUrl;
        }
        return this._handleCustomUrl(sessionId);
    }
    /**
     * Handles custom url rotation with session
     */
    _handleCustomUrl(sessionId) {
        let customUrlToUse;
        if (!sessionId) {
            return this.proxyUrls[this.nextCustomUrlIndex++ % this.proxyUrls.length];
        }
        if (this.usedProxyUrls.has(sessionId)) {
            customUrlToUse = this.usedProxyUrls.get(sessionId);
        }
        else {
            customUrlToUse = this.proxyUrls[this.nextCustomUrlIndex++ % this.proxyUrls.length];
            this.usedProxyUrls.set(sessionId, customUrlToUse);
        }
        return customUrlToUse;
    }
    /**
     * Calls the custom newUrlFunction and checks format of its return value
     */
    async _callNewUrlFunction(sessionId, options) {
        const proxyUrl = await this.newUrlFunction(sessionId, options);
        try {
            if (proxyUrl) {
                new URL(proxyUrl); // eslint-disable-line no-new
            }
            return proxyUrl;
        }
        catch (err) {
            this._throwNewUrlFunctionInvalid(err);
        }
    }
    _throwNewUrlFunctionInvalid(err) {
        throw new Error(`The provided newUrlFunction did not return a valid URL.\nCause: ${err.message}`);
    }
    _throwCannotCombineCustomMethods() {
        throw new Error('Cannot combine custom proxies "options.proxyUrls" with custom generating function "options.newUrlFunction".');
    }
    _throwNoOptionsProvided() {
        throw new Error('One of "options.proxyUrls" or "options.newUrlFunction" needs to be provided.');
    }
}
exports.ProxyConfiguration = ProxyConfiguration;
//# sourceMappingURL=proxy_configuration.js.map