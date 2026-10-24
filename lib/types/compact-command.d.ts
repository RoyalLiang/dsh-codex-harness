/** Codex-aware `/compact` command with an optional transport preference. */
import type { Context } from '@deepseek-ai/cordis';
/** Replace the Core command inside the Codex compaction scope. */
export declare function apply(ctx: Context): void;
export declare const name = "compact-command";
export declare const inject: string[];
declare const _default: {
    name: string;
    inject: string[];
    apply: typeof apply;
};
export default _default;
//# sourceMappingURL=compact-command.d.ts.map