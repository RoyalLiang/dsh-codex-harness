import test from 'node:test';
import assert from 'node:assert/strict';
import { Context } from '@deepseek-ai/cordis';
import { ToolRuntime } from '@deepseek-ai/dsh-tools';
import { SystemPrompt } from '@deepseek-ai/dsh-system-prompt';
import { LlmAdapter, LlmRuntime } from '@deepseek-ai/dsh-llm';
import * as plugin from '../src/index.js';

test('real host lifecycle smoke', async t => {
  const ctx = new Context();
  const originalFetch = globalThis.fetch;
  await ctx.plugin(SystemPrompt);
  await ctx.plugin(ToolRuntime);
  await ctx.plugin(LlmRuntime);
  class ScriptedAdapter extends LlmAdapter {
    async *stream() {
      yield { type: 'usage', usage: { inputTokens: 1, outputTokens: 0 } };
      yield { type: 'usage', usage: { inputTokens: 7, outputTokens: 2, cacheReadTokens: 3, cacheWriteTokens: 0 } };
      yield { type: 'finish', reason: { kind: 'stop' } };
    }
  }
  const unregister = ctx.llm.registerAdapter(['scenario'], new ScriptedAdapter());
  const agent = { session: { id: 'host-smoke', header: { id: 'host-smoke' } } };
  const options = { provider: 'scenario', model: 'scripted', messages: [], sessionId: agent.session.id };
  let call = 0;
  const status = async () => {
    const result = await ctx.tools.execute({ callId: `status-${++call}`, name: 'codex_harness_status', arguments: {}, agent, signal: new AbortController().signal });
    assert.equal(result.isError, false);
    return result.value;
  };
  try {
    await ctx.plugin(plugin, {});
    await t.test('actual model streams retain final usage and isolate auxiliary purposes', async () => {
      const chunks = [];
      for await (const chunk of ctx.llm.stream(options)) chunks.push(chunk);
      assert.equal(chunks.length, 3);
      assert.deepEqual(chunks.at(-1).reason, { kind: 'stop' });
      const first = await status();
      assert.equal(first.totals.calls, 1);
      assert.equal(first.usage.uncachedInputTokens, 7);
      assert.equal(first.totals.cacheReadRate, 0.3);
      for await (const chunk of ctx.llm.stream({ ...options, purpose: 'compaction' })) void chunk;
      for await (const chunk of ctx.llm.stream({ ...options, sessionId: undefined })) void chunk;
      const next = await status();
      assert.equal(next.totals.calls, 2);
      assert.equal(next.byPurpose.conversation.calls, 1);
      assert.equal(next.byPurpose.compaction.calls, 1);
    });
    await t.test('session disposal isolates a reopened session from the old stream', async () => {
      const stale = ctx.llm.stream(options)[Symbol.asyncIterator]();
      assert.equal((await stale.next()).value.type, 'usage');
      await ctx.parallel('agent/disposed', { agent });
      assert.equal((await status()).totals, null);
      for await (const chunk of ctx.llm.stream(options)) void chunk;
      await stale.return();
      const current = await status();
      assert.equal(current.totals.calls, 1);
      assert.equal(current.totals.uncachedInputTokens, 7);
    });
    await t.test('unload and reload preserve fetch ownership and discard pending reports', async () => {
      const pending = ctx.llm.stream(options)[Symbol.asyncIterator]();
      await pending.next();
      await ctx.registry.delete(plugin);
      assert.equal(ctx.tools.get('codex_harness_status'), undefined);
      assert.equal(globalThis.fetch, originalFetch);
      await ctx.plugin(plugin, {});
      assert.equal((await status()).totals, null);
      await pending.return();
      assert.equal((await status()).totals, null);
      for await (const chunk of ctx.llm.stream(options)) void chunk;
      assert.equal((await status()).totals.calls, 1);
    });
    await t.test('disabled plugin leaves host streaming available without registering its tool', async () => {
      await ctx.registry.delete(plugin);
      await ctx.plugin(plugin, { enabled: false });
      assert.equal(ctx.tools.get('codex_harness_status'), undefined);
      const chunks = [];
      for await (const chunk of ctx.llm.stream(options)) chunks.push(chunk);
      assert.equal(chunks.length, 3);
      assert.equal(globalThis.fetch, originalFetch);
    });
  } finally {
    await ctx.registry.delete(plugin);
    unregister();
    await ctx.registry.delete(LlmRuntime);
    await ctx.registry.delete(ToolRuntime);
    await ctx.registry.delete(SystemPrompt);
  }
});
