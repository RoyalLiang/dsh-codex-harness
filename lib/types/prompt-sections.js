import z from '@deepseek-ai/schemastery';
import { migrateLegacyCodexPersona } from "./prompt.js";
export const Config = z.object({ persona: z.string(), harnessSourcePrompt: z.string(), webSurfacePrompt: z.string() });
export const name = 'preset-prompt-sections';
export const inject = ['systemPrompt'];
/** Override only existing sections; dynamic runtime context and tool guidance remain host-owned. */
export function applyPromptSections(assembly, config) {
    const variables = { ...assembly.variables };
    variables.sourceRoot ??= assembly.sections.find(s => s.name === 'harness:source')?.text.match(/^The DeepSeek Harness implementation checkout is at (.+?)\. The checkout location/u)?.[1];
    variables.webUrl ??= assembly.sections.find(s => s.name === 'app:web-surface')?.text.match(/^You are interacting with the user through the DeepSeek Harness Web GUI at (.+?)\. When/u)?.[1];
    const values = {
        'deployment:persona': config.persona,
        'deployment:persona-prefix': config.persona,
        'harness:source': config.harnessSourcePrompt,
        'app:web-surface': config.webSurfacePrompt,
    };
    return { ...assembly, sections: assembly.sections.map(section => {
            const persona = section.name === 'deployment:persona' || section.name === 'deployment:persona-prefix';
            const text = persona ? migrateLegacyCodexPersona(values[section.name]) : values[section.name];
            if (text !== undefined)
                return { ...section, text: text.replace(/\{\{([\w.-]+)\}\}/g, (whole, key) => variables[key] ?? whole) };
            const migrated = persona ? migrateLegacyCodexPersona(section.text) : section.text;
            return migrated === section.text ? section : { ...section, text: migrated };
        }) };
}
export function apply(ctx, config) {
    ctx.on('system-prompt/assemble', async (_assembly, _context, next) => applyPromptSections(await next(), config));
}
//# sourceMappingURL=prompt-sections.js.map