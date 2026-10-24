import { describe, expect, it } from 'vitest'
import { Context, Service } from '@deepseek-ai/cordis'
import { apply, selectTurnStatus } from '../src/client/index.tsx'
import { inject } from '../src/client/index.tsx'
import { isCodexPresetId } from '../src/context.ts'

describe('Codex client settings', () => {
  it('mounts the composer controls and plugin settings card through shared slots', () => {
    const injected: string[] = []
    const registrations: Array<{ name?: string; key?: string }> = []
    apply({
      effect: () => undefined,
      get: (name: string) => name === 'commandUi'
        ? { decorate: () => () => {} }
        : name === 'sessions'
          ? { binding: () => undefined }
          : name === 'configForms'
            ? { get: (entryId: string) => {
                expect(entryId).toBe('codex-preset-installer')
                return { set: async () => true, unset: async () => true }
              } }
            : undefined,
      locale: { register: () => undefined, bind: () => () => '' },
      inject: (_deps: readonly string[], callback: (ctx: unknown) => unknown) => {
        callback({
          remote: undefined,
          slots: {
            inject: (key: string, nested: () => unknown) => {
              injected.push(key)
              return nested()
            },
            register: (options: { name?: string; key?: string }) => {
              registrations.push(options)
              return () => {}
            },
          },
        })
        return () => {}
      },
      slots: {
        inject: (key: string, callback: () => unknown) => {
          injected.push(key)
          callback()
          return () => {}
        },
        register: (options: { name?: string; key?: string }) => {
          registrations.push(options)
          return () => {}
        },
      },
    } as never)
    expect(injected).toEqual([
      'conversation.input.right',
      'conversation.input.right',
      'conversation.input.overlay',
      'settings.plugin.item',
    ])
    expect(registrations
      .filter(entry => entry.name === 'settings.plugin.item')
      .map(({ name, key }) => ({ name, key })))
      .toEqual([{ name: 'settings.plugin.item', key: 'codex-preset-installer' }])
  })

  it('declares every Remote namespace used by the preset manager', () => {
    expect(inject).toEqual([
      'commandUi', 'sessions', 'slots', 'locale', 'configForms',
      'remote', 'remote.agentPresets', 'remote.settings',
    ])
  })

  it('reads external and self-mounted Remote namespaces through protected Cordis contexts', async () => {
    const ctx = new Context()
    const calls: string[] = []
    const agentPresets = {
      list: async () => { calls.push('agentPresets/list'); return { ok: true as const, value: { presets: [], authorable: true } } },
      read: async () => { calls.push('agentPresets/read'); return { ok: true as const, value: { agentPreset: 'codex', trust: 'system' as const, content: '' } } },
      copy: async () => { calls.push('agentPresets/copy'); return { ok: true as const, value: undefined } },
      deletePreset: async () => { calls.push('agentPresets/delete'); return { ok: true as const, value: undefined } },
      select: async () => { calls.push('agentPresets/select'); return { ok: true as const, value: 'codex' } },
    }
    const settingsRemote = {
      update: async () => { calls.push('settings/update'); return { ok: true as const, value: {} } },
    }
    const codexPresetEditor = {
      read: async () => { calls.push('codexPresetEditor/read'); return { ok: true as const, value: { id: 'codex', name: '', description: '', systemPrompt: '' } } },
      update: async () => { calls.push('codexPresetEditor/update'); return { ok: true as const, value: { id: 'codex', name: '', description: '', systemPrompt: '' } } },
    }
    class RemoteService extends Service {
      constructor(serviceCtx: Context) { super(serviceCtx, 'remote') }
      async $mount(): Promise<() => Promise<void>> { return async () => {} }
    }
    const remote = new RemoteService(ctx)
    ctx.provide('remote.agentPresets', agentPresets)
    ctx.provide('remote.settings', settingsRemote)
    ctx.provide('remote.codexPresetEditor', codexPresetEditor)
    ctx.provide('commandUi', { decorate: () => () => {} })
    ctx.provide('sessions', { binding: () => undefined })
    ctx.provide('locale', { register: () => {}, bind: () => () => '' })
    const settingsListeners = new Set<() => void>()
    const settingsSnapshot = { status: 'ready', value: { fast: false }, writable: true }
    const settingsController = {
      getSnapshot: () => settingsSnapshot,
      subscribe: (listener: () => void) => {
        settingsListeners.add(listener)
        return () => { settingsListeners.delete(listener) }
      },
      set: async (field: string, value: unknown) => {
        calls.push(`configForms/set/${field}/${value}`)
        return true
      },
      unset: async (field: string) => {
        calls.push(`configForms/unset/${field}`)
        return true
      },
    }
    ctx.provide('configForms', { get: (entryId: string) => {
      expect(entryId).toBe('codex-preset-installer')
      return settingsController
    } })
    const registrations: Array<{ name?: string; key?: string; inject?: () => any }> = []
    ctx.provide('slots', {
      inject: (_key: string, callback: () => unknown) => callback(),
      register: (options: { name?: string; key?: string; inject?: () => any }) => {
        registrations.push(options)
        return () => {}
      },
    })

    // This is the actual current-host service set: no settingsScope alias.
    expect(ctx.get('settingsScope')).toBeUndefined()
    await ctx.plugin({ inject: [...inject], apply }).await()
    const settingsEntry = registrations.find(entry => entry.name === 'settings.plugin.item')
    expect(settingsEntry).toBeDefined()
    const settingsFace = settingsEntry!.inject!()
    expect(settingsFace.hooks.settings).toBe(settingsController)
    expect(settingsFace.hooks.settings.getSnapshot()).toBe(settingsSnapshot)
    const unsubscribe = settingsFace.hooks.settings.subscribe(() => {})
    expect(settingsListeners.size).toBe(1)
    unsubscribe()
    expect(settingsListeners.size).toBe(0)
    await expect(settingsFace.setSetting('fast', true)).resolves.toBeUndefined()
    await expect(settingsFace.unsetSetting('contextWindow')).resolves.toBeUndefined()
    const manager = settingsFace.presetManager
    expect(await manager.remote.agentPresets.list()).toMatchObject({ ok: true })
    expect(await manager.remote.settings.update('agent-presets', { default: 'codex' })).toMatchObject({ ok: true })
    expect(await manager.remote.codexPresetEditor.read('codex')).toMatchObject({ ok: true })
    expect(calls).toEqual([
      'configForms/set/fast/true', 'configForms/unset/contextWindow',
      'agentPresets/list', 'settings/update', 'codexPresetEditor/read',
    ])
    await ctx.fiber.dispose()
    expect(remote.name).toBe('remote')
  })

  it('recognizes the bundled preset and legacy Codex sessions', () => {
    expect(isCodexPresetId('codex')).toBe(true)
    expect(isCodexPresetId('codex-collaboration')).toBe(true)
    expect(isCodexPresetId('standard')).toBe(false)
  })

  it('anchors the activity indicator to the visible Core turn status', () => {
    const status = (text: string, width: number, height: number, inFlow: boolean) => ({
      textContent: text,
      className: '',
      getBoundingClientRect: () => ({ width, height }),
      closest: () => inFlow ? {} : null,
    } as unknown as HTMLElement)
    const unrelated = status('Loading', 100, 20, true)
    const turn = status('Deep diving...', 100, 26, false)
    expect(selectTurnStatus([unrelated, turn])).toBe(turn)
  })
})
