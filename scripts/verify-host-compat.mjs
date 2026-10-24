import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

// Run under Electron's Node mode so imports use the exact installed ASAR modules.
const asar = process.env.DSH_HOST_ASAR
assert(asar, 'Set DSH_HOST_ASAR to the installed app.asar path')
const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const hostRequire = createRequire(pathToFileURL(resolve(asar, 'package.json')))
const host = name => import(pathToFileURL(hostRequire.resolve(name)).href)
const [{ Context }, { TypertRegistry }, loader, { TypertGatewayService }, { LlmRuntime }, { SettingsForms }, { SystemPrompt }] = await Promise.all([
  host('@deepseek-ai/cordis'), host('@deepseek-ai/dsh-typert-registry'),
  host('@deepseek-ai/dsh-typert-loader'), host('@deepseek-ai/dsh-api-gateway'), host('@deepseek-ai/dsh-llm'),
  host('@deepseek-ai/dsh-settings'), host('@deepseek-ai/dsh-system-prompt'),
])
const PACKAGE = '@shuind/dsh-codex-harness'
const { TYPERT } = await import(pathToFileURL(resolve(repo, 'lib/typert.js')).href)
loader.validateTypertManifest(PACKAGE, TYPERT)
const obsolete = { ...TYPERT, invocations: TYPERT.invocations.map(invocation => {
  const { create, ...result } = invocation.result
  return { ...invocation, result }
}) }
assert.throws(() => loader.validateTypertManifest(PACKAGE, obsolete), /has no create\(\) factory/)
for (const invocation of TYPERT.invocations) {
  assert.equal(typeof invocation.result.create().parse, 'function')
  for (const parameter of invocation.parameters) assert.equal(typeof parameter.codec.create().parse, 'function')
}
const update = TYPERT.invocations.find(invocation => invocation.method === 'update')
assert.throws(() => update.parameters[0].codec.create().parse({ id: 'bad' }))

const ctx = new Context()
ctx.baseUrl = pathToFileURL(resolve(asar, 'package.json')).href
ctx.provide('logger', console)
const temporaryHome = mkdtempSync(resolve(tmpdir(), 'dsh-codex-compat-'))
const entries = []
ctx.provide('loader', { entries: () => entries, await: async () => {} })
ctx.provide('profileContext', { home: temporaryHome, name: 'codex-compat' })
ctx.provide('configEditor', {
  documentPath: resolve(temporaryHome, 'cordis.patch.yml'),
  entries: () => entries,
  configuration: () => entries.map(entry => ({ entry, inherited: {}, override: entry.options.config ?? {} })),
  async edit(entry, change) {
    entry.options.config = change(entry.options.config ?? {}, {})
    entry.fiber.config = entry.options.config
  },
})
let registeredPreset
ctx.provide('agentPresets', {
  register: async definition => { registeredPreset = definition; return () => {} },
  list: async () => registeredPreset ? [{ ...registeredPreset, trust: 'system' }] : [],
})
const tools = []
ctx.provide('tools', { register: definition => { tools.push(definition); return () => {} } })
for (const service of ['shell', 'fs', 'credentials']) ctx.provide(service, {})
ctx.provide('pluginPackages', {
  packageOf(name) {
    const manifestPath = name === PACKAGE ? resolve(repo, 'package.json') : hostRequire.resolve(`${name}/package.json`)
    return { manifestPath, manifest: JSON.parse(readFileSync(manifestPath, 'utf8')) }
  },
})
ctx.provide('remoteAccess', { decide: () => { throw new Error('Unexpected non-owner access') } })
try {
  await ctx.plugin(TypertRegistry).await()
  await ctx.plugin(LlmRuntime).await()
  await ctx.plugin(SettingsForms).await()
  await ctx.plugin(SystemPrompt, { personaPrefix: 'HOST PREFIX', personaSuffix: 'HOST SUFFIX' }).await()
  const installer = await import(pathToFileURL(resolve(repo, 'lib/installer.js')).href)
  const installerFiber = ctx.plugin(installer, {})
  entries.push({ id: 'codex-preset-installer', options: { id: 'codex-preset-installer', name: `${PACKAGE}/installer`, config: {} }, fiber: installerFiber })
  await installerFiber.await()
  assert.equal(registeredPreset?.id, 'codex-collaboration')
  const descriptor = ctx.settings.describe().find(row => row.ns === 'codex-preset-installer')
  assert(descriptor, 'Installer must expose the Codex Config form')
  assert.equal(descriptor.value.fast, false)
  assert.equal(descriptor.applies, 'live')
  await ctx.settings.update(descriptor.ns, { fast: true }, descriptor.revision)
  assert.equal(ctx.settings.describe().find(row => row.ns === descriptor.ns).value.fast, true)
  const codex = await import(pathToFileURL(resolve(repo, 'lib/index.js')).href)
  await ctx.plugin(codex, { globalEnhancements: true, codexCore: true }).await()
  for (const name of ['exec_command', 'write_stdin', 'apply_patch', 'update_plan']) assert(tools.some(tool => tool.name === name))
  await ctx.plugin(TypertGatewayService, { websocketHeartbeatIntervalMs: 30_000, streamInboxBytes: 1_048_576 }).await()
  const start = () => ctx.plugin(loader, { packages: ['@deepseek-ai/dsh-llm', PACKAGE] })
  let activation = start()
  await activation.await()
  const providers = () => ctx.typertGateway.invoke({
    namespace: 'llm', method: 'listProviders', args: {},
    peer: { principal: { kind: 'owner' }, signal: new AbortController().signal },
  })
  assert.deepEqual(await providers(), [])
  assert(ctx.typert.local.get('codexPresetEditor/catalog'))
  assert(ctx.typert.local.get('llm/listProviders'))
  await activation.dispose()
  assert.equal(ctx.typert.local.get('llm/listProviders'), undefined)
  await assert.rejects(providers(), /its strict definition was withdrawn/)
  activation = start()
  await activation.await()
  assert.deepEqual(await providers(), [])
  assert(ctx.typert.local.get('codexPresetEditor/update'))
  const catalog = await ctx.typertGateway.invoke({
    namespace: 'codexPresetEditor', method: 'catalog', args: {},
    peer: { principal: { kind: 'owner' }, signal: new AbortController().signal },
  })
  assert(catalog.presets.some(preset => preset.id === 'codex-collaboration'))
  const assembled = () => ctx.systemPrompt.assemble()
  const prompt = await assembled()
  assert(prompt.sections.some(section => section.name === 'codex:base' && section.text.length > 0))
  assert(prompt.sections.some(section => section.text === 'HOST PREFIX'))
  assert(prompt.sections.some(section => section.text === 'HOST SUFFIX'))
  assert(prompt.contexts.find(context => context.name === 'codex:reasoning').text.length > 0)
  const live = ctx.settings.describe().find(row => row.ns === descriptor.ns)
  await ctx.settings.update(live.ns, { reasoningEffort: 'default' }, live.revision)
  assert.equal((await assembled()).contexts.find(context => context.name === 'codex:reasoning').text, '')
  const hostManifest = JSON.parse(readFileSync(resolve(asar, 'package.json'), 'utf8'))
  console.log(`Host: ${hostManifest.name}@${hostManifest.version}; Node ${process.versions.node}; Electron ${process.versions.electron}`)
  console.log('PASS: actual host loader + registry + LLM + gateway + SettingsForms; Codex core tools and prompt, persona preservation, Default reasoning guidance, Config edits, strict validation, dispose and reactivate')
} finally {
  await ctx.fiber.dispose()
  rmSync(temporaryHome, { recursive: true, force: true })
}
