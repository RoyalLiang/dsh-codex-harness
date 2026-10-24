import { z } from 'zod';
const stateSchema = z.object({
    provider: z.string(),
    model: z.string(),
    effort: z.string().optional(),
}).nullable();
export function applyRequestSelection(state, event) {
    if (event.type !== 'request/header')
        return state;
    const config = event.data?.header?.config;
    const result = z.object({ provider: z.string(), model: z.string(), reasoningEffort: z.string().optional() }).safeParse(config);
    if (!result.success)
        return state;
    const { provider, model, reasoningEffort: effort } = result.data;
    if (state?.provider === provider && state.model === model && state.effort === effort)
        return state;
    return { provider, model, ...(effort === undefined ? {} : { effort }) };
}
export const codexRequestProjection = {
    key: 'codexRequestSelection',
    stateSchema,
    init: () => null,
    apply: applyRequestSelection,
    wire: { viewSchema: stateSchema, view: (state) => state },
    schema: stateSchema,
    view: (state) => state,
    stateVersion: 1,
};
export function registerCodexRequestProjection(ctx) {
    ctx.inject(['sessionProjections'], projected => {
        const registry = projected.get('sessionProjections');
        registry.register(codexRequestProjection);
    });
}
//# sourceMappingURL=request-selection.js.map