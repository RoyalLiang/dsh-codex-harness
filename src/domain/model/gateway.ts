import type { LlmResolvedModelInfo, ReasoningEffortId } from '@deepseek-ai/dsh-llm'

/** Capabilities belong to the adapter's exact provider/model route. */
export interface ModelCapabilityProfile {
  known: boolean
  supportedEfforts: readonly ReasoningEffortId[]
  supportsResponses: boolean
}

export class ModelGateway {
  static resolve(metadata?: LlmResolvedModelInfo, api?: string): ModelCapabilityProfile {
    return {
      known: metadata !== undefined,
      supportedEfforts: metadata?.reasoning?.efforts.map(effort => effort.id) ?? [],
      supportsResponses: api === 'openai-responses' || api === 'openai-codex-responses',
    }
  }
}
