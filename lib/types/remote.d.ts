import type { Context } from '@deepseek-ai/cordis';
import type { GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm';
export interface RemoteCodexConfig {
    hostedWebSearch: boolean;
    remoteCompact: boolean;
}
interface JsonObject {
    [key: string]: unknown;
}
interface CodexRequestWireOptions {
    /** Provider-facing request option preserved by older DSH LLM adapters. */
    serviceTier?: string;
    /** Whether local web_search should become the hosted Responses tool. */
    hostedWebSearch?: boolean;
    /** Whether apply_patch should use the Responses custom grammar tool. */
    customApplyPatch?: boolean;
}
export declare function isGptModel(model: unknown): model is string;
/** Replace DSH's JSON function declaration with the Responses custom grammar tool. */
export declare function addCodexApplyPatch(body: JsonObject): JsonObject;
/** Replay apply_patch calls as custom tool items after pi-ai's generic conversion. */
export declare function rewriteCodexApplyPatchHistory(body: JsonObject): JsonObject;
/** Compose the plugin-only Responses rewrites without changing DSH's tool API. */
export declare function rewriteCodexResponsesBody(body: JsonObject, options?: Pick<CodexRequestWireOptions, 'hostedWebSearch' | 'customApplyPatch'>): JsonObject;
/** Convert a generic DSH Responses tool list to the hosted Codex variant. */
export declare function addHostedWebSearch(body: JsonObject): JsonObject;
/** Replace the text placeholder written by dsh-compaction-basic with the native item. */
export declare function replaceRemoteCompactions(body: JsonObject): JsonObject;
/** Enable the transport patch for this Codex plugin scope only. */
export declare function installHostedWebSearch(): () => void;
/** Iterate an existing DSH stream with the hosted-request context installed. */
export declare function hostedWebSearchStream(next: () => AsyncIterable<StreamChunk>, options?: CodexRequestWireOptions): AsyncIterable<StreamChunk>;
/**
 * Correct the usage-only overflow verdict emitted by pi-ai adapters that do
 * not yet consume the request-scoped Codex capacity.
 */
export declare function repairLegacyPiAiContextOverflow(stream: AsyncIterable<StreamChunk>, model: string, contextWindow: unknown): AsyncIterable<StreamChunk>;
/** Remote-first compaction waterfall with the existing DSH path as fallback. */
export declare function remoteCompactStream(ctx: Context, options: GenerateOptions, next: () => AsyncIterable<StreamChunk>, wireOptions?: CodexRequestWireOptions): AsyncIterable<StreamChunk>;
export {};
//# sourceMappingURL=remote.d.ts.map