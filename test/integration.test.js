import assert from 'node:assert/strict';
import { apply, Config } from '../src/index.js';
const defaults = Config({});
assert.deepEqual(defaults, { enabled: true, fast: false, reasoningEffort: 'inherit', contextWindow: 0, instructions: '' });
assert.throws(() => Config({ contextWindow: -1 }));
assert.throws(() => Config({ fast: 'yes' }));
const listeners = new Map();
const disposers = [];
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
const selected = { provider: 'p', model: 'm' };
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
assert.equal(requested.fast, 'unsupported-public-api');
assert.equal(requested.contextWindow, 'unsupported-public-api');
console.log('REAL_SDK_INTEGRATION_OK: schema validation, registration, passthrough, usage, isolation, bounded retention, cleanup, disabled, unsupported controls');
