/** Codex `exec_command` and `write_stdin` execution over dsh capability seams. */
import type { Context } from '@deepseek-ai/cordis';
import type { ToolExecution } from '@deepseek-ai/dsh-tools';
/** The exact model-facing argument vocabulary of Codex's unified exec tool. */
export interface ExecCommandArgs {
    cmd: string;
    workdir?: string;
    tty?: boolean;
    run_in_background?: boolean;
    yield_time_ms?: number;
    max_output_tokens?: number;
    shell?: string;
    login?: boolean;
}
/** The exact model-facing argument vocabulary of Codex's stdin poll tool. */
export interface WriteStdinArgs {
    session_id: number;
    chars?: string;
    yield_time_ms?: number;
    max_output_tokens?: number;
}
/** Canonical result fields shared by both unified exec tools. */
export interface ExecResult {
    chunk_id?: string;
    wall_time_seconds: number;
    output: string;
    session_id?: number;
    job_id?: string;
    exit_code?: number;
    original_token_count?: number;
}
export declare function normalizeWaitMs(value: number | undefined, fallback: number, empty?: boolean, initialExec?: boolean): number;
/** Render the ordinary Responses tool result text used by Codex's unified exec tools. */
export declare function renderExecResult(result: ExecResult): string;
/** Execute one Codex command through the configured pipe or PTY capability. */
export declare function runExecCommand(ctx: Context, args: ExecCommandArgs, exec: ToolExecution, config: {
    defaultYieldTimeMs: number;
    maxOutputBytes: number;
}): Promise<ExecResult>;
/** Poll or write to one session returned by {@link runExecCommand}. */
export declare function runWriteStdin(ctx: Context, args: WriteStdinArgs, exec: ToolExecution, config: {
    pollYieldTimeMs: number;
    writeYieldTimeMs: number;
    maxOutputBytes: number;
}): Promise<ExecResult>;
//# sourceMappingURL=exec.d.ts.map