import type { Log } from '@apify/log';
import { ErrorTracker } from './error_tracker';
import { Configuration } from '../configuration';
import { KeyValueStore } from '../storages/key_value_store';
/**
 * @ignore
 */
declare class Job {
    private lastRunAt;
    private runs;
    private durationMillis?;
    run(): number;
    finish(): number;
    retryCount(): number;
}
/**
 * Persistence-related options to control how and when crawler's data gets persisted.
 */
export interface PersistenceOptions {
    /**
     * Use this flag to disable or enable periodic persistence to key value store.
     * @default true
     */
    enable?: boolean;
}
/**
 * The statistics class provides an interface to collecting and logging run
 * statistics for requests.
 *
 * All statistic information is saved on key value store
 * under the key `SDK_CRAWLER_STATISTICS_*`, persists between
 * migrations and abort/resurrect
 *
 * @category Crawlers
 */
export declare class Statistics {
    private static id;
    /**
     * An error tracker for final retry errors.
     */
    errorTracker: ErrorTracker;
    /**
     * An error tracker for retry errors prior to the final retry.
     */
    errorTrackerRetry: ErrorTracker;
    /**
     * Statistic instance id.
     */
    readonly id: number;
    /**
     * Current statistic state used for doing calculations on {@apilink Statistics.calculate} calls
     */
    state: StatisticState;
    /**
     * Contains the current retries histogram. Index 0 means 0 retries, index 2, 2 retries, and so on
     */
    readonly requestRetryHistogram: number[];
    /**
     * Contains the associated Configuration instance
     */
    private readonly config;
    protected keyValueStore?: KeyValueStore;
    protected persistStateKey: string;
    private logIntervalMillis;
    private logMessage;
    private listener;
    private requestsInProgress;
    private readonly log;
    private instanceStart;
    private logInterval;
    private events;
    private persistenceOptions;
    /**
     * @internal
     */
    constructor(options?: StatisticsOptions);
    /**
     * Set the current statistic instance to pristine values
     */
    reset(): void;
    /**
     * @param options - Override the persistence options provided in the constructor
     */
    resetStore(options?: PersistenceOptions): Promise<void>;
    /**
     * Increments the status code counter.
     */
    registerStatusCode(code: number): void;
    /**
     * Starts a job
     * @ignore
     */
    startJob(id: number | string): void;
    /**
     * Mark job as finished and sets the state
     * @ignore
     */
    finishJob(id: number | string): void;
    /**
     * Mark job as failed and sets the state
     * @ignore
     */
    failJob(id: number | string): void;
    /**
     * Calculate the current statistics
     */
    calculate(): {
        requestAvgFailedDurationMillis: number;
        requestAvgFinishedDurationMillis: number;
        requestsFinishedPerMinute: number;
        requestsFailedPerMinute: number;
        requestTotalDurationMillis: number;
        requestsTotal: number;
        crawlerRuntimeMillis: number;
    };
    /**
     * Initializes the key value store for persisting the statistics,
     * displaying the current state in predefined intervals
     */
    startCapturing(): Promise<void>;
    /**
     * Stops logging and remove event listeners, then persist
     */
    stopCapturing(): Promise<void>;
    protected _saveRetryCountForJob(job: Job): void;
    /**
     * Persist internal state to the key value store
     * @param options - Override the persistence options provided in the constructor
     */
    persistState(options?: PersistenceOptions): Promise<void>;
    /**
     * Loads the current statistic from the key value store if any
     */
    protected _maybeLoadStatistics(): Promise<void>;
    protected _teardown(): void;
    /**
     * Make this class serializable when called with `JSON.stringify(statsInstance)` directly
     * or through `keyValueStore.setValue('KEY', statsInstance)`
     */
    toJSON(): StatisticPersistedState;
}
/**
 * Configuration for the {@apilink Statistics} instance used by the crawler
 */
export interface StatisticsOptions {
    /**
     * Interval in seconds to log the current statistics
     * @default 60
     */
    logIntervalSecs?: number;
    /**
     * Message to log with the current statistics
     * @default 'Statistics'
     */
    logMessage?: string;
    /**
     * Parent logger instance, the statistics will create a child logger from this.
     * @default crawler.log
     */
    log?: Log;
    /**
     * Key value store instance to persist the statistics.
     * If not provided, the default one will be used when capturing starts
     */
    keyValueStore?: KeyValueStore;
    /**
     * Configuration instance to use
     * @default Configuration.getGlobalConfig()
     */
    config?: Configuration;
    /**
     * Control how and when to persist the statistics.
     */
    persistenceOptions?: PersistenceOptions;
    /**
     * Save HTML snapshot (and a screenshot if possible) when an error occurs.
     * @default false
     */
    saveErrorSnapshots?: boolean;
}
/**
 * Format of the persisted stats
 */
export interface StatisticPersistedState extends Omit<StatisticState, 'statsPersistedAt'> {
    requestRetryHistogram: number[];
    statsId: number;
    requestAvgFailedDurationMillis: number;
    requestAvgFinishedDurationMillis: number;
    requestTotalDurationMillis: number;
    requestsTotal: number;
    crawlerLastStartTimestamp: number;
    statsPersistedAt: string;
}
/**
 * Contains the statistics state
 */
export interface StatisticState {
    requestsFinished: number;
    requestsFailed: number;
    requestsRetries: number;
    requestsFailedPerMinute: number;
    requestsFinishedPerMinute: number;
    requestMinDurationMillis: number;
    requestMaxDurationMillis: number;
    requestTotalFailedDurationMillis: number;
    requestTotalFinishedDurationMillis: number;
    crawlerStartedAt: Date | string | null;
    crawlerFinishedAt: Date | string | null;
    crawlerRuntimeMillis: number;
    statsPersistedAt: Date | string | null;
    errors: Record<string, unknown>;
    retryErrors: Record<string, unknown>;
    requestsWithStatusCode: Record<string, number>;
}
export {};
//# sourceMappingURL=statistics.d.ts.map