import { describe, expect, it } from 'vitest'
import { ReasoningEffortId } from '@deepseek-ai/dsh-llm'
import type { LlmResolvedModelInfo } from '@deepseek-ai/dsh-llm'
import { ModelGateway } from '../src/domain/model/gateway.ts'
import { ReasoningMachine } from '../src/domain/reasoning/machine.ts'
import { PrefixCacheTopology } from '../src/domain/context/topology.ts'
import { applyCodexRequestSettings, codexProviderApi, resolveCodexRequest } from '../src/index.ts'

const metadata = (...levels: string[]): LlmResolvedModelInfo => ({
  provider: 'relay', id: 'arbitrary-model', name: 'Model',
  reasoning: { efforts: levels.map(id => ({ id: ReasoningEffortId(id), name: id })) },
})

describe('Adapter-owned capabilities', () => {
  it('requires explicit endpoint API and never guesses from names', () => {
    expect(ModelGateway.resolve({ provider: 'openai', id: 'gpt-99', name: 'GPT' }).supportsResponses).toBe(false)
    expect(ModelGateway.resolve(metadata('low'), 'openai-responses').supportsResponses).toBe(true)
    expect(ModelGateway.resolve().supportedEfforts).toEqual([])
  })

  it('honors explicit model API overrides before provider API', () => {
    const ctx = { get: () => ({ get: () => ({ providers: { relay: {
      api: 'openai-responses',
      models: [{ id: 'custom', api: 'anthropic-messages' }],
      modelOverrides: { custom: { api: 'openai-completions' } },
    } } }) }) } as never
    expect(codexProviderApi(ctx, 'relay', 'custom')).toBe('openai-completions')
    expect(codexProviderApi(ctx, 'relay', 'other')).toBe('openai-responses')
    expect(codexProviderApi(ctx, 'openai', 'gpt-99')).toBeUndefined()
  })

  it.each([
    ['low', ['medium', 'high'], undefined, 'downgraded'],
    ['medium', ['low', 'high'], 'low', 'downgraded'],
    ['high', ['low', 'high'], 'high', 'native'],
    ['xhigh', ['high', 'low'], 'high', 'downgraded'],
    ['max', ['high', 'low', 'xhigh'], 'xhigh', 'downgraded'],
    ['max', ['low', 'max', 'high'], 'max', 'native'],
    ['high', ['opaque-level'], undefined, 'downgraded'],
    ['high', [], undefined, 'unsupported'],
  ])('resolves %s against native levels %j', (effort, levels, effective, status) => {
    const result = ReasoningMachine.resolve(effort, ModelGateway.resolve(metadata(...levels)))
    expect(result.effectiveEffort).toBe(effective)
    expect(result.status).toBe(status)
  })

  it('keeps provider defaults and inherited opaque efforts without forcing medium', () => {
    const profile = ModelGateway.resolve(metadata('low', 'high'))
    expect(ReasoningMachine.mapEffortToParameters('default', false, profile)).toEqual({})
    expect(ReasoningMachine.mapEffortToParameters('default', false, profile, ReasoningEffortId('opaque')))
      .toEqual({ reasoningEffort: 'opaque' })
    expect(ReasoningMachine.resolve('high', ModelGateway.resolve()).status).toBe('unknown')
  })

  it('Fast does not lower reasoning or inject provider-specific thinking fields', () => {
    const profile = ModelGateway.resolve(metadata('low', 'high'))
    expect(ReasoningMachine.mapEffortToParameters('high', true, profile)).toEqual({ reasoningEffort: 'high' })
  })
})

describe('Native request decision', () => {
  it('handles frozen input and only emits standard reasoning effort', () => {
    const request = Object.freeze({ provider: 'relay', model: 'deepseek-reasoner' })
    const result = applyCodexRequestSettings(request, { reasoningEffort: 'max', fast: true }, metadata('low', 'high'))
    expect(result).toEqual({ ...request, reasoningEffort: 'high' })
    expect(request).not.toHaveProperty('reasoningEffort')
  })

  it('leaves unsupported native effort unset and preserves the Codex route', () => {
    expect(applyCodexRequestSettings({ provider: 'relay', model: 'claude-custom' }, { reasoningEffort: 'max' }, metadata()))
      .toEqual({ provider: 'relay', model: 'claude-custom' })
  })

  it('uses resolved native metadata and forwards cancellation', async () => {
    const controller = new AbortController()
    const seen: unknown[][] = []
    const ctx = { llm: { resolveModelInfo: async (...args: unknown[]) => { seen.push(args); return metadata('low', 'high') } } } as never
    expect(await resolveCodexRequest(ctx, { provider: 'relay', model: 'custom' }, { reasoningEffort: 'max' }, controller.signal))
      .toEqual({ provider: 'relay', model: 'custom', reasoningEffort: 'high' })
    expect(seen).toEqual([['relay', 'custom', controller.signal]])
  })

  it('falls back without inventing capabilities on lookup failure but preserves aborts', async () => {
    const ctx = { llm: { resolveModelInfo: async () => { throw new Error('lookup unavailable') } } } as never
    const request = { provider: 'relay', model: 'custom' }
    expect(await resolveCodexRequest(ctx, request, { reasoningEffort: 'max' })).toEqual(request)
    const controller = new AbortController()
    controller.abort()
    await expect(resolveCodexRequest(ctx, request, {}, controller.signal)).rejects.toBeDefined()
    const abortedCtx = { llm: { resolveModelInfo: async () => { throw Object.assign(new Error('aborted'), { name: 'AbortError' }) } } } as never
    await expect(resolveCodexRequest(abortedCtx, request, {})).rejects.toHaveProperty('name', 'AbortError')
  })
})

describe('Prompt authority', () => {
  it('keeps default implicit and changes internal verification guidance for selected effort', () => {
    expect(ReasoningMachine.cotPromptGuidance('default')).toBe('')
    expect(ReasoningMachine.cotPromptGuidance('low')).not.toBe(ReasoningMachine.cotPromptGuidance('high'))
    expect(ReasoningMachine.cotPromptGuidance('max')).toContain('do not expose private chain-of-thought')
  })
  it('retains host assembly order and frozen inputs', () => {
    const assembly = Object.freeze({ sections: [{ name: 'deployment:persona', text: 'Persona' }, { name: 'codex:base', text: 'Rules' }], contexts: [], tools: [], variables: {} })
    expect(PrefixCacheTopology.optimizeAssembly(assembly)).toBe(assembly)
  })
})
