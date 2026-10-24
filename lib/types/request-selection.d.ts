/** Actual, logged request selection; never claims provider-side execution. */
import type { Context } from '@deepseek-ai/cordis';
import { z } from 'zod';
declare const stateSchema: z.ZodNullable<z.ZodObject<{
    provider: z.ZodString;
    model: z.ZodString;
    effort: z.ZodOptional<z.ZodString>;
}, z.core.$strip>>;
export type CodexRequestSelection = z.infer<typeof stateSchema>;
export declare function applyRequestSelection(state: CodexRequestSelection, event: {
    type: string;
    data?: unknown;
}): CodexRequestSelection;
export declare const codexRequestProjection: {
    readonly key: "codexRequestSelection";
    readonly stateSchema: z.ZodNullable<z.ZodObject<{
        provider: z.ZodString;
        model: z.ZodString;
        effort: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>;
    readonly init: () => CodexRequestSelection;
    readonly apply: typeof applyRequestSelection;
    readonly wire: {
        readonly viewSchema: z.ZodNullable<z.ZodObject<{
            provider: z.ZodString;
            model: z.ZodString;
            effort: z.ZodOptional<z.ZodString>;
        }, z.core.$strip>>;
        readonly view: (state: CodexRequestSelection) => {
            provider: string;
            model: string;
            effort?: string | undefined;
        } | null;
    };
    readonly schema: z.ZodNullable<z.ZodObject<{
        provider: z.ZodString;
        model: z.ZodString;
        effort: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>;
    readonly view: (state: CodexRequestSelection) => {
        provider: string;
        model: string;
        effort?: string | undefined;
    } | null;
    readonly stateVersion: 1;
};
export declare function registerCodexRequestProjection(ctx: Context): void;
export {};
//# sourceMappingURL=request-selection.d.ts.map