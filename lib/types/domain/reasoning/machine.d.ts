import type { ReasoningEffortId } from '@deepseek-ai/dsh-llm';
import type { ModelCapabilityProfile } from '../model/gateway.ts';
export type CodexReasoningEffort = 'low' | 'medium' | 'high' | 'xhigh' | 'max' | 'default';
export interface ReasoningResolution {
    requestedEffort: string;
    effectiveEffort?: ReasoningEffortId;
    supportedEfforts: readonly ReasoningEffortId[];
    status: 'native' | 'inherited' | 'downgraded' | 'unsupported' | 'unknown';
}
export declare class ReasoningMachine {
    static resolve(effort: string | undefined, profile: ModelCapabilityProfile, inherited?: ReasoningEffortId): ReasoningResolution;
    static mapEffortToParameters(effort: string | undefined, _fast: boolean, profile: ModelCapabilityProfile, inherited?: ReasoningEffortId): {
        reasoningEffort?: ReasoningEffortId;
    };
    static cotPromptGuidance(effort: CodexReasoningEffort): string;
}
//# sourceMappingURL=machine.d.ts.map