import type { Context } from '@deepseek-ai/cordis';
import type { PromptAssembly } from '@deepseek-ai/dsh-system-prompt';
import z from '@deepseek-ai/schemastery';
export interface Config {
    persona?: string;
    harnessSourcePrompt?: string;
    webSurfacePrompt?: string;
}
export declare const Config: z<Config>;
export declare const name = "preset-prompt-sections";
export declare const inject: string[];
/** Override only existing sections; dynamic runtime context and tool guidance remain host-owned. */
export declare function applyPromptSections(assembly: PromptAssembly, config: Config): PromptAssembly;
export declare function apply(ctx: Context, config: Config): void;
//# sourceMappingURL=prompt-sections.d.ts.map