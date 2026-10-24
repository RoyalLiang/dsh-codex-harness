/** Browser controls for Codex requests and the editable operating prompt. */
import type { HostObservable, InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
import type { Context } from '@deepseek-ai/cordis';
import type { CodexActivity } from '../activity-types.ts';
import { modelActivity } from './activity.ts';
import type { PresetManagerActions } from './preset-manager.tsx';
declare const LEGACY_OVERLAY_SLOT: "conversation.input.overlay";
interface CodexSettings {
    fast: boolean;
    fastModeControlEnabled: boolean;
    contextWindow?: number;
    reasoningEffort: 'low' | 'medium' | 'high' | 'xhigh' | 'max' | 'default';
    reasoningEffortControlEnabled: boolean;
    persona?: string;
    harnessSourcePrompt?: string;
    webSurfacePrompt?: string;
    systemPrompt?: string;
    promptEnabled: boolean;
    terminalToolsEnabled: boolean;
    patchToolEnabled: boolean;
    planToolEnabled: boolean;
    hostedWebSearchEnabled: boolean;
    remoteCompactionEnabled: boolean;
    activityIndicatorEnabled: boolean;
}
/** Public settings surface shared with the host-owned configForms controller. */
interface CodexScope {
    getSnapshot(): {
        status: 'loading' | 'ready' | 'unavailable';
        value: CodexSettings | undefined;
        writable: boolean;
    };
    subscribe(listener: () => void): () => void;
    set(field: string, value: unknown): Promise<boolean>;
    unset(field: string): Promise<boolean>;
}
declare const en: {
    readonly fast: "Fast mode";
    readonly fastOn: "Fast mode on (priority tier)";
    readonly fastOff: "Fast mode off";
    readonly fastStateOn: "On";
    readonly fastStateOff: "Off";
    readonly contextSize: "Context size";
    readonly contextSizeDescription: "Next request capacity in K tokens.";
    readonly contextRestore: "Restore model default";
    readonly reasoningMenuTitle: "Reasoning Effort";
    readonly reasoningEffortLabel: "Reasoning Effort";
    readonly effortDefaultLabel: "Default";
    readonly reasoningSaveFailed: "Could not save settings. Please retry.";
    readonly requestSelection: "Last used model";
    readonly promptCardTitle: "Codex Harness";
    readonly promptCardDescription: "Edit presets, Codex capabilities, and the operating prompt. Activity status is global.";
    readonly otherCapabilitiesLabel: "Global capabilities";
    readonly capabilityPrompt: "Codex operating prompt";
    readonly capabilityPromptHint: "Inject the editable instructions and persona-first prompt layout.";
    readonly compactRemote: "Remote compaction";
    readonly compactRemoteHint: "Use the provider remote compaction endpoint first.";
    readonly compactLocal: "Local compaction";
    readonly compactLocalHint: "Use the DSH text-summary compaction engine directly.";
    readonly capabilityTerminal: "Terminal tools";
    readonly capabilityTerminalHint: "Expose exec_command and write_stdin.";
    readonly capabilityPatch: "Patch tool";
    readonly capabilityPatchHint: "Expose apply_patch, using the native Responses grammar when supported.";
    readonly capabilityPlan: "Plan tool";
    readonly capabilityPlanHint: "Expose update_plan for implementation task tracking.";
    readonly capabilityWebSearch: "Hosted web search";
    readonly capabilityWebSearchHint: "Use the provider-native Responses web_search tool when available.";
    readonly capabilityCompaction: "Remote compaction";
    readonly capabilityCompactionHint: "Prefer the provider Responses compact endpoint before local compaction.";
    readonly capabilityActivity: "Activity indicator";
    readonly capabilityActivityHint: "Show request, reply, and compaction status beside the conversation.";
    readonly promptCustomizationLabel: "Prompt customization";
    readonly personaLabel: "Persona";
    readonly personaHint: "Deployment identity and role. Supports {{model}} and {{provider}}.";
    readonly sourcePromptLabel: "DSH Core source instructions";
    readonly sourcePromptHint: "Guidance about the DSH checkout and working directory. Supports {{sourceRoot}}.";
    readonly webPromptLabel: "DSH Core Web instructions";
    readonly webPromptHint: "Guidance about this Web GUI, HMR, builds, and verification. Supports {{webUrl}}.";
    readonly promptRestoreAll: "Restore all prompt defaults";
    readonly promptLabel: "Codex operating prompt";
    readonly promptHint: "This is the Codex operating prompt. Persona and DSH Core instructions are edited separately above.";
    readonly promptUnsaved: "Unsaved";
    readonly promptDiscard: "Discard";
    readonly promptSave: "Save";
    readonly promptSaving: "Saving...";
    readonly promptSaveFailed: "Could not save the prompt.";
    readonly promptExpand: "Expand settings";
    readonly promptCollapse: "Collapse settings";
    readonly promptReadOnly: "This settings document is read-only.";
    readonly activityCompacting: "Compacting context...";
    readonly activityRequestingModel: "Requesting model...";
    readonly activityModelReply: "Model replying...";
    readonly peConnectionError: "Could not connect to the local service. Retry loading; if the connection still fails, reconnect the page.";
    readonly peReadError: "Could not read this preset. Retry loading or refresh the preset list.";
    readonly peRetryRead: "Retry loading";
    readonly peReconnect: "Reconnect page";
    readonly peSystemPrompt: "System prompt sections";
    readonly peSectionsHint: "These templates contribute to this preset’s system prompt before the tools. Runtime variables, workspace instructions and plugin-provided guidance are assembled when the conversation runs.";
    readonly peDynamicPrompt: "This field is an expression; it is preserved without executing it in the editor.";
    readonly peDshSourcePrompt: "Tells the agent where the DSH source checkout is and keeps it separate from the current workspace. It is used when inspecting or extending DSH itself.";
    readonly peDshWebPrompt: "Tells the agent which Web page it is talking through, what “this page” means, and when Web changes need a rebuild or refresh.";
    readonly peSuppressed: "Not used";
    readonly peCompletePersona: "This preset uses Persona as its entire system prompt, so this section is excluded.";
    readonly peLoading: "Reading preset…";
    readonly peTitle: "Preset editor";
    readonly peHierarchy: "Codex mode and other presets are peers. Choose one to edit, or make an editable copy of a built-in preset first.";
    readonly peSelect: "Preset";
    readonly peSelectPlaceholder: "Choose a preset…";
    readonly peEditable: "This is an editable user preset.";
    readonly peBuiltinEdit: "Built-in presets are read-only. Create a copy to edit it.";
    readonly peProfileReadOnly: "This host manages presets in its profile configuration. This panel provides a read-only preview; edit presets in the host configuration editor.";
    readonly pmReadOnly: "Read-only";
    readonly peCreateCopy: "Create editable copy";
    readonly peCodexSection: "Codex mode capabilities";
    readonly peAddCodex: "Add Codex capabilities to this preset";
    readonly peAddCodexHint: "Adds the Codex prompt, tools, hosted search, and remote compaction to this preset.";
    readonly peActivityGlobal: "Activity status is a global display setting and is shared by all presets.";
    readonly peSaveCopy: "Save new preset";
    readonly peSaved: "Saved. Select this preset in a new conversation.";
    readonly pmGlobalSettings: "Global settings";
    readonly pmRefresh: "Refresh";
    readonly pmBuiltIn: "Built-in";
    readonly pmCustom: "Custom";
    readonly pmDiscard: "Discard your unsaved changes?";
    readonly pmConflict: "This preset changed in another page or on disk. Reopen the latest version before saving.";
    readonly pmYamlError: "The configuration must be valid YAML. Your draft has not been saved.";
    readonly pmErrorDetails: "Technical details";
    readonly pmSaveError: "Could not complete this action. Your draft is still here.";
    readonly pmName: "Name";
    readonly pmDescription: "Description";
    readonly pmCancel: "Cancel";
    readonly pmSave: "Save changes";
};
type CodexKey = keyof typeof en;
declare module '@deepseek-ai/dsh-client-ui-slots' {
    interface LocaleNamespaceMap {
        codex: CodexKey;
    }
    interface SlotMap {
        'conversation.input.overlay': {
            kind: 'list';
            scope: 'session';
        };
        'settings.plugin.item': {
            kind: 'keyed';
            scope: 'root';
            owner: {
                children?: never;
            };
        };
    }
}
interface InputSettingsControlInjected {
    hooks: {
        settings: HostObservable<ReturnType<CodexScope['getSnapshot']>>;
    };
    setSetting: (field: string, value: unknown) => Promise<void>;
    unsetSetting: (field: string) => Promise<void>;
    presetManager: PresetManagerActions;
}
/** One editor per preset; only display preferences are global. */
export declare function PromptSettingsCard(props: PropsRuntime<'settings.plugin.item'> & InjectFace<InputSettingsControlInjected> & PropsLocale<'codex'>): import("react").JSX.Element | null;
type LegacyOverlayProps = PropsRuntime<typeof LEGACY_OVERLAY_SLOT> & InjectFace<InputSettingsControlInjected> & PropsLocale<'codex'>;
type ActivityProps = Pick<LegacyOverlayProps, 'sessionId' | 'useSession' | 'useSessions' | 'useProjection' | 'useSettings' | 't'>;
type ActivityFallback = ReturnType<typeof modelActivity>;
/** Persisted model used by the last request, displayed below the composer. */
export declare function RequestModelInfo(props: Pick<PropsRuntime<'conversation.composer.dock'>, 'useProjection'> & PropsLocale<'codex'>): import("react").JSX.Element | null;
export declare function RequestReasoningControl(props: InjectFace<InputSettingsControlInjected> & PropsLocale<'codex'>): import("react").JSX.Element;
/** Prefer the session snapshot when an older projection host only exposes null. */
export declare function resolveActivity(projectedActivity: CodexActivity | null | undefined, fallbackActivity: ActivityFallback): CodexActivity | null;
export declare function ActivityLine({ sessionId: _sessionId, useSession, useSessions: _useSessions, useProjection, useSettings, t, position, }: ActivityProps & {
    position?: {
        left: number;
        top: number;
    };
}): import("react").JSX.Element | null;
/** Prefer the actual Core turn status over unrelated global status nodes. */
export declare function selectTurnStatus(statuses: readonly HTMLElement[]): HTMLElement | null;
export declare const inject: string[];
/** Mount request controls and the plugin settings card through shared slots. */
export declare function apply(ctx: Context): void;
declare const _default: {
    inject: string[];
    apply: typeof apply;
};
export default _default;
//# sourceMappingURL=index.d.ts.map