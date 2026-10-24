import type { InjectFace, PropsLocale } from '@deepseek-ai/dsh-client-ui-slots';
import type { RemoteResult, TypertClientRemote } from '@deepseek-ai/dsh-typert-protocol';
import type { PresetCatalog, PresetCreateInput, PresetEditorDocument, PresetEditorInput } from '../preset-contract.ts';
export interface PresetClientRemote extends TypertClientRemote {
    codexPresetEditor: {
        catalog(): Promise<RemoteResult<PresetCatalog>>;
        read(id: string): Promise<RemoteResult<PresetEditorDocument>>;
        update(input: PresetEditorInput): Promise<RemoteResult<PresetEditorDocument>>;
        create(input: PresetCreateInput): Promise<RemoteResult<PresetEditorDocument>>;
    };
}
export interface PresetManagerActions {
    remote: PresetClientRemote;
    ready: Promise<void>;
}
type Props = InjectFace<{
    presetManager: PresetManagerActions;
}> & PropsLocale<'codex'>;
/** Presets are peers: choose one to edit, or make an editable copy first. */
export declare function PresetManagerCard({ presetManager, t }: Props): import("react").JSX.Element;
export default PresetManagerCard;
//# sourceMappingURL=preset-manager.d.ts.map