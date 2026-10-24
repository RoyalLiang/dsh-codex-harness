/** Actual, logged request selection; never claims provider-side execution. */
import type { Context } from '@deepseek-ai/cordis'
import { z } from 'zod'

const stateSchema = z.object({
  provider: z.string(),
  model: z.string(),
  effort: z.string().optional(),
}).nullable()
export type CodexRequestSelection = z.infer<typeof stateSchema>

export function applyRequestSelection(
  state: CodexRequestSelection,
  event: { type: string; data?: unknown },
): CodexRequestSelection {
  if (event.type !== 'request/header') return state
  const config = (event.data as { header?: { config?: unknown } } | undefined)?.header?.config
  const result = z.object({ provider: z.string(), model: z.string(), reasoningEffort: z.string().optional() }).safeParse(config)
  if (!result.success) return state
  const { provider, model, reasoningEffort: effort } = result.data
  if (state?.provider === provider && state.model === model && state.effort === effort) return state
  return { provider, model, ...(effort === undefined ? {} : { effort }) }
}

export const codexRequestProjection = {
  key: 'codexRequestSelection',
  stateSchema,
  init: (): CodexRequestSelection => null,
  apply: applyRequestSelection,
  wire: { viewSchema: stateSchema, view: (state: CodexRequestSelection) => state },
  schema: stateSchema,
  view: (state: CodexRequestSelection) => state,
  stateVersion: 1,
} as const

export function registerCodexRequestProjection(ctx: Context): void {
  ctx.inject(['sessionProjections'], projected => {
    const registry = projected.get('sessionProjections') as { register(value: typeof codexRequestProjection): void }
    registry.register(codexRequestProjection)
  })
}
