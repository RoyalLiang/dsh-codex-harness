/** Parser and line-oriented applicator for Codex's `apply_patch` language. */
export declare const APPLY_PATCH_DESCRIPTION = "Edits files using Codex patch syntax with Begin/End Patch markers and file update directives. In hunk lines, the first character is the operation marker; repeat a source-leading marker when the source line itself starts with one.";
/** The grammar sent to providers that support OpenAI custom grammar tools. */
export declare const APPLY_PATCH_GRAMMAR: string;
export type PatchLine = {
    kind: 'context';
    text: string;
} | {
    kind: 'delete';
    text: string;
} | {
    kind: 'add';
    text: string;
};
export interface PatchHunk {
    context?: string;
    lines: PatchLine[];
    endOfFile: boolean;
}
export type PatchFile = {
    kind: 'add';
    path: string;
    content: string;
} | {
    kind: 'delete';
    path: string;
} | {
    kind: 'update';
    path: string;
    moveTo?: string;
    hunks: PatchHunk[];
};
/** Parse one complete Codex patch after normalizing CRLF input to LF. */
export declare function parsePatch(input: string): PatchFile[];
/** Apply parsed update hunks and return LF-normalized text. */
export declare function applyPatchHunks(original: string, hunks: readonly PatchHunk[], label?: string): string;
//# sourceMappingURL=patch.d.ts.map