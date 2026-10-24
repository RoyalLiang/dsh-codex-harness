/** Codex-compatible prompt overlay and core tools for a dsh agent preset. */
import z from '@deepseek-ai/schemastery';
import { defineTool } from '@deepseek-ai/dsh-tools';
import { APPLY_PATCH_DESCRIPTION, applyPatchHunks, parsePatch } from "./patch.js";
import { renderExecResult, runExecCommand, runWriteStdin } from "./exec.js";
import { hostedWebSearchStream, installHostedWebSearch, remoteCompactStream, repairLegacyPiAiContextOverflow, } from "./remote.js";
import { registerCodexActivityProjection } from "./activity.js";
import { registerCodexRequestProjection } from "./request-selection.js";
import { DEFAULT_CODEX_PERSONA, DEFAULT_CODEX_SYSTEM_PROMPT, DEFAULT_DSH_CORE_SOURCE_PROMPT, DEFAULT_DSH_CORE_WEB_PROMPT, resolveCodexSystemPrompt, } from "./prompt.js";
import { CODEX_SETTINGS_ENTRY, CODEX_SETTINGS_NAMESPACE, CODEX_SETTINGS_SCHEMA, } from "./settings.js";
import { readSettings, settingsNamespaceMatches } from "./settings-compat.js";
import { codexCompactionMode } from "./compaction.js";
import { CodexPresetEditor } from "./preset-editor.js";
import { applyPromptSections, Config as PromptSectionsConfig } from "./prompt-sections.js";
import { ModelGateway } from "./domain/model/gateway.js";
import { ReasoningMachine } from "./domain/reasoning/machine.js";
import { PrefixCacheTopology } from "./domain/context/topology.js";
export { DEFAULT_CODEX_PERSONA, DEFAULT_CODEX_SYSTEM_PROMPT, DEFAULT_DSH_CORE_SOURCE_PROMPT, DEFAULT_DSH_CORE_WEB_PROMPT, } from "./prompt.js";
export { CODEX_SETTINGS_NAMESPACE, CODEX_SETTINGS_SCHEMA } from "./settings.js";
export { ModelGateway } from "./domain/model/gateway.js";
export { ReasoningMachine } from "./domain/reasoning/machine.js";
export { EphemeralThoughtPruner } from "./domain/reasoning/pruner.js";
export { PrefixCacheTopology } from "./domain/context/topology.js";
export const name = 'codex';
export const inject = ['tools', 'systemPrompt', 'shell', 'fs', 'llm', 'credentials', 'settings'];
const DEFAULT_MAX_OUTPUT_BYTES = 1024 * 1024;
/** Add the preset editor when DSH's optional user-preset service is available. */
function installPresetEditor(ctx) {
    // `agentPresets` is supplied by dsh-agent-presets and may be installed after
    // this plugin. Waiting through inject keeps the Codex core usable on hosts
    // without that optional service while still mounting the Remote as soon as
    // the Web preset catalog becomes available.
    ctx.inject(['agentPresets'], presetCtx => {
        void (async () => {
            try {
                await presetCtx.plugin(CodexPresetEditor);
            }
            catch (error) {
                ctx.logger.warn('codex: preset editor is unavailable on this host');
                ctx.logger.warn(error);
            }
        })();
    });
}
/** Runtime configuration schema for the Codex tool bridge. */
export const Config = z.object({
    globalEnhancements: z.boolean().default(true),
    codexCore: z.boolean().default(true),
    defaultYieldTimeMs: z.number().step(1).min(0).default(10_000),
    pollYieldTimeMs: z.number().step(1).min(0).default(5_000),
    writeYieldTimeMs: z.number().step(1).min(0).default(250),
    maxOutputBytes: z.number().step(1).min(1).default(DEFAULT_MAX_OUTPUT_BYTES),
    hostedWebSearch: z.boolean().default(true),
    remoteCompact: z.boolean().default(true),
    systemPrompt: z.string().default(DEFAULT_CODEX_SYSTEM_PROMPT),
    presetPrompt: z.string(),
    presetSections: PromptSectionsConfig,
    promptEnabled: z.boolean(),
    terminalToolsEnabled: z.boolean(),
    patchToolEnabled: z.boolean(),
    planToolEnabled: z.boolean(),
    hostedWebSearchEnabled: z.boolean(),
    remoteCompactionEnabled: z.boolean(),
    persona: z.string().default(DEFAULT_CODEX_PERSONA),
    harnessSourcePrompt: z.string().default(DEFAULT_DSH_CORE_SOURCE_PROMPT),
    webSurfacePrompt: z.string().default(DEFAULT_DSH_CORE_WEB_PROMPT),
});
/** Compatibility export: provider capabilities remain owned by the adapter. */
export function enrichCodexModel(model) {
    return model;
}
/** Install the optional settings source used by requests and prompt assembly. */
function installCodexSettings(ctx, systemPrompt, persona, harnessSourcePrompt, webSurfacePrompt) {
    const entry = {
        ...CODEX_SETTINGS_ENTRY,
        systemPrompt,
        persona,
        harnessSourcePrompt,
        webSurfacePrompt,
    };
    const withDefaults = (value) => ({
        ...entry,
        ...value,
    });
    let source = () => entry;
    let attached = false;
    const attachSettings = (candidate) => {
        if (attached || candidate === undefined || candidate === null)
            return attached;
        const settings = candidate;
        if (typeof settings.get === 'function') {
            const get = settings.get.bind(settings);
            if (get(CODEX_SETTINGS_NAMESPACE) !== undefined) {
                source = () => get(CODEX_SETTINGS_NAMESPACE);
                attached = true;
                return true;
            }
        }
        if (typeof candidate.describe === 'function') {
            source = () => readSettings(candidate, CODEX_SETTINGS_NAMESPACE) ?? entry;
            attached = true;
            return true;
        }
        if (typeof settings.installSection === 'function') {
            settings.installSection.call(settings, ctx, CODEX_SETTINGS_NAMESPACE, CODEX_SETTINGS_SCHEMA, entry, {
                setSource: (current) => { source = current; },
                onChange: () => { },
            });
            attached = true;
            return true;
        }
        if (typeof settings.register === 'function') {
            const scope = settings.register.call(settings, CODEX_SETTINGS_NAMESPACE, CODEX_SETTINGS_SCHEMA, { base: entry });
            source = () => scope.get();
            attached = true;
            return true;
        }
        return false;
    };
    if (!attachSettings(ctx.get('settings'))) {
        ctx.inject(['settings'], (settingsCtx) => {
            attachSettings(settingsCtx.settings);
        });
    }
    return { current: () => withDefaults(source()) };
}
/** Read the event snapshot across the pre- and post-0.1.2 DSH session APIs. */
function sessionEvents(session) {
    const compatible = session;
    if (typeof compatible.snapshotEvents === 'function')
        return compatible.snapshotEvents();
    return compatible.events ?? [];
}
function hasOpenTurn(session) {
    const events = sessionEvents(session);
    const start = events.findLast(event => event.type === 'turn/start');
    const end = events.findLast(event => event.type === 'turn/end');
    return start !== undefined && (end === undefined || start.seq > end.seq);
}
/**
 * Pair the live Codex capacity with the token-meter context projection.
 *
 * The core loop records adapter metadata in `request/context`, while Codex's
 * setting is a request-scoped LLM capacity. Appending the override after the
 * loop's metadata event keeps the official ContextMeter and compaction engine
 * on the same effective capacity.
 */
