/** Legacy patch helpers; patch application uses the exact/trim matcher in patch.ts. */
export declare class ResilientPatchEngine {
    /**
     * Calculate string similarity ratio between 0 and 1.
     */
    static similarity(s1: string, s2: string): number;
    /** Keep the legacy signature, but only accept a unique whitespace-only match. */
    static findFuzzySequence(lines: readonly string[], expected: readonly string[], from: number, _threshold?: number): number;
}
//# sourceMappingURL=resilient-patch.d.ts.map