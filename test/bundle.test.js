import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);

test('package publishes the client bundle', async () => {
  const pkg = JSON.parse(await readFile(new URL('package.json', root), 'utf8'));
  assert.equal(pkg.exports['./client'].default, './lib/client.js');
  assert.ok(pkg.files.includes('lib'));
  assert.equal(pkg.dsh.client.platform, 'web');
});

test('published README links resolve to included package documents', async () => {
  const pkg = JSON.parse(await readFile(new URL('package.json', root), 'utf8'));
  for (const file of ['README.md', 'README.en.md']) {
    const text = await readFile(new URL(file, root), 'utf8');
    for (const [, link] of text.matchAll(/\[[^\]]*\]\(([^)]+)\)/gu)) {
      if (/^(?:https?:|#)/u.test(link)) continue;
      const target = link.split('#')[0];
      assert.ok(pkg.files.some(entry => target === entry || target.startsWith(`${entry}/`)), `${file}: ${target} is not published`);
      await readFile(new URL(target, root));
    }
  }
});

test('patch declares the plugin entry and the Codex preset', async () => {
  const patch = await readFile(new URL('cordis.patch.yml', root), 'utf8');
  assert.equal(patch.match(/^- insert:/gmu)?.length, 2);
  assert.match(patch, /id: royalliang-codex-harness/u);
  assert.match(patch, /id: royalliang-codex-preset/u);
  assert.match(patch, /id: royalliang-codex/u);
  assert.match(patch, /name: Codex 模式/u);
  assert.match(patch, /prefix: You are Codex, a coding agent based on the \{\{model\}\} model\./u);
  assert.match(patch, /name: '@deepseek-ai\/dsh-spill-policy'\s+config:\s+maxInlineTokens: 4096/u);
  assert.match(patch, /name: '@deepseek-ai\/dsh-compaction-basic'\s+config:\s+maxTokens: 16384/u);
});

test('client bundle registers the input controls', async () => {
  const client = await readFile(new URL('lib/client.js', root), 'utf8');
  assert.match(client, /window\.__ModuleLoader__\.load/u);
  assert.match(client, /conversation\.input\.right/u);
  assert.match(client, /const ENTRY = "royalliang-codex-harness"/u);
  assert.match(client, /scope\.configForms\.get\(ENTRY\)/u);
  assert.match(client, /form\.set\("fast", next\)/u);
  assert.match(client, /scope\.modelDirectories\.directoryFor\(sessionId\)/u);
});
