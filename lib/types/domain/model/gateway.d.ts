import type { LlmResolvedModelInfo, ReasoningEffortId } from '@deepseek-ai/dsh-llm';
/** Capabilities belong to the adapter's exact provider/model route. */
export interface ModelCapabilityProfile {
    known: boolean;
    supportedEfforts: readonly ReasoningEffortId[];
    supportsResponses: boolean;
}
export declare class ModelGateway {
    static resolve(metadata?: LlmResolvedModelInfo, api?: string): ModelCapabilityProfile;
}
//# sourceMappingURL=gateway.d.ts.map