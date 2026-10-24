/** Shared host-side Codex settings contract. */
import z from '@deepseek-ai/schemastery';
import { CODEX_CONTEXT_MAX } from "./context.js";
import { DEFAULT_CODEX_PERSONA, DEFAULT_CODEX_SYSTEM_PROMPT, DEFAULT_DSH_CORE_SOURCE_PROMPT, DEFAULT_DSH_CORE_WEB_PROMPT, } from "./prompt.js";
/** Live Codex controls shared by the Web UI and agent layer. */
export const CODEX_SETTINGS_NAMESPACE = 'codex';
/** Default settings exposed even before a Codex session is opened. */
export const CODEX_SETTINGS_ENTRY = {
    fast: false,
    fastModeControlEnabled: true,
    persona: DEFAULT_CODEX_PERSONA,
    harnessSourcePrompt: DEFAULT_DSH_CORE_SOURCE_PROMPT,
    webSurfacePrompt: DEFAULT_DSH_CORE_WEB_PROMPT,
    systemPrompt: DEFAULT_CODEX_SYSTEM_PROMPT,
    promptEnabled: true,
    terminalToolsEnabled: true,
    patchToolEnabled: true,
    planToolEnabled: true,
    hostedWebSearchEnabled: true,
    remoteCompactionEnabled: true,
    activityIndicatorEnabled: true,
};
export const CODEX_SETTINGS_SCHEMA = z.object({
    fast: z.boolean().default(false),
    fastModeControlEnabled: z.boolean().default(true),
    contextWindow: z.number().step(1).min(1).max(CODEX_CONTEXT_MAX),
    persona: z.string().default(DEFAULT_CODEX_PERSONA),
    harnessSourcePrompt: z.string().default(DEFAULT_DSH_CORE_SOURCE_PROMPT),
    webSurfacePrompt: z.string().default(DEFAULT_DSH_CORE_WEB_PROMPT),
    systemPrompt: z.string().default(DEFAULT_CODEX_SYSTEM_PROMPT),
    promptEnabled: z.boolean().default(true),
    terminalToolsEnabled: z.boolean().default(true),
    patchToolEnabled: z.boolean().default(true),
    planToolEnabled: z.boolean().default(true),
    hostedWebSearchEnabled: z.boolean().default(true),
    remoteCompactionEnabled: z.boolean().default(true),
    activityIndicatorEnabled: z.boolean().default(true),
});
//# sourceMappingURL=settings.js.map