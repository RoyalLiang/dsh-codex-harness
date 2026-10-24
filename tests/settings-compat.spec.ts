import { describe, expect, it } from 'vitest'
import { readSettings, settingsDescriptor, settingsNamespaceMatches } from '../src/settings-compat.ts'

describe('host Config form settings compatibility', () => {
  it('reads live plain form values using the real installer entry id', () => {
    let value = { fast: true, contextWindow: 200_000 }
    const settings = { describe: () => [{ ns: 'codex-preset-installer', value, revision: 4 }] }
    expect(readSettings(settings, 'codex')).toEqual(value)
    value = { fast: false, contextWindow: 100_000 }
    expect(readSettings(settings, 'codex')).toEqual(value)
    expect(settingsNamespaceMatches('codex-preset-installer', 'codex')).toBe(true)
    expect(settingsNamespaceMatches('unrelated', 'codex')).toBe(false)
  })

  it('preserves the actual form namespace and revision for provider writes', () => {
    const providers = { relay: { api: 'openai-responses', baseURL: 'https://example.test/v1' } }
    const settings = { describe: () => [
      { ns: 'unrelated', value: { fast: true } },
      { ns: 'llm-pi-ai', value: { providers }, revision: 7 },
    ] }
    expect(settingsDescriptor(settings, 'llm-pi-ai')).toEqual({ ns: 'llm-pi-ai', value: { providers }, revision: 7 })
    expect(readSettings(settings, 'codex')).toBeUndefined()
  })

  it('continues using legacy namespaces where get is available', () => {
    const calls: unknown[] = []
    const settings = { get: (namespace: unknown) => {
      calls.push(namespace)
      return { fast: true }
    } }
    expect(readSettings(settings, 'codex')).toEqual({ fast: true })
    expect(calls).toEqual(['codex'])
    expect(settingsDescriptor(undefined, 'codex')).toBeUndefined()
  })
})
