import type { Dictionary } from '@crawlee/types';
import type { RequestQueueOperationInfo, RequestProviderOptions } from './request_provider';
import { RequestProvider } from './request_provider';
import { Configuration } from '../configuration';
import type { Request } from '../request';
declare class RequestQueue extends RequestProvider {
    private _listHeadAndLockPromise;
    constructor(options: RequestProviderOptions, config?: Configuration);
    /**
     * Caches information about request to beware of unneeded addRequest() calls.
     */
    protected _cacheRequest(cacheKey: string, queueOperationInfo: RequestQueueOperationInfo): void;
    /**
     * Returns a next request in the queue to be processed, or `null` if there are no more pending requests.
     *
     * Once you successfully finish processing of the request, you need to call
     * {@apilink RequestQueue.markRequestHandled}
     * to mark the request as handled in the queue. If there was some error in processing the request,
     * call {@apilink RequestQueue.reclaimRequest} instead,
     * so that the queue will give the request to some other consumer in another call to the `fetchNextRequest` function.
     *
     * Note that the `null` return value doesn't mean the queue processing finished,
     * it means there are currently no pending requests.
     * To check whether all requests in queue were finished,
     * use {@apilink RequestQueue.isFinished} instead.
     *
     * @returns
     *   Returns the request object or `null` if there are no more pending requests.
     */
    fetchNextRequest<T extends Dictionary = Dictionary>(): Promise<Request<T> | null>;
    reclaimRequest(...args: Parameters<RequestProvider['reclaimRequest']>): ReturnType<RequestProvider['reclaimRequest']>;
    protected ensureHeadIsNonEmpty(): Promise<void>;
    private _listHeadAndLock;
    private getOrHydrateRequest;
    private _prolongRequestLock;
    protected _reset(): void;
    protected _maybeAddRequestToQueueHead(): void;
    protected _clearPossibleLocks(): Promise<void>;
    static open(...args: Parameters<typeof RequestProvider.open>): Promise<RequestQueue>;
}
export { RequestQueue as RequestQueueV2 };
//# sourceMappingURL=request_queue_v2.d.ts.map