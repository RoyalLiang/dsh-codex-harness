import test from 'node:test';
import assert from 'node:assert/strict';
import { usageReport, observeUsage, accumulateUsage, recordUsage } from '../src/usage.js';
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

test('cumulative usage weights cache reads by tokens and keeps reasoning separate', () => {
  const first = usageReport({ inputTokens: 10, outputTokens: 5, cacheReadTokens: 90, cacheWriteTokens: 0, reasoningTokens: 3, totalTokens: 105 });
  const second = usageReport({ inputTokens: 900, outputTokens: 10, cacheReadTokens: 0, cacheWriteTokens: 0, reasoningTokens: 4, totalTokens: 910 });
  const before = accumulateUsage(undefined, first);
  const totals = accumulateUsage(before, second);
  assert.equal(totals.calls, 2);
  assert.equal(totals.totalInputTokens, 1000);
  assert.equal(totals.cacheReadRate, 0.09);
  assert.equal(totals.outputTokens, 15);
  assert.equal(totals.reasoningTokens, 7);
  assert.equal(totals.totalTokens, 1015);
  assert.equal(before.calls, 1);
});

test('cumulative missing metrics remain unknown, including after later valid calls', () => {
  const partial = usageReport({ inputTokens: 10, outputTokens: 2 });
  const complete = usageReport({ inputTokens: 20, outputTokens: 3, cacheReadTokens: 30, cacheWriteTokens: 0 });
  const totals = accumulateUsage(accumulateUsage(undefined, partial), complete);
  assert.equal(totals.uncachedInputTokens, 30);
  assert.equal(totals.outputTokens, 5);
  assert.equal(totals.cacheReadTokens, null);
  assert.equal(totals.totalInputTokens, null);
  assert.equal(totals.cacheReadRate, null);
  const unknown = accumulateUsage(totals, { ...usageReport(), finish: 'incomplete' });
  assert.equal(unknown.calls, 3);
  assert.equal(unknown.unknownUsageCalls, 1);
  assert.equal(unknown.incompleteCalls, 1);
  assert.equal(unknown.uncachedInputTokens, null);
  assert.equal(accumulateUsage(unknown, complete).uncachedInputTokens, null);
});

test('cumulative counters reject unsafe sums without wrapping or inventing zeros', () => {
  const report = usageReport({ inputTokens: Number.MAX_SAFE_INTEGER, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 });
  const totals = accumulateUsage(accumulateUsage(undefined, report), report);
  assert.equal(totals.uncachedInputTokens, null);
  assert.equal(totals.totalInputTokens, null);
  assert.equal(totals.cacheReadRate, null);
  assert.equal(totals.outputTokens, 0);
});

test('usage separates auxiliary calls and bounds unfamiliar purpose groups', () => {
  const report = { ...usageReport({ inputTokens: 10, outputTokens: 2 }), finish: 'stop' };
  const first = recordUsage(undefined, report);
  const next = recordUsage(first, report, 'compaction');
  assert.equal(next.usage.purpose, 'compaction');
  assert.equal(next.totals.calls, 2);
  assert.equal(next.byPurpose.conversation.calls, 1);
  assert.equal(next.byPurpose.compaction.calls, 1);
  assert.deepEqual(Object.keys(first.byPurpose), ['conversation']);
  let entry = recordUsage(next, report, 'session-title');
  for (let index = 0; index < 100; index++) entry = recordUsage(entry, report, `unknown-${index}`);
  assert.equal(Object.keys(entry.byPurpose).length, 4);
  assert.equal(entry.byPurpose.other.calls, 100);
  assert.equal(entry.usage.purpose, 'unknown-99');
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

test('stream records only the final usage snapshot once', async () => {
  const reports = [];
  const stream = observeUsage(async function* () {
    yield { type: 'usage', usage: { inputTokens: 10, outputTokens: 1 } };
    yield { type: 'usage', usage: { inputTokens: 10, outputTokens: 5 } };
    yield { type: 'finish', reason: 'stop' };
  }, value => reports.push(value));
  for await (const chunk of stream) void chunk;
  assert.equal(reports.length, 1);
  assert.equal(reports[0].outputTokens, 5);
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
