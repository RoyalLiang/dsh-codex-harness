/** Codex compaction backend that honors the latest durable request capacity. */
import { AsyncLocalStorage } from 'node:async_hooks';
import BasicCompactionEngine from '@deepseek-ai/dsh-compaction-basic';
import { settingsDescriptor } from "./settings-compat.js";
/**
 * The main plugin entry and the compact-command subpath can be evaluated as
 * separate bundles. Keep their async context carrier on the process global so
 * an explicit command mode reaches the global llm/stream listener.
 */
const COMPACTION_MODE_KEY = Symbol.for('shuind.dsh-codex-harness.compaction-mode');
const COMPACTION_MODE = (() => {
    const registry = globalThis;
    const existing = registry[COMPACTION_MODE_KEY];
    if (existing !== undefined)
        return existing;
    const storage = new AsyncLocalStorage();
    registry[COMPACTION_MODE_KEY] = storage;
    return storage;
})();
/** Run one manual compaction with an explicit local/remote preference. */
export function runCodexCompactionMode(mode, task) {
    return COMPACTION_MODE.run(mode, task);
}
/** Read the explicit preference for the current compaction stream, if any. */
export function codexCompactionMode() {
    return COMPACTION_MODE.getStore();
}
const CODEX_SETTINGS_NAMESPACE = 'codex';
/** Legacy opt-out keeps context overrides limited to GPT routes. */
function isGptModel(model) {
    return /(?:^|\/)(?:gpt|chatgpt)(?:[-_.]|\d|$)/i.test(model);
}
/** Read the live Codex capacity without requiring a custom LLM service API. */
function configuredContextWindow(ctx, model) {
    const descriptor = settingsDescriptor(ctx.get('settings'), CODEX_SETTINGS_NAMESPACE);
    if (descriptor === undefined)
        return { available: false };
    const value = descriptor.value;
    if (value?.universalCodexMode === false && !isGptModel(model))
        return { available: false };
    return {
        available: true,
        ...value?.contextWindow !== undefined
            && Number.isSafeInteger(value.contextWindow)
            && value.contextWindow > 0
            ? { value: value.contextWindow }
            : {},
    };
}
/** Read an explicit capacity persisted in the request header when settings are unavailable. */
function requestContextWindow(session, provider, model) {
    const config = session.requestHeader()?.config;
    if (config?.provider !== provider || config.model !== model)
        return undefined;
    const value = config.contextWindow;
    return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : undefined;
}
/** Resolve the capacity currently in force for an active Codex compaction. */
function activeContextWindow(ctx, activeSession, provider, model) {
    const session = activeSession.getStore();
    const requestContext = session?.requestContext();
    const configured = configuredContextWindow(ctx, model);
    // A live setting must win before the old request header: automatic pressure
    // runs before the next request rebuilds that header.
    return configured.available
        ? configured.value
        : (session === undefined ? undefined : requestContextWindow(session, provider, model))
            ?? (requestContext?.provider === provider && requestContext.model === model
                ? requestContext.contextWindow
                : undefined);
}
/** Overlay capacity lookup and auxiliary summary requests for compaction. */
function withDurableContextCapacity(llm, ctx, activeSession) {
    return new Proxy(llm, {
        get(target, property) {
            if (property === 'resolveModelInfo') {
                return async (provider, model, signal) => {
                    const info = await target.resolveModelInfo(provider, model, signal);
                    const contextWindow = activeContextWindow(ctx, activeSession, provider, model);
                    if (contextWindow === undefined)
                        return info;
                    return {
                        ...info,
                        context: { ...info.context, contextWindow },
                    };
                };
            }
            if (property === 'stream') {
                return (options) => {
                    const contextWindow = activeContextWindow(ctx, activeSession, options.provider, options.model);
                    if (contextWindow === undefined || options.contextWindow === contextWindow) {
                        return target.stream(options);
                    }
                    return target.stream({ ...options, contextWindow });
                };
            }
            const value = Reflect.get(target, property, target);
            return typeof value === 'function' ? value.bind(target) : value;
        },
    });
}
/**
 * Keep the upstream compaction policy, retention, overflow recovery, and
 * transaction implementation intact. The scoped LLM seam changes only the
 * context metadata returned during a pressure check.
 */
export default class CodexCompactionEngine extends BasicCompactionEngine {
    static inject = BasicCompactionEngine.inject;
    static Config = BasicCompactionEngine.Config;
    activeSession;
    constructor(ctx, config = {}) {
        const activeSession = new AsyncLocalStorage();
        const llm = ctx.get('llm');
        if (llm === undefined)
            throw new Error('codex compaction requires ctx.llm');
        super(ctx.extend({ llm: withDurableContextCapacity(llm, ctx, activeSession) }), config);
        this.activeSession = activeSession;
    }
    compactIfNeeded(agent, trigger, signal) {
        return this.activeSession.run(agent.session, () => super.compactIfNeeded(agent, trigger, signal));
    }
    compactNow(agent, signal, sourceCommandId) {
        return this.activeSession.run(agent.session, () => super.compactNow(agent, signal, sourceCommandId));
    }
}
//# sourceMappingURL=compaction.js.map