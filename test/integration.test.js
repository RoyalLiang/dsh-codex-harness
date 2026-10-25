import assert from 'node:assert/strict';
import { apply, Config } from '../src/index.js';
const defaults = Config({});
assert.deepEqual({ ...defaults, fast: defaults.fast.get() }, { enabled: true, fast: false, reasoningEffort: 'inherit', contextWindow: 0, instructions: '' });
const schema = Config.toJSON();
assert.equal(schema.refs[schema.refs[schema.uid].dict.fast].meta.volatile, true);
assert.throws(() => Config({ contextWindow: -1 }));
assert.throws(() => Config({ fast: 'yes' }));
const listeners = new Map();
const disposers = [];
const originalFetch = globalThis.fetch;
let section;
let tool;
const ctx = {
  effect(effect) { disposers.push(effect()); },
  on(name, listener) { listeners.set(name, listener); },
  systemPrompt: { section(value) { section = value; return () => { section = undefined; }; } },
  tools: { register(value) { tool = value; return () => { tool = undefined; }; } },
};
apply(ctx, defaults);
assert.equal(section.interpolate, false);
assert.equal(tool.name, 'codex_harness_status');
assert.equal(tool.output.schema.type, 'object');
const agent = { session: { id: 'session-1' } };
const selected = { provider: 'p', model: 'gpt-6.1-sol' };
assert.equal(await listeners.get('agent/request')({ agent }, async () => selected), selected);
const stream = listeners.get('llm/stream')({ sessionId: 'session-1' }, async function* () {
  yield { type: 'usage', usage: { inputTokens: 10, outputTokens: 2 } };
  yield { type: 'finish', reason: 'stop' };
});
for await (const chunk of stream) void chunk;
const report = await tool.execute({}, { agent });
assert.equal(report.usage.uncachedInputTokens, 10);
assert.equal(report.usage.cacheReadTokens, null);
assert.equal(report.controls.reasoning, 'inherited');
assert.equal(report.totals.calls, 1);
assert.equal(report.byPurpose.conversation.uncachedInputTokens, 10);
const compaction = listeners.get('llm/stream')({ sessionId: 'session-1', purpose: 'compaction' }, async function* () {
  yield { type: 'usage', usage: { inputTokens: 5, outputTokens: 3, cacheReadTokens: 20, cacheWriteTokens: 0 } };
  yield { type: 'finish', reason: 'stop' };
});
for await (const chunk of compaction) void chunk;
const cumulative = await tool.execute({}, { agent });
assert.equal(cumulative.usage.purpose, 'compaction');
assert.equal(cumulative.totals.calls, 2);
assert.equal(cumulative.totals.uncachedInputTokens, 15);
assert.equal(cumulative.totals.totalInputTokens, null);
assert.equal(cumulative.byPurpose.compaction.totalInputTokens, 25);
assert.equal(cumulative.byPurpose.compaction.cacheReadRate, 0.8);
assert.equal(cumulative.byPurpose.conversation.calls, 1);
const failed = listeners.get('llm/stream')({ sessionId: 'session-1' }, async function* () { throw new Error('offline'); });
await assert.rejects(async () => { for await (const chunk of failed) void chunk; }, /offline/);
const failureReport = await tool.execute({}, { agent });
assert.equal(failureReport.totals.unknownUsageCalls, 1);
assert.equal(failureReport.totals.incompleteCalls, 1);
assert.equal(failureReport.byPurpose.compaction.calls, 1);
listeners.get('agent/disposed')({ agent });
assert.equal((await tool.execute({}, { agent })).totals, null);
assert.equal((await tool.execute({}, { agent })).byPurpose, null);
assert.equal((await tool.execute({}, { agent: { session: { id: 'other' } } })).usage, null);
for (let index = 0; index < 129; index++) {
  const call = listeners.get('llm/stream')({ sessionId: `bounded-${index}` }, async function* () {
    yield { type: 'usage', usage: { inputTokens: 1, outputTokens: 0 } };
  });
  for await (const chunk of call) void chunk;
}
assert.equal((await tool.execute({}, { agent: { session: { id: 'bounded-0' } } })).usage, null);
assert.equal((await tool.execute({}, { agent: { session: { id: 'bounded-128' } } })).usage.uncachedInputTokens, 1);
listeners.get('agent/disposed')({ agent });
assert.equal((await tool.execute({}, { agent })).usage, null);
for (const dispose of disposers) dispose?.();
assert.equal(section, undefined);
assert.equal(tool, undefined);
let touched = false;
apply({ effect() { touched = true; }, on() { touched = true; } }, { ...defaults, enabled: false });
assert.equal(touched, false);
apply(ctx, Config({ fast: true, contextWindow: 8192 }));
await listeners.get('agent/request')({ agent }, async () => selected);
const requested = (await tool.execute({}, { agent })).controls;
assert.equal(requested.fast, 'applied');
await listeners.get('agent/request')({ agent }, async () => ({ provider: 'p', model: 'deepseek-v4-flash' }));
assert.equal((await tool.execute({}, { agent })).controls.fast, 'not-applicable');
for (const dispose of disposers) dispose?.();
assert.equal(globalThis.fetch, originalFetch);
assert.equal(requested.contextWindow, 'unsupported-public-api');
console.log('REAL_SDK_INTEGRATION_OK: schema validation, registration, passthrough, usage, isolation, bounded retention, cleanup, disabled, applied fast only for GPT, fast restore, unsupported context window');