export function syncCodexContextWindow(session, contextWindow) {
    if (contextWindow === undefined
        || !Number.isSafeInteger(contextWindow)
        || contextWindow <= 0
        || !hasOpenTurn(session))
        return;
    const config = session.requestHeader()?.config;
    if (typeof config?.provider !== 'string'
        || typeof config.model !== 'string')
        return;
    const current = session.requestContext();
    if (current?.provider === config.provider
        && current.model === config.model
        && current.contextWindow === contextWindow)
        return;
    session.append('request/context', {
        provider: config.provider,
        model: config.model,
        contextWindow,
    });
}
/** Keep the official context meter synchronized with a live Codex override. */
function installCodexContextProjection(ctx, current) {
    const sync = (session, contextWindow = current().contextWindow) => {
        syncCodexContextWindow(session, contextWindow);
    };
    const pending = new WeakSet();
    const syncAfterPublication = (session) => {
        if (pending.has(session))
            return;
        pending.add(session);
        queueMicrotask(() => {
            try {
                sync(session);
            }
            finally {
                pending.delete(session);
            }
        });
    };
    const syncAll = (contextWindow = current().contextWindow) => {
        const sessions = ctx.get('sessions');
        for (const session of sessions?.list?.() ?? [])
            sync(session, contextWindow);
    };
    ctx.on('session/event', (session, event) => {
        // Session.append() rejects nested appends until every observer returns.
        if (event.type === 'request/header' || event.type === 'request/context')
            syncAfterPublication(session);
    });
    // Restored sessions may already contain their request/header seed, so no
    // session/event is emitted for the initial capacity. Catch them at the
    // store publication boundary as well.
    ctx.on('session/created', (session) => { sync(session); });
    // Use the resolved value carried by the consumer-facing event. This avoids
    // waiting for the settings source closure to refresh before synchronizing
    // already-open sessions.
    ctx.on('settings/updated', (ns, next) => {
        if (settingsNamespaceMatches(ns, CODEX_SETTINGS_NAMESPACE)) {
            syncAll(next.contextWindow);
        }
    });
    ctx.on('settings/document-updated', ns => {
        if (settingsNamespaceMatches(ns, CODEX_SETTINGS_NAMESPACE))
            syncAll();
    });
    syncAll();
}
/** Apply standard call settings without changing provider-owned history or capabilities. */
export function applyCodexRequestSettings(request, settings, metadata) {
    const { contextWindow: _contextWindow, serviceTier: _serviceTier, reasoningEffort, ...rest } = request;
    const inherited = settings.reasoningEffort === undefined || settings.reasoningEffort === 'default';
    const parameters = settings.universalCodexMode === false
        ? (reasoningEffort === undefined ? {} : { reasoningEffort })
        : ReasoningMachine.mapEffortToParameters(settings.reasoningEffort, false, ModelGateway.resolve(metadata), inherited ? reasoningEffort : undefined);
    return {
        ...rest,
        ...parameters,
        ...(settings.contextWindow === undefined ? {} : { contextWindow: settings.contextWindow }),
    };
}
/** Resolve exact-route capabilities; a failed lookup never invents native support. */
export async function resolveCodexRequest(ctx, request, settings, signal) {
    signal?.throwIfAborted();
    let metadata;
    try {
        metadata = await ctx.llm.resolveModelInfo(request.provider, request.model, signal);
    }
    catch (error) {
        signal?.throwIfAborted();
        if (error instanceof Error && error.name === 'AbortError')
            throw error;
    }
    signal?.throwIfAborted();
    return applyCodexRequestSettings(request, settings, metadata);
}
/** Read explicit route API configuration; provider and model names imply nothing. */
export function codexProviderApi(ctx, provider, model) {
    const settings = readSettings(ctx.get('settings'), 'llm-pi-ai');
    const profile = settings?.providers?.[provider];
    return (model === undefined ? undefined : profile?.modelOverrides?.[model]?.api
        ?? profile?.models?.find(entry => entry.id === model)?.api) ?? profile?.api;
}
/** Put the agent persona first and omit the generic Harness identity opener. */
export function normalizeCodexPromptAssembly(assembly) {
    const sections = assembly.sections.filter(section => section.name !== 'harness:identity');
    const persona = sections.find(section => section.name === 'deployment:persona');
    if (persona === undefined)
        return { ...assembly, sections };
    return {
        ...assembly,
        sections: [persona, ...sections.filter(section => section.name !== 'deployment:persona')],
    };
}
function sectionText(assembly, name) {
    const section = assembly.sections.find(candidate => candidate.name === name);
    return section?.text;
}
function promptVariables(assembly) {
    const variables = { ...assembly.variables };
    if (variables.sourceRoot === undefined) {
        const source = sectionText(assembly, 'harness:source');
        const match = source?.match(/^The DeepSeek Harness implementation checkout is at (.+?)\. The checkout location/u);
        if (match?.[1] !== undefined)
            variables.sourceRoot = match[1];
    }
    if (variables.webUrl === undefined) {
        const web = sectionText(assembly, 'app:web-surface');
        const match = web?.match(/^You are interacting with the user through the DeepSeek Harness Web GUI at (.+?)\. When/u);
        if (match?.[1] !== undefined)
            variables.webUrl = match[1];
    }
    return variables;
}
function interpolateCodexPrompt(text, variables) {
    return text.replace(/\{\{([\w.-]+)\}\}/g, (whole, key) => variables[key] ?? whole);
}
/** Apply user-editable Persona and DSH Core runtime prompt templates. */
function applyCodexPromptOverrides(assembly, settings) {
    const overrides = {
        'deployment:persona': settings.persona,
        'harness:source': settings.harnessSourcePrompt,
        'app:web-surface': settings.webSurfacePrompt,
    };
    const defaults = {
        'deployment:persona': DEFAULT_CODEX_PERSONA,
        'harness:source': DEFAULT_DSH_CORE_SOURCE_PROMPT,
        'app:web-surface': DEFAULT_DSH_CORE_WEB_PROMPT,
    };
    const hasCustomOverride = Object.entries(overrides).some(([name, text]) => (text !== undefined && text !== defaults[name]));
    if (!hasCustomOverride)
        return assembly;
    const variables = promptVariables(assembly);
    const sections = assembly.sections.map(section => {
        const template = overrides[section.name];
        return template === undefined || template === defaults[section.name]
            ? section
            : { ...section, text: interpolateCodexPrompt(template, variables) };
    });
    return { ...assembly, sections, variables };
}
const CODEX_TOOL_NAMES = {
    terminalToolsEnabled: new Set(['exec_command', 'write_stdin']),
    patchToolEnabled: new Set(['apply_patch']),
    planToolEnabled: new Set(['update_plan']),
};
/** Remove disabled Codex capabilities from the next model-visible assembly. */
export function applyCodexCapabilitySettings(assembly, settings) {
    const disabled = new Set();
    for (const [setting, names] of Object.entries(CODEX_TOOL_NAMES)) {
        if (settings[setting])
            continue;
        for (const name of names)
            disabled.add(name);
    }
    const filtered = disabled.size === 0
        ? assembly
        : { ...assembly, tools: assembly.tools.filter(tool => !disabled.has(tool.name)) };
    const withOverrides = applyCodexPromptOverrides(filtered, settings);
    return settings.promptEnabled ? normalizeCodexPromptAssembly(withOverrides) : withOverrides;
}
/** Build the complete plugin-owned prompt, preserving an intentional empty value. */
export function buildCodexSystemPrompt(config = {}) {
    return resolveCodexSystemPrompt(config.systemPrompt);
}
const EXEC_COMMAND_DESCRIPTION = 'Runs a shell command. By default it uses pipes: a running session can be polled for output but does not accept stdin. Set tty=true before starting a command that needs interactive input; background jobs use pipes.';
const WRITE_STDIN_DESCRIPTION = 'Polls output from an existing unified exec session. Non-empty chars can be sent only to a session created with tty=true; pipe-backed sessions accept empty chars for polling only.';
const UPDATE_PLAN_DESCRIPTION = 'Updates the task plan.\nProvide an optional explanation and a list of plan items, each with a step and status.\nAt most one step can be in_progress at a time.';
const PLAN_STATUSES = ['pending', 'in_progress', 'completed'];
function assertCapabilityEnabled(current, setting, toolName) {
    if (!current()[setting])
        throw new Error(`${toolName}: disabled in Codex Harness plugin settings`);
}
function sessionCwd(exec) {
    return exec.agent?.session.header.cwd;
}
function resolvePolicy(ctx, exec) {
    const policy = ctx.get('sandboxPolicy');
    return policy?.resolve(exec.agent === undefined ? {} : { session: exec.agent.session });
}
async function resolveTarget(ctx, path, exec) {
    const cwd = sessionCwd(exec);
    return ctx.fs.resolve(path, cwd === undefined ? { signal: exec.signal } : { cwd, signal: exec.signal });
}
async function observedTarget(ctx, target, exec) {
    const info = await ctx.fs.stat(target, exec.signal);
    if (info === undefined)
        throw new Error(`apply_patch: file not found: ${target.displayPath}`);
    if (info.type !== 'file')
        throw new Error(`apply_patch: not a regular file: ${target.displayPath}`);
    ctx.emit('fs/observed', target, { kind: 'present', version: info.version }, exec);
    return info;
}
async function writePatchedFile(ctx, target, content, fallback, exec, policy) {
    const intent = await ctx.waterfall('fs/write-intent', target, exec, () => fallback);
    const outcome = await ctx.fs.writeText(target, content, intent, exec.signal, policy);
    ctx.emit('fs/observed', target, { kind: 'present', version: outcome.version }, exec);
    return outcome.operation === 'create' ? 'created' : 'updated';
}
async function deletePatchedFile(ctx, target, version, exec, policy) {
    const remove = ctx.fs.remove;
    if (typeof remove !== 'function') {
        throw new Error('apply_patch: the configured dsh filesystem does not support file deletion');
    }
    await remove.call(ctx.fs, target, { version }, exec.signal, policy);
    ctx.emit('fs/observed', target, { kind: 'absent' }, exec);
}
async function applyOnePatch(ctx, file, exec, policy) {
    const target = await resolveTarget(ctx, file.path, exec);
    if (file.kind === 'add') {
        const existing = await ctx.fs.stat(target, exec.signal);
        if (existing !== undefined)
            throw new Error(`apply_patch: file already exists: ${target.displayPath}`);
        ctx.emit('fs/observed', target, { kind: 'absent' }, exec);
        await writePatchedFile(ctx, target, file.content, { kind: 'createIfAbsent' }, exec, policy);
        return { path: file.path, operation: 'created' };
    }
    const sourceInfo = await observedTarget(ctx, target, exec);
    const original = await ctx.fs.readText(target, exec.signal);
    const updated = file.kind === 'delete' ? undefined : applyPatchHunks(original, file.hunks, file.path);
    if (file.kind === 'delete') {
        await deletePatchedFile(ctx, target, sourceInfo.version, exec, policy);
        return { path: file.path, operation: 'deleted' };
    }
    if (file.moveTo === undefined) {
        await writePatchedFile(ctx, target, updated, { kind: 'replaceIfVersion', version: sourceInfo.version }, exec, policy);
        return { path: file.path, operation: 'updated' };
    }
    const destination = await resolveTarget(ctx, file.moveTo, exec);
    if (destination.targetKey === target.targetKey) {
        await writePatchedFile(ctx, target, updated, { kind: 'replaceIfVersion', version: sourceInfo.version }, exec, policy);
        return { path: file.path, operation: 'updated', moveTo: file.moveTo };
    }
    const destinationInfo = await ctx.fs.stat(destination, exec.signal);
    if (destinationInfo !== undefined)
        throw new Error(`apply_patch: move destination already exists: ${destination.displayPath}`);
    ctx.emit('fs/observed', destination, { kind: 'absent' }, exec);
    await writePatchedFile(ctx, destination, updated, { kind: 'createIfAbsent' }, exec, policy);
    await deletePatchedFile(ctx, target, sourceInfo.version, exec, policy);
    return { path: file.path, operation: 'moved', moveTo: file.moveTo };
}
function patchSummary(value) {
    const letter = (operation) => {
        switch (operation) {
            case 'created': return 'A';
            case 'updated': return 'M';
            case 'deleted': return 'D';
            case 'moved': return 'M';
            default: return operation;
        }
    };
    return `Success. Updated the following files:\n${value.files.map(file => `${letter(file.operation)} ${file.operation === 'moved' ? file.moveTo : file.path}`).join('\n')}\n`;
}
function planTodos(args) {
    const seen = new Set();
    let active = 0;
    const todos = [];
    for (const item of args.plan) {
        const content = item.step.trim();
        if (content.length === 0)
            throw new Error('update_plan: every step must be non-empty');
        if (seen.has(content))
            throw new Error(`update_plan: duplicate step ${JSON.stringify(content)}`);
        seen.add(content);
        if (item.status === 'in_progress')
            active++;
        todos.push({ content, status: item.status });
    }
    if (active > 1)
        throw new Error('update_plan: at most one step may be in_progress');
    return todos;
}
function registerExecTools(ctx, config) {
    ctx.tools.register(defineTool({
        name: 'exec_command',
        description: EXEC_COMMAND_DESCRIPTION,
        parameters: {
            cmd: { type: 'string', required: true, description: 'Shell command to execute.' },
            workdir: { type: 'string', description: 'Working directory for the command. Defaults to the turn cwd.' },
            tty: { type: 'boolean', description: 'True allocates a PTY for the command; false or omitted uses plain pipes.' },
            run_in_background: { type: 'boolean', description: 'Run as a DSH background job and return its job id immediately; collect output with job_output and stop it with job_kill. Only supported for pipe-backed commands.' },
            yield_time_ms: { type: 'number', description: 'Wait before yielding output. Defaults to 10000 ms; effective range is 250-30000 ms.' },
            max_output_tokens: { type: 'number', description: 'Output token budget. Defaults to 10000 tokens; larger requests may be capped by policy.' },
            shell: { type: 'string', description: "Shell binary to launch. Defaults to the user's default shell." },
            login: { type: 'boolean', description: 'True runs the shell with -l/-i semantics; false disables them. Defaults to true.' },
        },
        output: {
            schema: {
                type: 'object',
                additionalProperties: false,
                properties: {
                    chunk_id: { type: 'string' },
                    wall_time_seconds: { type: 'number', required: true },
                    exit_code: { type: 'number' },
                    session_id: { type: 'number' },
                    job_id: { type: 'string' },
                    original_token_count: { type: 'number' },
                    output: { type: 'string', required: true },
                },
            },
            render: (_args, value) => [{ type: 'text', text: renderExecResult(value) }],
        },
        async execute(args, exec) {
            assertCapabilityEnabled(config.currentSettings, 'terminalToolsEnabled', 'exec_command');
            return runExecCommand(ctx, args, exec, config);
        },
        presentCall: args => ({
            card: 'terminal',
            title: args.cmd,
            ...args.workdir === undefined ? {} : { cwd: args.workdir },
        }),
    }));
    ctx.tools.register(defineTool({
        name: 'write_stdin',
        description: WRITE_STDIN_DESCRIPTION,
        parameters: {
            session_id: { type: 'number', required: true, description: 'Identifier of the running unified exec session.' },
            chars: { type: 'string', description: 'Characters to send to a PTY session created with tty=true. Leave empty to poll output without writing; pipe-backed sessions do not accept input.' },
            yield_time_ms: { type: 'number', description: 'Wait before yielding output. Non-empty writes default to 250 ms and cap at 30000 ms; empty polls wait 5000-300000 ms by default.' },
            max_output_tokens: { type: 'number', description: 'Output token budget. Defaults to 10000 tokens; larger requests may be capped by policy.' },
        },
        output: {
            schema: {
                type: 'object',
                additionalProperties: false,
                properties: {
                    chunk_id: { type: 'string' },
                    wall_time_seconds: { type: 'number', required: true },
                    exit_code: { type: 'number' },
                    session_id: { type: 'number' },
                    original_token_count: { type: 'number' },
                    output: { type: 'string', required: true },
                },
            },
            render: (_args, value) => [{ type: 'text', text: renderExecResult(value) }],
        },
        async execute(args, exec) {
            assertCapabilityEnabled(config.currentSettings, 'terminalToolsEnabled', 'write_stdin');
            return runWriteStdin(ctx, args, exec, config);
        },
    }));
}
function registerPatchTool(ctx, currentSettings) {
    ctx.tools.register(defineTool({
        name: 'apply_patch',
        description: APPLY_PATCH_DESCRIPTION,
        parameters: {
            input: { type: 'string', required: true, description: 'The complete patch text.' },
        },
        output: {
            schema: {
                type: 'object',
                additionalProperties: false,
                properties: {
                    files: {
                        type: 'array',
                        required: true,
                        items: {
                            type: 'object',
                            additionalProperties: false,
                            properties: {
                                path: { type: 'string', required: true },
                                operation: { type: 'string', required: true, enum: ['created', 'updated', 'deleted', 'moved'] },
                                moveTo: { type: 'string' },
                            },
                        },
                    },
                },
            },
            render: (_args, value) => [{ type: 'text', text: patchSummary(value) }],
        },
        async execute(args, exec) {
            assertCapabilityEnabled(currentSettings, 'patchToolEnabled', 'apply_patch');
            const files = parsePatch(args.input);
            const policy = resolvePolicy(ctx, exec);
            const applied = [];
            for (const file of files)
                applied.push(await applyOnePatch(ctx, file, exec, policy));
            return { files: applied };
        },
        presentCall(args) {
            return {
                card: 'generic',
                title: 'Apply patch',
                kind: 'edit',
                rawInput: args.input,
            };
        },
    }));
}
function registerPlanTool(ctx, currentSettings) {
    ctx.tools.register(defineTool({
        name: 'update_plan',
        description: UPDATE_PLAN_DESCRIPTION,
        parameters: {
            explanation: { type: 'string', description: 'Optional explanation for this plan update.' },
            plan: {
                type: 'array',
                required: true,
                description: 'The list of steps',
                items: {
                    type: 'object',
                    additionalProperties: false,
                    properties: {
                        step: { type: 'string', required: true, description: 'Task step text.' },
                        status: { type: 'string', required: true, enum: [...PLAN_STATUSES], description: 'Step status.' },
                    },
                },
            },
        },
        output: {
            schema: { type: 'object', additionalProperties: false, properties: {} },
            render: () => [{ type: 'text', text: 'Plan updated' }],
        },
        execute(args, exec) {
            assertCapabilityEnabled(currentSettings, 'planToolEnabled', 'update_plan');
            const agent = exec.agent;
            if (agent === undefined)
                throw new Error('update_plan requires an owning agent session');
            agent.session.append('todo/write', { todos: planTodos(args) });
            return Promise.resolve({});
        },
    }));
}
/** Explicit preset instructions win without changing shared tools or permissions. */
export function withPresetPrompt(settings, presetPrompt) {
    return presetPrompt === undefined ? settings : { ...settings, systemPrompt: presetPrompt };
}
/** Mount the Codex prompt/tool layer inside one fixed agent preset. */
export function apply(ctx, config = {}) {
    installPresetEditor(ctx);
    const resolved = {
        globalEnhancements: config.globalEnhancements ?? true,
        codexCore: config.codexCore ?? true,
        defaultYieldTimeMs: config.defaultYieldTimeMs ?? 10_000,
        pollYieldTimeMs: config.pollYieldTimeMs ?? 5_000,
        writeYieldTimeMs: config.writeYieldTimeMs ?? 250,
        maxOutputBytes: config.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES,
        hostedWebSearch: config.hostedWebSearch ?? true,
        remoteCompact: config.remoteCompact ?? true,
        systemPrompt: config.systemPrompt ?? DEFAULT_CODEX_SYSTEM_PROMPT,
        persona: config.persona ?? DEFAULT_CODEX_PERSONA,
        harnessSourcePrompt: config.harnessSourcePrompt ?? DEFAULT_DSH_CORE_SOURCE_PROMPT,
        webSurfacePrompt: config.webSurfacePrompt ?? DEFAULT_DSH_CORE_WEB_PROMPT,
    };
    if (resolved.codexCore
        && ctx.fs.sandboxMode !== undefined
        && ctx.get('sandboxPolicy') === undefined) {
        throw new Error('codex: a sandboxing filesystem requires ctx.sandboxPolicy');
    }
    const sharedSettings = installCodexSettings(ctx, resolved.systemPrompt, resolved.persona, resolved.harnessSourcePrompt, resolved.webSurfacePrompt);
    const codexSettings = { current: () => {
            const shared = withPresetPrompt(sharedSettings.current(), config.presetPrompt);
            return {
                ...shared,
                ...(config.promptEnabled === undefined ? {} : { promptEnabled: config.promptEnabled }),
                ...(config.terminalToolsEnabled === undefined ? {} : { terminalToolsEnabled: config.terminalToolsEnabled }),
                ...(config.patchToolEnabled === undefined ? {} : { patchToolEnabled: config.patchToolEnabled }),
                ...(config.planToolEnabled === undefined ? {} : { planToolEnabled: config.planToolEnabled }),
                ...(config.hostedWebSearchEnabled === undefined ? {} : { hostedWebSearchEnabled: config.hostedWebSearchEnabled }),
                ...(config.remoteCompactionEnabled === undefined ? {} : { remoteCompactionEnabled: config.remoteCompactionEnabled }),
            };
        } };
    const execConfig = { ...resolved, currentSettings: codexSettings.current };
    if (resolved.globalEnhancements) {
        // The generic pi-ai plugin remains the owner of provider routes. This
        // layer adds only request metadata and remote-first transport behavior.
        registerCodexActivityProjection(ctx);
        registerCodexRequestProjection(ctx);
        installCodexContextProjection(ctx, codexSettings.current);
        ctx.on('agent/request', async (payload, next) => {
            const request = await next();
            return resolveCodexRequest(ctx, request, codexSettings.current(), payload.signal);
        });
        if (typeof ctx.effect === 'function') {
            const disposeHostedWebSearch = installHostedWebSearch();
            ctx.effect(() => disposeHostedWebSearch, 'codex: Responses transport wrapper');
        }
        ctx.on('llm/stream', ((options, next) => {
            const settings = codexSettings.current();
            const responses = ModelGateway.resolve(undefined, codexProviderApi(ctx, options.provider, options.model)).supportsResponses;
            const contextWindow = options.contextWindow ?? settings.contextWindow;
            const compactionMode = codexCompactionMode();
            const legacySafeNext = () => repairLegacyPiAiContextOverflow(next(), options.model, contextWindow);
            if (options.purpose === 'compaction' && responses) {
                const useRemoteCompaction = compactionMode === 'remote'
                    || (compactionMode !== 'local' && resolved.remoteCompact && settings.remoteCompactionEnabled);
                if (useRemoteCompaction) {
                    return remoteCompactStream(ctx, options, legacySafeNext, {
                        hostedWebSearch: resolved.hostedWebSearch && settings.hostedWebSearchEnabled,
                        customApplyPatch: settings.patchToolEnabled,
                    });
                }
                return legacySafeNext();
            }
            if (options.purpose === undefined && responses) {
                return repairLegacyPiAiContextOverflow(hostedWebSearchStream(next, {
                    ...(settings.fast ? { serviceTier: 'priority' } : {}),
                    hostedWebSearch: resolved.hostedWebSearch && settings.hostedWebSearchEnabled,
                    customApplyPatch: settings.patchToolEnabled,
                }), options.model, contextWindow);
            }
            return next();
        }));
    }
    if (resolved.codexCore) {
        ctx.on('system-prompt/assemble', async (_assembly, _context, next) => {
            const assembled = await next();
            const capabilityApplied = applyCodexCapabilitySettings(assembled, codexSettings.current());
            const sectionsApplied = applyPromptSections(capabilityApplied, config.presetSections ?? {});
            return PrefixCacheTopology.optimizeAssembly(sectionsApplied);
        });
        ctx.systemPrompt.section({
            name: 'codex:base',
            order: 10,
            text: () => codexSettings.current().promptEnabled
                ? resolveCodexSystemPrompt(codexSettings.current().systemPrompt)
                : '',
        });
        ctx.systemPrompt.context?.({
            name: 'codex:reasoning',
            order: 100,
            text: () => ReasoningMachine.cotPromptGuidance(codexSettings.current().reasoningEffort),
        });
        registerExecTools(ctx, execConfig);
        registerPatchTool(ctx, codexSettings.current);
        registerPlanTool(ctx, codexSettings.current);
    }
}
export default { name, inject, Config, apply };
//# sourceMappingURL=index.js.map