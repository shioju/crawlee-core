import type { EnqueueLinksOptions } from './enqueue_links';
import type { RequestOptions } from '../request';
import { Request } from '../request';
export { tryAbsoluteURL } from '@crawlee/utils';
export type UrlPatternObject = {
    glob?: string;
    regexp?: RegExp;
} & Pick<RequestOptions, 'method' | 'payload' | 'label' | 'userData' | 'headers'>;
export type PseudoUrlObject = {
    purl: string;
} & Pick<RequestOptions, 'method' | 'payload' | 'label' | 'userData' | 'headers'>;
export type PseudoUrlInput = string | PseudoUrlObject;
export type GlobObject = {
    glob: string;
} & Pick<RequestOptions, 'method' | 'payload' | 'label' | 'userData' | 'headers'>;
export type GlobInput = string | GlobObject;
export type RegExpObject = {
    regexp: RegExp;
} & Pick<RequestOptions, 'method' | 'payload' | 'label' | 'userData' | 'headers'>;
export type RegExpInput = RegExp | RegExpObject;
/**
 * @ignore
 */
export declare function updateEnqueueLinksPatternCache(item: GlobInput | RegExpInput | PseudoUrlInput, pattern: RegExpObject | GlobObject): void;
/**
 * Helper factory used in the `enqueueLinks()` and enqueueLinksByClickingElements() function
 * to construct RegExps from PseudoUrl strings.
 * @ignore
 */
export declare function constructRegExpObjectsFromPseudoUrls(pseudoUrls: readonly PseudoUrlInput[]): RegExpObject[];
/**
 * Helper factory used in the `enqueueLinks()` and enqueueLinksByClickingElements() function
 * to construct Glob objects from Glob pattern strings.
 * @ignore
 */
export declare function constructGlobObjectsFromGlobs(globs: readonly GlobInput[]): GlobObject[];
/**
 * @internal
 */
export declare function validateGlobPattern(glob: string): string;
/**
 * Helper factory used in the `enqueueLinks()` and enqueueLinksByClickingElements() function
 * to check RegExps input and return valid RegExps.
 * @ignore
 */
export declare function constructRegExpObjectsFromRegExps(regexps: readonly RegExpInput[]): RegExpObject[];
/**
 * @ignore
 */
export declare function createRequests(requestOptions: (string | RequestOptions)[], urlPatternObjects?: UrlPatternObject[], excludePatternObjects?: UrlPatternObject[], strategy?: EnqueueLinksOptions['strategy']): Request[];
export declare function filterRequestsByPatterns(requests: Request[], patterns?: UrlPatternObject[]): Request[];
/**
 * @ignore
 */
export declare function createRequestOptions(sources: (string | Record<string, unknown>)[], options?: Pick<EnqueueLinksOptions, 'label' | 'userData' | 'baseUrl' | 'skipNavigation' | 'strategy'>): RequestOptions[];
/**
 * Takes an Apify {@apilink RequestOptions} object and changes its attributes in a desired way. This user-function is used
 * {@apilink enqueueLinks} to modify requests before enqueuing them.
 */
export interface RequestTransform {
    /**
     * @param original Request options to be modified.
     * @returns The modified request options to enqueue.
     */
    (original: RequestOptions): Promise<RequestOptions | false | undefined | null>;
}
//# sourceMappingURL=shared.d.ts.map
