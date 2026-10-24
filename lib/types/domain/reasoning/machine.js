const LEVELS = ['minimal', 'low', 'medium', 'high', 'xhigh', 'max'];
export class ReasoningMachine {
    static resolve(effort, profile, inherited) {
        const requestedEffort = effort ?? 'default';
        const supportedEfforts = profile.supportedEfforts;
        const base = { requestedEffort, supportedEfforts };
        if (requestedEffort === 'default') {
            return { ...base, status: 'inherited', ...(inherited === undefined ? {} : { effectiveEffort: inherited }) };
        }
        if (!profile.known)
            return { ...base, status: 'unknown' };
        if (supportedEfforts.length === 0)
            return { ...base, status: 'unsupported' };
        const exact = supportedEfforts.find(id => id === requestedEffort);
        if (exact !== undefined)
            return { ...base, effectiveEffort: exact, status: 'native' };
        // Opaque adapter levels cannot be ranked safely; only the shared vocabulary is ordered.
        const rank = requestedEffort === 'max' ? LEVELS.length - 1 : LEVELS.findIndex(id => id === requestedEffort);
        const lower = supportedEfforts
            .filter(id => LEVELS.findIndex(level => level === id) >= 0 && LEVELS.findIndex(level => level === id) <= rank)
            .sort((a, b) => LEVELS.findIndex(level => level === b) - LEVELS.findIndex(level => level === a))[0];
        return { ...base, status: 'downgraded', ...(lower === undefined ? {} : { effectiveEffort: lower }) };
    }
    static mapEffortToParameters(effort, _fast, profile, inherited) {
        const { effectiveEffort } = this.resolve(effort, profile, inherited);
        return effectiveEffort === undefined ? {} : { reasoningEffort: effectiveEffort };
    }
    static cotPromptGuidance(effort) {
        if (effort === 'default')
            return '';
        const depth = effort === 'low' ? 'Keep internal verification focused on the immediate change.'
            : effort === 'medium' ? 'Check the relevant assumptions, implementation, and result internally.'
                : 'Use thorough internal analysis to check root causes, boundary cases, and relevant architectural constraints.';
        return `${depth} Present conclusions, evidence, and material limitations concisely; do not expose private chain-of-thought.`;
    }
}
//# sourceMappingURL=machine.js.map