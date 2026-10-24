import type { PromptAssembly } from '@deepseek-ai/dsh-system-prompt'

/** Preserve prompt authority and stable host-owned assembly order. */
export class PrefixCacheTopology {
  static optimizeAssembly(assembly: PromptAssembly): PromptAssembly {
    return assembly
  }
}
