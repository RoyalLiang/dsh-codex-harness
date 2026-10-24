/** Bridge legacy settings documents and current Config-derived forms. */
export declare const CODEX_CONFIG_ENTRY_ID = "codex-preset-installer";
export interface SettingsDescriptor {
    ns: string;
    value?: unknown;
    revision?: number;
}
export interface CompatibleSettings {
    get?: (namespace: unknown) => unknown;
    describe?: () => SettingsDescriptor[];
    update?: (namespace: unknown, patch: object, revision?: number) => Promise<void>;
}
/** Current form namespaces are profile entry ids, not old document section names. */
export declare function settingsNamespaceMatches(namespace: unknown, logical: string): boolean;
/** Preserve the revision and actual namespace for optimistic Config writes. */
export declare function settingsDescriptor(service: unknown, namespace: string): SettingsDescriptor | undefined;
/** Form values are plain snapshots; the host has already unwrapped volatile refs. */
export declare function readSettings<T>(service: unknown, namespace: string): T | undefined;
//# sourceMappingURL=settings-compat.d.ts.map