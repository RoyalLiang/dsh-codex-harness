/** Host-side activity projection for the Codex status line. */
import type { Context } from '@deepseek-ai/cordis';
import { z, type ZodType } from 'zod';
import type { CodexActivity } from './activity-types.ts';
export type { CodexActivity } from './activity-types.ts';
/** Long-running Codex activities currently surfaced to the client. */
export type CodexActivityState = CodexActivity | null;
/** Minimal event shape needed by this projection; no compaction package import is required. */
export interface CodexActivityEvent {
    type: string;
    time: number;
    data?: unknown;
}
/** Persisted and wire shape of the Codex activity value. */
export declare const codexActivitySchema: ZodType<CodexActivityState>;
/** Pure event fold, exported so its reset and reference-stability rules can be tested directly. */
export declare function applyCodexActivity(state: CodexActivityState, event: CodexActivityEvent): CodexActivityState;
export declare const codexActivityProjection: {
    readonly key: "codexActivity";
    readonly stateSchema: z.ZodType<CodexActivityState, unknown, z.core.$ZodTypeInternals<CodexActivityState, unknown>>;
    readonly init: () => CodexActivityState;
    readonly apply: typeof applyCodexActivity;
    readonly wire: {
        readonly viewSchema: z.ZodType<CodexActivityState, unknown, z.core.$ZodTypeInternals<CodexActivityState, unknown>>;
        readonly view: (state: CodexActivityState) => CodexActivityState;
    };
    readonly schema: z.ZodType<CodexActivityState, unknown, z.core.$ZodTypeInternals<CodexActivityState, unknown>>;
    readonly view: (state: CodexActivityState) => CodexActivityState;
    readonly stateVersion: 2;
};
/** Register the optional activity unit without requiring the projection seam in every assembly. */
export declare function registerCodexActivityProjection(ctx: Context): void;
//# sourceMappingURL=activity.d.ts.map