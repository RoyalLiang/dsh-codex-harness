const GPT_MODEL = /^gpt-/u;

/**
 * Add the GPT Responses priority tier to outgoing fetch calls.
 *
 * shortcut: dsh-llm-pi-ai never passes pi-ai's `serviceTier` option, so the
 * only reachable seam is the request body. Scoped to POST Responses calls for
 * `gpt-*` models, and restored on dispose; upgrade when the host exposes a
 * public service-tier option.
 */
export function installPriorityTier(target = globalThis) {
  const original = target.fetch;
  if (typeof original !== 'function') return () => {};
  const patched = (input, init) => withPriority(original, input, init);
  target.fetch = patched;
  return () => {
    if (target.fetch === patched) target.fetch = original;
  };
}

export function withPriority(original, input, init) {
  if (init?.method?.toUpperCase() !== 'POST' || typeof init.body !== 'string') return original(input, init);
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input?.url;
  if (typeof url !== 'string' || !/\/responses(?:\/compact)?(?:\?|$)/u.test(url)) return original(input, init);
  let body;
  try {
    body = JSON.parse(init.body);
  } catch {
    return original(input, init);
  }
  if (typeof body?.model !== 'string' || !GPT_MODEL.test(body.model) || body.service_tier !== undefined) {
    return original(input, init);
  }
  return original(input, { ...init, body: JSON.stringify({ ...body, service_tier: 'priority' }) });
}
