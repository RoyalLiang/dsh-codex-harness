/** Only transport failures from a read can be retried without duplicating writes. */
export declare function isPresetConnectionError(error: unknown): boolean;
export declare function readPresetWithRetry<T>(read: () => Promise<T>, active: () => boolean): Promise<T>;
//# sourceMappingURL=preset-requests.d.ts.map