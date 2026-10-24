import type { Context } from '@deepseek-ai/cordis';
import { TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
import type { CodexSettings } from './settings.ts';
import type { CodexPresetOptions, PresetCatalog, PresetCreateInput, PresetEditorInput, PresetEditorDocument, PresetPromptSection } from './preset-contract.ts';
export type { PresetEditorInput, PresetEditorDocument } from './preset-contract.ts';
export declare const DEFAULT_CODEX_PRESET_OPTIONS: CodexPresetOptions;
export interface ResolvedPresetForEditor {
    id: string;
    trust?: 'system' | 'user';
    path?: string;
    broken?: string;
    name?: string;
    description?: string;
}
export interface AgentPresetsForEditor {
    list?(): Promise<ResolvedPresetForEditor[]>;
    readonly defaultId?: string;
    readonly authorable?: boolean;
    resolve(id: string): Promise<ResolvedPresetForEditor>;
    readDocument(id: string): Promise<{
        content: string;
        name?: string;
        description?: string;
    }>;
    remoteExportList(): Promise<{
        presets: Array<{
            id: string;
            name?: string;
            description?: string;
            trust: 'system' | 'user';
            isDefault: boolean;
            broken?: string;
        }>;
        authorable: boolean;
    }>;
    copy?(from: string, id: string, name?: string): Promise<void>;
    remove?(id: string): Promise<void>;
    readonly roots?: readonly {
        path: string;
        trust: 'system' | 'user';
    }[];
}
export declare function readPromptSections(content: string, shared?: Partial<CodexSettings>): PresetPromptSection[];
/** Patch the contributing fields, not a disconnected secondary prompt. */
export declare function patchPromptSections(content: string, sections: PresetPromptSection[]): string;
export declare function readCodexPresetOptions(content: string): CodexPresetOptions;
export declare function supportsCodex(content: string): boolean;
/** Structural validation only: executable tags stay inert until DSH mounts a selected preset. */
export declare function validateComposition(content: string): void;
export declare function enhanceComposition(content: string): string;
export declare function readPresetSystemPrompt(content: string): string;
export declare function patchPresetComposition(content: string, prompt: string, inherit?: boolean): string;
/** Store user-facing Codex capability switches in the Harness row. */
export declare function patchCodexPresetOptions(content: string, options: Partial<CodexPresetOptions>): string;
export declare function patchPresetMetadata(content: string, name: string, description: string): string;
export declare class CodexPresetEditor extends TypertRemoteService {
    static inject: string[];
    private readonly agentPresets;
    private sharedSettings?;
    private indexed?;
    constructor(ctx: Context, _config?: undefined);
    catalog(): Promise<PresetCatalog>;
    read(id: string): Promise<PresetEditorDocument>;
    create(rawInput: PresetCreateInput): Promise<PresetEditorDocument>;
    update(rawInput: PresetEditorInput): Promise<PresetEditorDocument>;
    private preset;
}
export default CodexPresetEditor;
//# sourceMappingURL=preset-editor.d.ts.map