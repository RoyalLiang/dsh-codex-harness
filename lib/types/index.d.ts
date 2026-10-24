/** Codex-compatible prompt overlay and core tools for a dsh agent preset. */
import type { Context } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
import type { LlmCallConfig } from '@deepseek-ai/dsh-llm';
import type { Session } from '@deepseek-ai/dsh-session';
import type { PromptAssembly } from '@deepseek-ai/dsh-system-prompt';
import type { CodexSettings } from './settings.ts';
export { DEFAULT_CODEX_PERSONA, DEFAULT_CODEX_SYSTEM_PROMPT, DEFAULT_DSH_CORE_SOURCE_PROMPT, DEFAULT_DSH_CORE_WEB_PROMPT, } from './prompt.ts';
export { CODEX_SETTINGS_NAMESPACE, CODEX_SETTINGS_SCHEMA } from './settings.ts';
export type { CodexSettings } from './settings.ts';
export declare const name = "codex";
export declare const inject: string[];
/** Configuration for the Codex shell result bridge. */
export interface Config {
    /** Install request/transport/activity enhancements for every agent scope. */
    globalEnhancements?: boolean;
    /** Install the Codex operating prompt and four core tools in this scope. */
    codexCore?: boolean;
    /** Default wait before a pipe-backed command yields a session id. */
    defaultYieldTimeMs?: number;
    /** Default wait for an empty `write_stdin` poll. */
    pollYieldTimeMs?: number;
    /** Default wait for a non-empty `write_stdin` send. */
    writeYieldTimeMs?: number;
    /** Maximum output retained in one canonical result, in UTF-8 bytes. */
    maxOutputBytes?: number;
    /** Send GPT Responses requests with the native hosted web_search tool first. */
    hostedWebSearch?: boolean;
    /** Use the provider's /responses/compact endpoint before local compaction. */
    remoteCompact?: boolean;
    /** Complete plugin-owned Codex operating prompt. */
    systemPrompt?: string;
    /** Explicit per-preset operating prompt; overrides the shared prompt only. */
    presetPrompt?: string;
    presetSections?: import('./prompt-sections.ts').Config;
    /** Per-preset Codex capability overrides. Omitted values follow shared settings. */
    promptEnabled?: boolean;
    terminalToolsEnabled?: boolean;
    patchToolEnabled?: boolean;
    planToolEnabled?: boolean;
    hostedWebSearchEnabled?: boolean;
    remoteCompactionEnabled?: boolean;
    /** Deployment Persona template. */
    persona?: string;
    /** DSH Core source-checkout guidance template. */
    harnessSourcePrompt?: string;
    /** DSH Core Web GUI guidance template. */
    webSurfacePrompt?: string;
}
/** Runtime configuration schema for the Codex tool bridge. */
export declare const Config: z<Config>;
/** Codex request envelope with the plugin's provider-facing service-tier field. */
export interface CodexRequestConfig extends LlmCallConfig {
    /** Codex request context capacity override, retained for older DSH hosts. */
    contextWindow?: number;
    /** Provider-facing service tier, for example Responses `priority`. */
    serviceTier?: string;
}
export interface CodexModelProfile {
    id: string;
    input?: string[];
    reasoningEfforts?: false | Record<string, string | null>;
    [key: string]: unknown;
}
/** Add Codex defaults without overwriting explicit user capabilities. */
export declare function enrichCodexModel(model: CodexModelProfile): CodexModelProfile;
/**
 * Pair the live Codex capacity with the token-meter context projection.
 *
 * The core loop records adapter metadata in `request/context`, while Codex's
 * setting is a request-scoped LLM capacity. Appending the override after the
 * loop's metadata event keeps the official ContextMeter and compaction engine
 * on the same effective capacity.
 */
export declare function syncCodexContextWindow(session: Session, contextWindow: number | undefined): void;
/** Apply the live Codex controls to one agent request without leaking them to other routes. */
export declare function applyCodexRequestSettings(request: CodexRequestConfig, settings: CodexSettings): CodexRequestConfig;
/** Put the agent persona first and omit the generic Harness identity opener. */
export declare function normalizeCodexPromptAssembly(assembly: PromptAssembly): PromptAssembly;
/** Remove disabled Codex capabilities from the next model-visible assembly. */
export declare function applyCodexCapabilitySettings(assembly: PromptAssembly, settings: CodexSettings): PromptAssembly;
/** Build the complete plugin-owned prompt, preserving an intentional empty value. */
export declare function buildCodexSystemPrompt(config?: Pick<Config, 'systemPrompt'>): string;
/** Explicit preset instructions win without changing shared tools or permissions. */
export declare function withPresetPrompt(settings: CodexSettings, presetPrompt: string | undefined): CodexSettings;
/** Mount the Codex prompt/tool layer inside one fixed agent preset. */
export declare function apply(ctx: Context, config?: Config): void;
declare const _default: {
    name: string;
    inject: string[];
    Config: z<Config>;
    apply: typeof apply;
};
export default _default;
//# sourceMappingURL=index.d.ts.map