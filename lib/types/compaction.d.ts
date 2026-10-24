/** Codex compaction backend that honors the latest durable request capacity. */
import { Context } from '@deepseek-ai/cordis';
import BasicCompactionEngine from '@deepseek-ai/dsh-compaction-basic';
import type { CompactionResult, CompactionTrigger } from '@deepseek-ai/dsh-compaction';
import type { Agent } from '@deepseek-ai/dsh-agent';
/** Per-command compaction preference propagated into the LLM stream seam. */
export type CodexCompactionMode = 'remote' | 'local';
/** Run one manual compaction with an explicit local/remote preference. */
export declare function runCodexCompactionMode<T>(mode: CodexCompactionMode, task: () => Promise<T>): Promise<T>;
/** Read the explicit preference for the current compaction stream, if any. */
export declare function codexCompactionMode(): CodexCompactionMode | undefined;
/**
 * Keep the upstream compaction policy, retention, overflow recovery, and
 * transaction implementation intact. The scoped LLM seam changes only the
 * context metadata returned during a pressure check.
 */
export default class CodexCompactionEngine extends BasicCompactionEngine {
    static inject: string[];
    static Config: import("@deepseek-ai/schemastery").default<import("@deepseek-ai/dsh-compaction-basic").BasicCompactionConfig>;
    private readonly activeSession;
    constructor(ctx: Context, config?: ConstructorParameters<typeof BasicCompactionEngine>[1]);
    compactIfNeeded(agent: Agent, trigger: CompactionTrigger, signal: AbortSignal): Promise<CompactionResult | null>;
    compactNow(agent: Agent, signal: AbortSignal, sourceCommandId?: Parameters<BasicCompactionEngine['compactNow']>[2]): Promise<CompactionResult | null>;
}
//# sourceMappingURL=compaction.d.ts.map