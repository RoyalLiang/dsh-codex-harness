/** Only transport failures from a read can be retried without duplicating writes. */
export function isPresetConnectionError(error) {
    const message = error instanceof Error ? error.message : String(error);
    return /Failed to fetch|NetworkError|Load failed|network request failed|no active Connection|connection.*(?:closed|offline)/i.test(message);
}
export async function readPresetWithRetry(read, active) {
    try {
        return await read();
    }
    catch (error) {
        if (!isPresetConnectionError(error) || !active())
            throw error;
        await new Promise(resolve => setTimeout(resolve, 300));
        if (!active())
            throw error;
        return read();
    }
}
//# sourceMappingURL=preset-requests.js.map