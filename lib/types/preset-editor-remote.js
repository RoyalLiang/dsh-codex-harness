import { z } from 'zod';
const promptSections = z.array(z.object({ id: z.string(), label: z.string(), text: z.string().max(1_000_000), editable: z.boolean(), suppressed: z.boolean().optional() })).max(200);
const fields = {
    name: z.string().max(200), description: z.string().max(4000),
    systemPrompt: z.string().max(1_000_000), inheritPrompt: z.boolean(),
};
const codexOptions = z.object({
    promptEnabled: z.boolean(), terminalToolsEnabled: z.boolean(), patchToolEnabled: z.boolean(),
    planToolEnabled: z.boolean(), hostedWebSearchEnabled: z.boolean(), remoteCompactionEnabled: z.boolean(),
});
const codexOptionsPatch = codexOptions.partial();
const document = z.object({ ...fields, id: z.string(), revision: z.string(), editable: z.boolean(), codex: z.boolean(), codexOptions, promptSections, composition: z.string() });
const catalog = z.object({
    presets: z.array(z.object({ id: z.string(), name: z.string(), description: z.string(),
        editable: z.boolean(), isDefault: z.boolean() })),
    authorable: z.boolean(), excludedCount: z.number(),
});
function descriptor(method, parameter, input, output) {
    const id = `@shuind/dsh-codex-harness#codexPresetEditor/${method}`;
    return {
        id, service: 'codexPresetEditor', namespace: 'codexPresetEditor', method,
        invocation: { kind: 'direct' },
        parameters: parameter ? [{ name: parameter, wire: parameter, source: 'json',
                codec: { mode: 'strict', typeSymbol: `${id}:${parameter}`, schema: input } }] : [],
        result: { mode: 'strict', typeSymbol: `${id}:result`, schema: output },
    };
}
export default {
    package: '@shuind/dsh-codex-harness',
    descriptors: [
        descriptor('catalog', undefined, z.unknown(), catalog),
        descriptor('read', 'id', z.string(), document),
        descriptor('update', 'rawInput', z.object({ ...fields, id: z.string(), revision: z.string().optional(), composition: z.string().max(1_000_000).optional(), enableCodex: z.boolean().optional(), promptSections: promptSections.optional(), codexOptions: codexOptionsPatch.optional() }), document),
        descriptor('create', 'rawInput', z.object({ ...fields, sourceId: z.string(), enableCodex: z.boolean().optional(), composition: z.string().max(1_000_000).optional(), promptSections: promptSections.optional(), codexOptions: codexOptionsPatch.optional() }), document),
    ],
};
//# sourceMappingURL=preset-editor-remote.js.map