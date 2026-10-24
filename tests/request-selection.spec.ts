import { describe, expect, it } from 'vitest'
import { applyRequestSelection } from '../src/request-selection.ts'

describe('logged Codex request selection', () => {
  it('projects effective effort and ignores malformed or unrelated events', () => {
    const state = applyRequestSelection(null, { type: 'request/header', data: { header: { config: { provider: 'relay', model: 'claude', reasoningEffort: 'high' } } } })
    expect(state).toEqual({ provider: 'relay', model: 'claude', effort: 'high' })
    expect(applyRequestSelection(state, { type: 'usage' })).toBe(state)
    expect(applyRequestSelection(state, { type: 'request/header', data: {} })).toBe(state)
    expect(applyRequestSelection(state, { type: 'request/header', data: { header: { config: { provider: 'relay', model: 'claude', reasoningEffort: 'high' } } } })).toBe(state)
    expect(applyRequestSelection(state, { type: 'request/header', data: { header: { config: { provider: 'local', model: 'qwen' } } } })).toEqual({ provider: 'local', model: 'qwen' })
  })
})
