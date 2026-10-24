/** Legacy patch helpers; patch application uses the exact/trim matcher in patch.ts. */
export class ResilientPatchEngine {
    /**
     * Calculate string similarity ratio between 0 and 1.
     */
    static similarity(s1, s2) {
        const longer = s1.length > s2.length ? s1 : s2;
        const shorter = s1.length > s2.length ? s2 : s1;
        if (longer.length === 0)
            return 1.0;
        // Compute edit distance
        const costs = [];
        for (let i = 0; i <= longer.length; i++) {
            let lastValue = i;
            for (let j = 0; j <= shorter.length; j++) {
                if (i === 0) {
                    costs[j] = j;
                }
                else if (j > 0) {
                    let newValue = costs[j - 1];
                    if (longer.charAt(i - 1) !== shorter.charAt(j - 1)) {
                        newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
                    }
                    costs[j - 1] = lastValue;
                    lastValue = newValue;
                }
            }
            if (i > 0)
                costs[shorter.length] = lastValue;
        }
        return (longer.length - costs[shorter.length]) / longer.length;
    }
    /** Keep the legacy signature, but only accept a unique whitespace-only match. */
    static findFuzzySequence(lines, expected, from, _threshold = 0.85) {
        if (expected.length === 0)
            return Math.min(from, lines.length);
        let match = -1;
        for (let index = from; index <= lines.length - expected.length; index++) {
            if (!expected.every((line, offset) => lines[index + offset].trim() === line.trim()))
                continue;
            if (match !== -1)
                return -1;
            match = index;
        }
        return match;
    }
}
//# sourceMappingURL=resilient-patch.js.map