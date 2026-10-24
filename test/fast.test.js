import assert from 'node:assert/strict';
import test from 'node:test';
import { installPriorityTier, withPriority } from '../src/fast.js';

const URL_RESPONSES = 'http://example.test/v1/responses';
const gpt = () => JSON.stringify({ model: 'gpt-6.1-sol', input: [] });

test('withPriority adds the priority tier to GPT Responses calls', () => {
  let seen;
  const original = (_input, init) => { seen = JSON.parse(init.body); return 'ok'; };
  const result = withPriority(original, URL_RESPONSES, { method: 'POST', body: gpt() });
  assert.equal(result, 'ok');
  assert.equal(seen.service_tier, 'priority');
  assert.equal(seen.model, 'gpt-6.1-sol');
});

test('withPriority leaves non-GPT, non-POST and explicit tier calls alone', () => {
  let calls = 0;
  const original = () => { calls += 1; };
  withPriority(original, URL_RESPONSES, { method: 'POST', body: JSON.stringify({ model: 'deepseek-v4-pro' }) });
  withPriority(original, URL_RESPONSES, { method: 'GET', body: gpt() });
  withPriority(original, 'http://example.test/v1/chat/completions', { method: 'POST', body: gpt() });
  withPriority(original, URL_RESPONSES, { method: 'POST', body: JSON.stringify({ model: 'gpt-6', service_tier: 'flex' }) });
  assert.equal(calls, 4);
});

test('installPriorityTier patches and restores only its own fetch', () => {
  const target = { fetch: () => 'original' };
  const restore = installPriorityTier(target);
  assert.notEqual(target.fetch, undefined);
  target.fetch = () => 'replaced';
  restore();
  assert.equal(target.fetch(), 'replaced');
});
