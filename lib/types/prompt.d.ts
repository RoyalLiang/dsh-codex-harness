/** Default plugin-owned Codex operating prompt. */
export declare const DEFAULT_CODEX_SYSTEM_PROMPT: string;
/** Default deployment Persona template used by the Codex preset. */
export declare const DEFAULT_CODEX_PERSONA: string;
/** Upgrade only the exact shipped default; custom variable references remain strict. */
export declare function migrateLegacyCodexPersona(text: string | undefined): string | undefined;
/** Default DSH Core source-checkout guidance template. */
export declare const DEFAULT_DSH_CORE_SOURCE_PROMPT: string;
/** Default DSH Core Web runtime guidance template. */
export declare const DEFAULT_DSH_CORE_WEB_PROMPT: string;
/** Resolve the full plugin-owned prompt, preserving intentional empty overrides. */
export declare function resolveCodexSystemPrompt(systemPrompt?: string): string;
//# sourceMappingURL=prompt.d.ts.map