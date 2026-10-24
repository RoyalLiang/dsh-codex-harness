/**
 * Domain: Ephemeral Thought Pruner (Token Economics)
 *
 * Prunes historic reasoning tokens from previous turns when replaying
 * context history, drastically reducing token consumption and preventing
 * exponential context growth in multi-turn sessions.
 */
export interface MessageWithReasoning {
    role: string;
    content?: unknown;
    reasoning?: unknown;
    [key: string]: unknown;
}
export declare class EphemeralThoughtPruner {
    /**
     * Prune historic reasoning deltas/tokens from past assistant messages,
     * preserving only the final text output and tool calls.
     * Keeps the latest assistant turn intact for immediate verification.
     */
    static pruneHistory<T extends MessageWithReasoning>(messages: readonly T[]): T[];
}
//# sourceMappingURL=pruner.d.ts.map