import { createHash } from 'node:crypto'
import {
  cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync,
} from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, it } from 'vitest'
import { apply, bundledPresetDefinition, installCodexPreset, retireLegacyCodexPreset } from '../src/installer.ts'
import { CODEX_SETTINGS_NAMESPACE } from '../src/settings.ts'

const SOURCE = new URL('../presets/codex-collaboration/', import.meta.url)

function signature(directory: string): string {
  return createHash('sha256')
    .update(readFileSync(join(directory, 'agent.cordis.yml')))
    .update(Buffer.from([0]))
    .update(readFileSync(join(directory, 'preset.yml')))
    .digest('hex')
}

describe('Codex preset installer', () => {
  it('keeps child JavaScript expressions inert for the current registry', () => {
    const definition = bundledPresetDefinition()
    expect(definition).toMatchObject({ id: 'codex-collaboration', name: 'Codex 模式', order: 5 })
    const rows = definition.plugins as Array<{ id: string; config?: Array<{ id: string; disabled?: unknown }> }>
    const terminal = rows.find(row => row.id === 'codex-terminal')
    expect(terminal?.config?.find(row => row.id === 'terminal-bash')?.disabled)
      .toEqual({ __jsExpr: "process.platform === 'win32'" })
  })

  it('maps the retired workflow engine for current registries and preserves the legacy source', () => {
    const rows = bundledPresetDefinition().plugins as Array<{
      id: string; isolate?: Record<string, boolean>; config?: Array<{ id: string; name: string; config?: unknown }>
    }>
    const delegation = rows.find(row => row.id === 'delegation')
    expect(delegation?.isolate?.workflowEngine).toBe(true)
    expect(delegation?.config?.find(row => row.id === 'workflow-worker-thread')).toMatchObject({
      name: '@deepseek-ai/dsh-workflow-ptc', config: { provider: 'spawn' },
    })
    expect(JSON.stringify(rows)).not.toContain('@deepseek-ai/dsh-workflow-worker-thread')
    expect(readFileSync(new URL('agent.cordis.yml', SOURCE), 'utf8'))
      .toContain("name: '@deepseek-ai/dsh-workflow-worker-thread'")
  })

  it('registers and disposes the preset with the current registry instead of copying legacy files', async () => {
    const definitions: unknown[] = []
    let disposed = false
    let effect: (() => AsyncGenerator<unknown>) | undefined
    const registry = { register: async (definition: unknown) => {
      definitions.push(definition)
      return () => { disposed = true }
    } }
    apply({
      settings: { register: () => {} },
      inject: (_names: string[], callback: (ctx: unknown) => void) => callback({
        get: () => registry,
        effect: (callback: () => AsyncGenerator<unknown>) => { effect = callback },
      }),
      logger: { warn: () => {} },
    } as never)
    expect(effect).toBeDefined()
    const lifecycle = effect!()
    const registration = await lifecycle.next()
    expect(definitions).toHaveLength(1)
    expect(definitions[0]).toMatchObject({ id: 'codex-collaboration' })
    expect(disposed).toBe(false)
    await (registration.value as () => Promise<void> | void)()
    expect(disposed).toBe(true)
    await lifecycle.return(undefined)
  })

  it('exposes Codex settings before any Codex session is opened', () => {
    const root = mkdtempSync(join(tmpdir(), 'dsh-codex-'))
    const previousHome = process.env['DSH_HOME']
    const registrations: Array<{ namespace: unknown; base: unknown }> = []
    process.env['DSH_HOME'] = root
    try {
      apply({
        inject: (_names: string[], callback: (ctx: unknown) => void) => callback({ get: () => ({}) }),
        settings: {
          register: (namespace: unknown, _schema: unknown, options: { base?: unknown }) => {
            registrations.push({ namespace, base: options.base })
          },
        },
        logger: { warn: () => {} },
      } as never)
      expect(registrations).toHaveLength(1)
      expect(registrations[0]?.namespace).toBe(CODEX_SETTINGS_NAMESPACE)
      expect(registrations[0]?.base).toMatchObject({
        fast: false,
        systemPrompt: expect.stringContaining('## Working principles'),
        promptEnabled: true,
        terminalToolsEnabled: true,
        patchToolEnabled: true,
        planToolEnabled: true,
        hostedWebSearchEnabled: true,
        remoteCompactionEnabled: true,
        activityIndicatorEnabled: true,
      })
      expect(existsSync(join(root, '.agent-presets', 'codex-collaboration', 'preset.yml'))).toBe(true)
    } finally {
      if (previousHome === undefined) delete process.env['DSH_HOME']
      else process.env['DSH_HOME'] = previousHome
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('installs the single complete preset and its managed signature', () => {
    const root = mkdtempSync(join(tmpdir(), 'dsh-codex-'))
    const target = join(root, '.agent-presets', 'codex-collaboration')
    try {
      installCodexPreset(target)
      expect(readFileSync(join(target, 'preset.yml'), 'utf8')).toContain('name: Codex 模式')
      expect(readFileSync(join(target, 'preset.yml'), 'utf8'))
        .toContain('description: 使用可自定义提示词与 Codex 工具的编码 Agent。')
      const composition = readFileSync(join(target, 'agent.cordis.yml'), 'utf8')
      expect(composition).toContain("name: '@shuind/dsh-codex-harness'")
      expect(composition).toContain('globalEnhancements: false')
      expect(composition).toContain('codexCore: true')
      expect(composition).not.toContain('collaborationPrompt')
      expect(composition).toContain("name: '@deepseek-ai/dsh-tool-jobs'")
      expect(composition).toContain('completionDelivery: wakeup')
      expect(composition).toContain("name: '@deepseek-ai/dsh-tool-goal'")
      expect(composition).toContain("name: '@deepseek-ai/dsh-plan-mode'")
      expect(composition).toContain("name: '@deepseek-ai/dsh-tool-subagent'")
      expect(composition).toContain("name: '@deepseek-ai/dsh-tool-workflow'")
      expect(composition).toContain("name: '@deepseek-ai/dsh-tool-ask-user'")
      expect(composition).toContain("name: '@deepseek-ai/dsh-tool-todo'")
      expect(composition).toContain("name: '@deepseek-ai/dsh-tool-web'")
      expect(composition).toContain("name: '@shuind/dsh-codex-harness/compaction'")
      expect(composition).toContain('thresholdRatio: 0.95')
      expect(readFileSync(join(target, '.dsh-codex-harness-managed'), 'utf8').trim())
        .toBe(signature(target))
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('upgrades an unchanged managed preset and preserves a customized copy', () => {
    const root = mkdtempSync(join(tmpdir(), 'dsh-codex-'))
    const target = join(root, 'target')
    const nextSource = join(root, 'next')
    try {
      installCodexPreset(target)
      cpSync(SOURCE, nextSource, { recursive: true })
      writeFileSync(join(nextSource, 'preset.yml'), 'name: Codex Next\ndescription: next\norder: 5\n')
      installCodexPreset(target, nextSource)
      expect(readFileSync(join(target, 'preset.yml'), 'utf8')).toContain('Codex Next')

      writeFileSync(join(target, 'preset.yml'), 'name: User Codex\n')
      installCodexPreset(target)
      expect(readFileSync(join(target, 'preset.yml'), 'utf8')).toBe('name: User Codex\n')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('migrates an unchanged legacy text preset through its managed marker', () => {
    const root = mkdtempSync(join(tmpdir(), 'dsh-codex-'))
    const legacy = join(root, 'legacy')
    const target = join(root, 'target')
    try {
      cpSync(SOURCE, legacy, { recursive: true })
      const legacyAgent = readFileSync(join(legacy, 'agent.cordis.yml'), 'utf8')
        .replace('    prefix: >-', '    text: >-')
      writeFileSync(join(legacy, 'agent.cordis.yml'), legacyAgent)
      cpSync(legacy, target, { recursive: true })
      writeFileSync(join(target, '.dsh-codex-harness-managed'), `${signature(target)}\n`)

      installCodexPreset(target)

      const migrated = readFileSync(join(target, 'agent.cordis.yml'), 'utf8')
      expect(migrated).toContain('    prefix: >-')
      expect(migrated).not.toContain('    text: >-')
      expect(readFileSync(join(target, '.dsh-codex-harness-managed'), 'utf8').trim())
        .toBe(signature(target))
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('preserves a customized legacy text preset during migration', () => {
    const root = mkdtempSync(join(tmpdir(), 'dsh-codex-'))
    const legacy = join(root, 'legacy')
    const target = join(root, 'target')
    try {
      cpSync(SOURCE, legacy, { recursive: true })
      const legacyAgent = readFileSync(join(legacy, 'agent.cordis.yml'), 'utf8')
        .replace('    prefix: >-', '    text: >-')
      writeFileSync(join(legacy, 'agent.cordis.yml'), legacyAgent)
      cpSync(legacy, target, { recursive: true })
      writeFileSync(join(target, '.dsh-codex-harness-managed'), `${signature(target)}\n`)
      writeFileSync(join(target, 'preset.yml'), 'name: User Codex\ndescription: custom\norder: 5\n')

      installCodexPreset(target)

      expect(readFileSync(join(target, 'agent.cordis.yml'), 'utf8'))
        .toContain('    text: >-')
      expect(readFileSync(join(target, 'agent.cordis.yml'), 'utf8'))
        .not.toContain('    prefix: >-')
      expect(readFileSync(join(target, 'preset.yml'), 'utf8'))
        .toBe('name: User Codex\ndescription: custom\norder: 5\n')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('removes only a recognized legacy mode', () => {
    const root = mkdtempSync(join(tmpdir(), 'dsh-codex-'))
    const managed = join(root, 'managed')
    const custom = join(root, 'custom')
    try {
      cpSync(SOURCE, managed, { recursive: true })
      cpSync(SOURCE, custom, { recursive: true })
      const known = new Set([signature(managed)])
      writeFileSync(join(custom, 'preset.yml'), 'name: My legacy mode\n')

      retireLegacyCodexPreset(managed, known)
      retireLegacyCodexPreset(custom, known)
      expect(existsSync(managed)).toBe(false)
      expect(existsSync(custom)).toBe(true)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
