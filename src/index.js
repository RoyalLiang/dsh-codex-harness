import z from '@deepseek-ai/schemastery';
import { defineTool } from '@deepseek-ai/dsh-tools';
import { adaptReasoning } from './controls.js';
import { installPriorityTier } from './fast.js';
import { instructions } from './policy.js';
import { observeUsage } from './usage.js';

export const name = 'royalliang-codex-harness';
export const inject = ['systemPrompt', 'llm', 'tools'];
export const Config = z.object({
  enabled: z.boolean().default(true),
  fast: z.boolean().default(false),
  reasoningEffort: z.string().default('inherit'),
  contextWindow: z.natural().default(0),
  instructions: z.string().default(''),
});

export function apply(ctx, config) {
  if (!config.enabled) return;
  const reports = new Map();
  const controls = new WeakMap();
  ctx.effect(() => ctx.systemPrompt.section({
    name: 'royalliang:codex-workflow',
    order: 650,
    interpolate: false,
    text: instructions(config.instructions),
  }));
  ctx.on('agent/request', async ({ agent, signal }, next) => {
    const selected = await next();
    const adapted = await adaptReasoning(selected, config.reasoningEffort, ctx.llm, signal);
    const priority = /^gpt-/u.test(String(selected.model));
    controls.set(agent, {
      reasoning: adapted.reasoning,
      fast: config.fast ? (priority ? 'applied' : 'not-applicable') : 'inherited',
      contextWindow: config.contextWindow ? 'unsupported-public-api' : 'inherited',
    });
    return adapted.config;
  });
  ctx.on('llm/stream', (options, next) => observeUsage(next, report => {
    if (options.sessionId === undefined) return;
    // shortcut: retain only the latest call for 128 sessions; use durable host logs for accounting.
    reports.delete(options.sessionId);
    reports.set(options.sessionId, { ...report, purpose: options.purpose ?? 'conversation' });
    if (reports.size > 128) reports.delete(reports.keys().next().value);
  }));
  ctx.on('agent/disposed', ({ agent }) => reports.delete(agent.session.id));
  if (config.fast) ctx.effect(() => installPriorityTier());
  ctx.effect(() => ctx.tools.register(defineTool({
    name: 'codex_harness_status',
    description: 'Read this agent\'s last observed model usage and requested control support. Missing metrics are unknown. This is not a billing ledger.',
    parameters: {},
    output: {
      schema: { type: 'object', properties: {}, additionalProperties: true },
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }],
    },
    execute: (_args, exec) => ({
      controls: exec.agent ? controls.get(exec.agent) ?? null : null,
      usage: exec.agent ? reports.get(exec.agent.session.id) ?? null : null,
    }),
    isConcurrencySafe: () => true,
  })));
  ctx.on('dispose', () => reports.clear());
}
