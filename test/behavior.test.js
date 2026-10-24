import test from 'node:test';
import assert from 'node:assert/strict';
import { usageReport, observeUsage } from '../src/usage.js';
import { adaptReasoning } from '../src/controls.js';
import { instructions } from '../src/policy.js';

test('missing or invalid usage remains unknown', () => {
  for (const value of [undefined, {}, { inputTokens: -1, outputTokens: 2 }, { inputTokens: 2 }]) {
    assert.equal(usageReport(value).status, 'unknown');
  }
});

test('usage keeps disjoint cache counters and unknown fields', () => {
  const usage = usageReport({ inputTokens: 20, outputTokens: 10, cacheReadTokens: 70, cacheWriteTokens: 10 });
  assert.equal(usage.totalInputTokens, 100);
  assert.equal(usage.cacheReadRate, 0.7);
  assert.equal(usage.totalTokens, null);
  assert.equal(usageReport({ inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 }).cacheReadRate, null);
  assert.equal(usageReport({ inputTokens: 20, outputTokens: 10 }).totalInputTokens, null);
  assert.equal(usageReport({ inputTokens: Number.MAX_SAFE_INTEGER, outputTokens: 0, cacheReadTokens: 1, cacheWriteTokens: 0 }).totalInputTokens, null);
});

test('stream wrapper preserves chunks and reports normal completion', async () => {
  const chunks = [{ type: 'text', text: 'ok' }, { type: 'usage', usage: { inputTokens: 2, outputTokens: 1 } }, { type: 'finish', reason: 'stop' }];
  let report;
  const observed = [];
  for await (const chunk of observeUsage(async function* () { yield* chunks; }, value => { report = value; })) observed.push(chunk);
  assert.deepEqual(observed, chunks);
  assert.equal(report.finish, 'stop');
  assert.equal(report.uncachedInputTokens, 2);
});

test('failure propagates and early cancellation finalizes without fabricated usage', async () => {
  const failure = new Error('provider failed');
  let report;
  await assert.rejects(async () => {
    for await (const chunk of observeUsage(async function* () { throw failure; }, value => { report = value; })) void chunk;
  }, error => error === failure);
  assert.equal(report.finish, 'incomplete');
  assert.equal(report.status, 'unknown');
  const stream = observeUsage(async function* () { yield { type: 'text', text: 'partial' }; }, value => { report = value; });
  await stream.next();
  await stream.return();
  assert.equal(report.finish, 'incomplete');
});

test('reasoning inherits without lookup, applies only supported ids, and does not mutate', async () => {
  const config = { provider: 'p', model: 'm', temperature: 0.5 };
  const inherited = await adaptReasoning(config, 'inherit', { resolveModelInfo() { assert.fail('unexpected lookup'); } });
  assert.equal(inherited.config, config);
  const llm = { async resolveModelInfo(...args) { assert.deepEqual(args.slice(0, 2), ['p', 'm']); return { reasoning: { efforts: [{ id: 'high' }] } }; } };
  assert.deepEqual((await adaptReasoning(config, 'high', llm)).config, { ...config, reasoningEffort: 'high' });
  assert.equal((await adaptReasoning(config, 'unsupported', llm)).config, config);
  assert.equal(config.reasoningEffort, undefined);
});

test('model lookup and cancellation errors propagate', async () => {
  const signal = AbortSignal.abort(new Error('cancelled'));
  await assert.rejects(adaptReasoning({}, 'high', {}, signal), /cancelled/);
  await assert.rejects(adaptReasoning({}, 'high', { resolveModelInfo() { throw new Error('lookup failed'); } }), /lookup failed/);
});

test('policy is stable, capability honest, and appends configured instructions once', () => {
  assert.equal(instructions(), instructions());
  assert.ok(instructions().includes('never invent tool names'));
  assert.equal(instructions('EXTRA').split('EXTRA').length, 2);
});
