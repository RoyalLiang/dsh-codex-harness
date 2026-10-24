/** Shared host-side Codex settings contract. */
import z from '@deepseek-ai/schemastery';
import type { SettingsNamespace } from '@deepseek-ai/dsh-settings';
/** Live Codex controls shared by the Web UI and agent layer. */
export declare const CODEX_SETTINGS_NAMESPACE: SettingsNamespace;
export interface CodexSettings {
    /** Use the Responses priority service tier for GPT requests. */
    fast: boolean;
    /** Show the Fast mode switch in the conversation composer. */
    fastModeControlEnabled: boolean;
    /** Optional context capacity override, in tokens. */
    contextWindow?: number;
    /** Deployment Persona template; supports the host's prompt variables. */
    persona?: string;
    /** DSH Core source-checkout guidance template. */
    harnessSourcePrompt?: string;
    /** DSH Core Web GUI guidance template. */
    webSurfacePrompt?: string;
    /** Complete plugin-owned Codex operating prompt. */
    systemPrompt?: string;
    /** Inject the plugin-owned Codex operating prompt. */
    promptEnabled: boolean;
    /** Expose exec_command and write_stdin. */
    terminalToolsEnabled: boolean;
    /** Expose apply_patch. */
    patchToolEnabled: boolean;
    /** Expose update_plan. */
    planToolEnabled: boolean;
    /** Upgrade local web_search declarations to the hosted Responses tool. */
    hostedWebSearchEnabled: boolean;
    /** Prefer the provider's Responses compact endpoint. */
    remoteCompactionEnabled: boolean;
    /** Show the Codex request/compaction activity indicator. */
    activityIndicatorEnabled: boolean;
}
/** Default settings exposed even before a Codex session is opened. */
export declare const CODEX_SETTINGS_ENTRY: CodexSettings;
export declare const CODEX_SETTINGS_SCHEMA: z<CodexSettings>;
//# sourceMappingURL=settings.d.ts.map