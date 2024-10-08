import type { BetterIntervalID } from '@apify/utilities';
import { AsyncEventEmitter } from '@vladfrangu/async_event_emitter';
import { Configuration } from '../configuration';
export declare const enum EventType {
    PERSIST_STATE = "persistState",
    SYSTEM_INFO = "systemInfo",
    MIGRATING = "migrating",
    ABORTING = "aborting",
    EXIT = "exit"
}
export type EventTypeName = EventType | 'systemInfo' | 'persistState' | 'migrating' | 'aborting' | 'exit';
interface Intervals {
    persistState?: BetterIntervalID;
    systemInfo?: BetterIntervalID;
}
export declare abstract class EventManager {
    readonly config: Configuration;
    protected events: AsyncEventEmitter<{}>;
    protected initialized: boolean;
    protected intervals: Intervals;
// @ts-ignore optional peer dependency or compatibility with es2022
    protected log: import("@apify/log").Log;
    constructor(config?: Configuration);
    /**
     * Initializes the event manager by creating the `persistState` event interval.
     * This is automatically called at the beginning of `crawler.run()`.
     */
    init(): Promise<void>;
    /**
     * Clears the internal `persistState` event interval.
     * This is automatically called at the end of `crawler.run()`.
     */
    close(): Promise<void>;
    on(event: EventTypeName, listener: (...args: any[]) => any): void;
    off(event: EventTypeName, listener?: (...args: any[]) => any): void;
    emit(event: EventTypeName, ...args: unknown[]): void;
    isInitialized(): boolean;
    /**
     * @internal
     */
    listenerCount(event: EventTypeName): number;
    /**
     * @internal
     */
    listeners(event: EventTypeName): (() => Promise<unknown>)[];
    /**
     * @internal
     */
    waitForAllListenersToComplete(): Promise<boolean>;
}
export {};
//# sourceMappingURL=event_manager.d.ts.map