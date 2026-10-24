import { AsyncLocalStorage } from "node:async_hooks";
import BasicCompactionEngine from "@deepseek-ai/dsh-compaction-basic";
//#region lib/types/compaction.js
/** Codex compaction backend that honors the latest durable request capacity. */
/**
* The main plugin entry and the compact-command subpath can be evaluated as
* separate bundles. Keep their async context carrier on the process global so
* an explicit command mode reaches the global llm/stream listener.
*/
const COMPACTION_MODE_KEY = Symbol.for("shuind.dsh-codex-harness.compaction-mode");
const COMPACTION_MODE = (() => {
	const registry = globalThis;
	const existing = registry[COMPACTION_MODE_KEY];
	if (existing !== void 0) return existing;
	const storage = new AsyncLocalStorage();
	registry[COMPACTION_MODE_KEY] = storage;
	return storage;
})();
/** Run one manual compaction with an explicit local/remote preference. */
function runCodexCompactionMode(mode, task) {
	return COMPACTION_MODE.run(mode, task);
}
/** Read the explicit preference for the current compaction stream, if any. */
function codexCompactionMode() {
	return COMPACTION_MODE.getStore();
}
const CODEX_SETTINGS_NAMESPACE = "codex";
/** Codex context overrides apply only to GPT-compatible model routes. */
function isGptModel(model) {
	return /(?:^|\/)(?:gpt|chatgpt)(?:[-_.]|\d|$)/i.test(model);
}
/** Read the live Codex capacity without requiring a custom LLM service API. */
function configuredContextWindow(ctx) {
	const settings = ctx.get("settings");
	if (settings?.get === void 0) return { available: false };
	const value = settings?.get?.(CODEX_SETTINGS_NAMESPACE);
	return {
		available: true,
		...value?.contextWindow !== void 0 && Number.isSafeInteger(value.contextWindow) && value.contextWindow > 0 ? { value: value.contextWindow } : {}
	};
}
/** Read an explicit capacity persisted in the request header when settings are unavailable. */
function requestContextWindow(session, provider, model) {
	const config = session.requestHeader()?.config;
	if (config?.provider !== provider || config.model !== model) return void 0;
	const value = config.contextWindow;
	return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : void 0;
}
/** Resolve the capacity currently in force for an active Codex compaction. */
function activeContextWindow(ctx, activeSession, provider, model) {
	const session = activeSession.getStore();
	const requestContext = session?.requestContext();
	const configured = isGptModel(model) ? configuredContextWindow(ctx) : { available: false };
	return configured.available ? configured.value : (session === void 0 ? void 0 : requestContextWindow(session, provider, model)) ?? (requestContext?.provider === provider && requestContext.model === model ? requestContext.contextWindow : void 0);
}
/** Overlay capacity lookup and auxiliary summary requests for compaction. */
function withDurableContextCapacity(llm, ctx, activeSession) {
	return new Proxy(llm, { get(target, property) {
		if (property === "resolveModelInfo") return async (provider, model, signal) => {
			const info = await target.resolveModelInfo(provider, model, signal);
			const contextWindow = activeContextWindow(ctx, activeSession, provider, model);
			if (contextWindow === void 0) return info;
			return {
				...info,
				context: {
					...info.context,
					contextWindow
				}
			};
		};
		if (property === "stream") return (options) => {
			const contextWindow = activeContextWindow(ctx, activeSession, options.provider, options.model);
			if (contextWindow === void 0 || options.contextWindow === contextWindow) return target.stream(options);
			return target.stream({
				...options,
				contextWindow
			});
		};
		const value = Reflect.get(target, property, target);
		return typeof value === "function" ? value.bind(target) : value;
	} });
}
/**
* Keep the upstream compaction policy, retention, overflow recovery, and
* transaction implementation intact. The scoped LLM seam changes only the
* context metadata returned during a pressure check.
*/
var CodexCompactionEngine = class extends BasicCompactionEngine {
	static inject = BasicCompactionEngine.inject;
	static Config = BasicCompactionEngine.Config;
	activeSession;
	constructor(ctx, config = {}) {
		const activeSession = new AsyncLocalStorage();
		const llm = ctx.get("llm");
		if (llm === void 0) throw new Error("codex compaction requires ctx.llm");
		super(ctx.extend({ llm: withDurableContextCapacity(llm, ctx, activeSession) }), config);
		this.activeSession = activeSession;
	}
	compactIfNeeded(agent, trigger, signal) {
		return this.activeSession.run(agent.session, () => super.compactIfNeeded(agent, trigger, signal));
	}
	compactNow(agent, signal, sourceCommandId) {
		return this.activeSession.run(agent.session, () => super.compactNow(agent, signal, sourceCommandId));
	}
};
//#endregion
export { codexCompactionMode, CodexCompactionEngine as default, runCodexCompactionMode };
