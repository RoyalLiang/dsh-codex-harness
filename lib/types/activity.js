/** Host-side activity projection for the Codex status line. */
import { z } from 'zod';
/**
 * Whether a stream chunk carries visible model output.
 *
 * DSH 0.1.2 removed the runtime `isTokenDelta` helper from `dsh-llm/message`
 * while keeping the StreamChunk vocabulary unchanged. Keep this small
 * predicate local so the harness works with both the old and new DSH bundles.
 */
function isTokenDelta(chunk) {
    switch (chunk.type) {
        case 'text-delta':
        case 'reasoning-delta':
            return chunk.text !== '';
        case 'tool-call-delta':
            return chunk.argumentsDelta !== '' || chunk.name !== undefined;
        default:
            return false;
    }
}
/** Only a non-empty model delta starts the reply phase; usage and finish frames do not. */
function startsModelReply(event) {
    if (event.type === 'assistant/message')
        return true;
    if (event.type !== 'assistant/chunk' || typeof event.data !== 'object' || event.data === null)
        return false;
    const chunk = event.data.chunk;
    return chunk !== undefined && isTokenDelta(chunk);
}
/** Persisted and wire shape of the Codex activity value. */
export const codexActivitySchema = z.union([
    z.object({
        activity: z.literal('compaction'),
        startedAt: z.number().int().nonnegative(),
    }),
    z.object({
        activity: z.literal('requesting-model'),
        startedAt: z.number().int().nonnegative(),
    }),
    z.object({
        activity: z.literal('model-reply'),
        startedAt: z.number().int().nonnegative(),
    }),
    // Accepted for rolling upgrades: an older Codex host may still send this
    // ambiguous state until its projection definition is refreshed.
    z.object({
        activity: z.literal('awaiting-model'),
        startedAt: z.number().int().nonnegative(),
    }),
    z.null(),
]);
/** Pure event fold, exported so its reset and reference-stability rules can be tested directly. */
export function applyCodexActivity(state, event) {
    if (event.type === 'compaction/start')
        return { activity: 'compaction', startedAt: event.time };
    if (event.type === 'step/start' || event.type === 'llm/retry-started') {
        return { activity: 'requesting-model', startedAt: event.time };
    }
    if (startsModelReply(event)
        && (state?.activity === 'requesting-model' || state?.activity === 'awaiting-model')) {
        return { activity: 'model-reply', startedAt: event.time };
    }
    if (event.type === 'turn/start' || event.type === 'turn/end' || event.type === 'compaction/end')
        return null;
    // Keep the line through reasoning and streamed output. It is the only
    // visible indication that the model is still progressing; tool cards have
    // their own status, so a tool dispatch retires this ambient line.
    if ((state?.activity === 'requesting-model'
        || state?.activity === 'model-reply'
        || state?.activity === 'awaiting-model')
        && (event.type === 'llm/retry'
            || event.type === 'tool/call'
            || event.type === 'step/end'))
        return null;
    return state;
}
export const codexActivityProjection = {
    key: 'codexActivity',
    stateSchema: codexActivitySchema,
    init: () => null,
    apply: applyCodexActivity,
    wire: {
        viewSchema: codexActivitySchema,
        view: (state) => state,
    },
    // Keep the old projection contract working for DSH bundles that predate
    // the `stateSchema`/`wire` split.
    schema: codexActivitySchema,
    view: (state) => state,
    stateVersion: 2,
};
/** Register the optional activity unit without requiring the projection seam in every assembly. */
export function registerCodexActivityProjection(ctx) {
    ctx.inject(['sessionProjections'], (projectionCtx) => {
        projectionCtx.sessionProjections.register(codexActivityProjection);
    });
}
//# sourceMappingURL=activity.js.map