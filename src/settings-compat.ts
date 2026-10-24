/** Bridge legacy settings documents and current Config-derived forms. */
export const CODEX_CONFIG_ENTRY_ID = 'codex-preset-installer'

export interface SettingsDescriptor {
  ns: string
  value?: unknown
  revision?: number
}

export interface CompatibleSettings {
  get?: (namespace: unknown) => unknown
  describe?: () => SettingsDescriptor[]
  update?: (namespace: unknown, patch: object, revision?: number) => Promise<void>
}

/** Current form namespaces are profile entry ids, not old document section names. */
export function settingsNamespaceMatches(namespace: unknown, logical: string): boolean {
  return namespace === logical || (logical === 'codex' && namespace === CODEX_CONFIG_ENTRY_ID)
}

/** Preserve the revision and actual namespace for optimistic Config writes. */
export function settingsDescriptor(service: unknown, namespace: string): SettingsDescriptor | undefined {
  const settings = service as CompatibleSettings | undefined
  if (typeof settings?.get === 'function') {
    return { ns: namespace, value: settings.get(namespace) }
  }
  if (typeof settings?.describe !== 'function') return undefined
  return settings.describe().find(row => settingsNamespaceMatches(row.ns, namespace))
}

/** Form values are plain snapshots; the host has already unwrapped volatile refs. */
export function readSettings<T>(service: unknown, namespace: string): T | undefined {
  return settingsDescriptor(service, namespace)?.value as T | undefined
}
