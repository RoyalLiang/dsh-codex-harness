/** Install the user-visible Codex agent preset supplied by this bundle. */
import type { Context } from '@deepseek-ai/cordis';
/** Bundle plugin name for the preset installer. */
export declare const name = "codex-preset-installer";
export declare const inject: string[];
/**
 * Install or upgrade the single shipped Codex preset.
 *
 * The directory is committed with a staging rename so a failed copy cannot
 * leave a half-written preset that hides the mode from the roster. A known
 * shipped copy upgrades in place; any changed or unknown copy is preserved.
 *
 * @param targetDir - destination preset directory.
 * @param sourceDir - directory containing the packaged preset files.
 */
export declare function installCodexPreset(targetDir?: string, sourceDir?: string): void;
/** Remove an unmodified copy of the retired second Codex mode. */
export declare function retireLegacyCodexPreset(targetDir?: string, managedSignatures?: ReadonlySet<string>): void;
/** Current DSH declares presets in profile composition rather than filesystem roots. */
export interface PresetRegistryInstaller {
    register(definition: {
        id: string;
        name?: string;
        description?: string;
        order?: number;
        plugins: unknown[];
    }): Promise<() => void | Promise<void>>;
}
/** Read child expressions as inert Loader nodes; evaluation belongs to the mounted preset. */
export declare function bundledPresetDefinition(sourceDir?: string): {
    plugins: any[];
    order?: number;
    description?: string;
    name?: string;
    id: string;
};
/** Install the preset during profile boot without changing the host tool catalog. */
export declare function apply(ctx: Context): void;
declare const _default: {
    name: string;
    inject: string[];
    apply: typeof apply;
};
export default _default;
//# sourceMappingURL=installer.d.ts.map