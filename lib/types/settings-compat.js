/** Bridge legacy settings documents and current Config-derived forms. */
export const CODEX_CONFIG_ENTRY_ID = 'codex-preset-installer';
/** Current form namespaces are profile entry ids, not old document section names. */
export function settingsNamespaceMatches(namespace, logical) {
    return namespace === logical || (logical === 'codex' && namespace === CODEX_CONFIG_ENTRY_ID);
}
/** Preserve the revision and actual namespace for optimistic Config writes. */
export function settingsDescriptor(service, namespace) {
    const settings = service;
    if (typeof settings?.get === 'function') {
        return { ns: namespace, value: settings.get(namespace) };
    }
    if (typeof settings?.describe !== 'function')
        return undefined;
    return settings.describe().find(row => settingsNamespaceMatches(row.ns, namespace));
}
/** Form values are plain snapshots; the host has already unwrapped volatile refs. */
export function readSettings(service, namespace) {
    return settingsDescriptor(service, namespace)?.value;
}
//# sourceMappingURL=settings-compat.js.map