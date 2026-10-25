import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { Context } from '@deepseek-ai/cordis';
import { ToolRuntime, defineTool } from '@deepseek-ai/dsh-tools';
import { createScope } from '@deepseek-ai/dsh-scope';
import { SystemPrompt } from '@deepseek-ai/dsh-system-prompt';

const hostRoot = process.env.DSH_CONTEXT_HOST_ROOT;

test('host context scenarios', { skip: hostRoot ? false : 'Set DSH_CONTEXT_HOST_ROOT to a directory containing host node_modules.' }, async t => {
  const requireHost = createRequire(join(resolve(hostRoot), 'scenario.cjs'));
  const load = name => import(pathToFileURL(requireHost.resolve(name)).href);
  const [spill, local, meter, compaction, pruner, yaml] = await Promise.all([
    load('@deepseek-ai/dsh-spill-policy'), load('@deepseek-ai/dsh-spill-local'),
    load('@deepseek-ai/dsh-token-meter/estimate'), load('@deepseek-ai/dsh-compaction-basic'),
    load('@deepseek-ai/dsh-compaction-tool-result-pruner'), load('yaml'),
  ]);
  const patch = yaml.parse(await readFile(new URL('../cordis.patch.yml', import.meta.url), 'utf8'), {
    customTags: [{ tag: 'tag:yaml.org,2002:js', resolve: value => value }],
  });
  const plugins = patch[1].insert[0].config.plugins;
  const spillConfig = plugins.find(row => row.id === 'spill-policy').config;
  const compactConfig = plugins.find(row => row.id === 'compaction').config.find(row => row.id === 'compaction-basic').config;
  assert.equal(spillConfig.maxInlineTokens, 4096);
  assert.equal(compactConfig.maxTokens, 16384);

  const root = await mkdtemp(join(tmpdir(), 'codex-context-scenario-'));
  const ctx = new Context();
  const saved = [];
  let storageFails = false;
  ctx.provide('spillStore', { async saveText(input) {
    if (storageFails) throw new Error('scenario storage unavailable');
    const result = await local.saveTextFile({ root, sessionId: input.owner.sessionId, suggestedName: input.suggestedName, content: input.content });
    saved.push({ ...result, text: input.content });
    return { locator: result.path, bytes: result.bytes, retrievalHint: 'Use read with offset/limit.' };
  } });
  await ctx.plugin(SystemPrompt);
  await ctx.plugin(ToolRuntime);
  assert.ok(ctx.tools, 'tools after runtime mount');
  await ctx.plugin(spill, { maxInlineTokens: 12500 });
  assert.ok(ctx.tools, 'tools after base policy mount');
  const agent = { session: { id: 'optimized', header: { id: 'optimized' } } };
  const scoped = createScope(ctx, agent);
  await scoped.ctx.plugin(spill, spillConfig);
  let value = '';
  const register = (name, execute = () => value, render = (_args, result) => [{ type: 'text', text: result }]) => ctx.tools.register(defineTool({
    name, description: 'Context scenario fixture.', parameters: {},
    output: { schema: { type: 'string' }, render }, execute,
  }));
  register('scenario_log');
  register('read');
  register('scenario_failure', () => { throw new Error('scenario failure'); });
  let call = 0;
  const dispatch = (name = 'scenario_log', owner = agent) => ctx.tools.execute({
    callId: `scenario-${++call}`, name, arguments: {}, agent: owner, signal: new AbortController().signal,
  });
  const text = result => result.content.filter(block => block.type === 'text').map(block => block.text).join('');

  try {
    await t.test('short results and read recovery remain complete', async () => {
      value = 'short result';
      assert.equal(text(await dispatch()), value);
      assert.equal(saved.length, 0);
      value = 'readable source\n'.repeat(7000);
      assert.equal(text(await dispatch('read')), value);
      assert.equal(saved.length, 0);
    });
    await t.test('large logs are bounded before history and their middle error is recoverable', async () => {
      value = 'START\n' + 'routine line\n'.repeat(9000) + '\nERROR_MIDDLE_42\n' + 'routine line\n'.repeat(9000) + 'END';
      const result = await dispatch();
      assert.equal(result.isError, false);
      assert.equal(result.value, value);
      assert.ok(meter.estimateContent(result.content) <= spillConfig.maxInlineTokens);
      assert.ok(text(result).includes('Full formatted result stored at:'));
      assert.ok(saved.some(item => item.text === value));
      const full = saved.find(item => item.text === value);
      assert.equal(await readFile(full.path, 'utf8'), value);
      assert.ok((await readFile(full.path, 'utf8')).includes('ERROR_MIDDLE_42'));
      const last = saved.at(-1);
      assert.ok(text(result).includes(last.path));
      assert.ok((await readFile(last.path, 'utf8')).includes(full.path) || last.path === full.path);
      t.diagnostic(`estimated text tokens: ${meter.estimateContent([{ type: 'text', text: value }])} -> ${meter.estimateContent(result.content)}; not provider usage`);
    });
    await t.test('later compaction pruning keeps recovery paths and converges in one pass', async () => {
      value = '开始🙂\n' + 'middle content\n'.repeat(6000) + '结束🙂';
      const result = await dispatch();
      const config = plugins.find(row => row.id === 'compaction').config.find(row => row.id === 'tool-result-pruner').config;
      const engine = new pruner.default(new Context(), config);
      const reduced = engine.pruneContent(result.content);
      assert.ok(reduced);
      assert.ok(engine.measureContent(reduced) <= config.thresholdChars);
      assert.ok(text({ content: reduced }).includes(saved.at(-1).path));
      assert.equal(engine.pruneContent(reduced), null);
      assert.ok(saved.some(item => item.text === value));
    });
    await t.test('ordinary sessions keep the base budget and repeated results do not mutate earlier history', async () => {
      value = 'x'.repeat(30000);
      const ordinary = await dispatch('scenario_log', { session: { header: { id: 'ordinary' } } });
      assert.equal(text(ordinary), value);
      const first = await dispatch();
      const snapshot = JSON.stringify(first);
      const second = await dispatch();
      assert.ok(meter.estimateContent(first.content) <= spillConfig.maxInlineTokens);
      assert.ok(meter.estimateContent(second.content) <= spillConfig.maxInlineTokens);
      assert.equal(JSON.stringify(first), snapshot);
    });
    await t.test('storage failure preserves the complete result and tool failures stay failures', async () => {
      storageFails = true;
      value = 'x'.repeat(100000);
      assert.equal(text(await dispatch()), value);
      storageFails = false;
      const failure = await dispatch('scenario_failure');
      assert.equal(failure.isError, true);
      assert.match(text(failure), /scenario failure/);
    });
    await t.test('cancelled calls do not execute or write recovery files', async () => {
      let ran = false;
      register('scenario_cancel', () => { ran = true; return 'unexpected'; });
      const before = saved.length;
      const result = await ctx.tools.execute({ callId: 'cancelled', name: 'scenario_cancel', arguments: {}, agent, signal: AbortSignal.abort() });
      assert.equal(result.isError, true);
      assert.equal(ran, false);
      assert.equal(saved.length, before);
    });
    await t.test('unpriced images stay visible instead of getting unreadable recovery paths', async () => {
      const image = { type: 'image', attachment: { attachmentId: 'scenario-image', mediaType: 'image/png', width: 100, height: 100 } };
      register('scenario_image', () => 'image fixture', () => [{ type: 'text', text: 'x'.repeat(30000) }, image]);
      const result = await dispatch('scenario_image');
      assert.equal(result.isError, false);
      assert.ok(result.content.some(block => block.type === 'image'));
    });
    await t.test('summary budget preserves the replayed prefix and rejects truncated checkpoints', async () => {
      const messages = [{ role: 'system', content: [{ type: 'text', text: 'stable instructions' }] }, { role: 'user', content: [{ type: 'text', text: 'goal and job-42' }] }];
      const tools = [];
      const before = JSON.stringify(messages);
      let captured;
      let truncated = false;
      const summaryCtx = new Context();
      summaryCtx.provide('llm', { async *stream(options) {
        captured = options;
        yield { type: 'block-start', index: 0, blockType: 'text' };
        yield { type: 'block-end', index: 0, block: { type: 'text', text: 'Goal: fix bug. Pending: job-42. Next: collect result.' } };
        yield { type: 'finish', reason: { kind: truncated ? 'max-tokens' : 'stop' } };
      } });
      const engine = new compaction.default(summaryCtx, compactConfig);
      const owner = { options: { provider: 'scenario', model: 'scripted' }, session: { id: 'summary', requestHeader: () => undefined, toolHistory: () => [] } };
      const result = await engine.summarize({ messages, tools }, owner);
      assert.equal(captured.maxTokens, 16384);
      assert.equal(captured.purpose, 'compaction');
      assert.deepEqual(captured.messages.slice(0, messages.length), messages);
      assert.equal(JSON.stringify(messages), before);
      assert.ok(result.summary[0].text.includes('job-42'));
      truncated = true;
      await assert.rejects(engine.summarize({ messages, tools }, owner), /truncated/);
    });
  } finally {
    await scoped.dispose();
    await ctx.registry.delete(spill);
    await ctx.registry.delete(ToolRuntime);
    // Only remove the unique directory created by this test.
    assert.ok(root.startsWith(join(tmpdir(), 'codex-context-scenario-')));
    await rm(root, { recursive: true, force: true });
  }
});
