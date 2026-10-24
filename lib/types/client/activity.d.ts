/** Client-only inference used while the host activity projection frame is in flight. */
import type { ConversationSnapshot } from '@deepseek-ai/dsh-client-runtime/client';
export type ActivitySessionSnapshot = Pick<ConversationSnapshot, 'running'> & {
    /** Optional because older/newer hosts can publish the shell snapshot before the chat slice. */
    readonly partial?: ConversationSnapshot['partial'];
    readonly runningCalls?: ConversationSnapshot['runningCalls'];
    readonly turnTimings?: ConversationSnapshot['turnTimings'];
    /** Optional for hosts that predate the assembled Chat snapshot. */
    readonly chat?: ConversationSnapshot['chat'];
};
export type CodexModelActivity = {
    activity: 'requesting-model' | 'model-reply';
    startedAt: number;
};
/** Equality for selector hooks, whose default is reference identity. */
export declare function sameModelActivity(left: CodexModelActivity | undefined, right: CodexModelActivity | undefined): boolean;
/** Infer the request-phase clock from the existing conversation snapshot. */
export declare function awaitingModelStartedAt(snapshot: ActivitySessionSnapshot): number | undefined;
/** Infer the first non-empty model token timestamp from the current snapshot. */
export declare function modelReplyStartedAt(snapshot: ActivitySessionSnapshot): number | undefined;
/** Infer the two-phase model activity from the current client snapshot. */
export declare function modelActivity(snapshot: ActivitySessionSnapshot): CodexModelActivity | undefined;
//# sourceMappingURL=activity.d.ts.map