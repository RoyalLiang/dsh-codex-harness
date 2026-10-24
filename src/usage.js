const count = value => Number.isSafeInteger(value) && value >= 0;

export function usageReport(usage) {
  if (!usage || !count(usage.inputTokens) || !count(usage.outputTokens)) {
    return { status: 'unknown', reason: 'Provider usage was absent or invalid.' };
  }
  const report = {
    status: 'reported',
    uncachedInputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    cacheReadTokens: count(usage.cacheReadTokens) ? usage.cacheReadTokens : null,
    cacheWriteTokens: count(usage.cacheWriteTokens) ? usage.cacheWriteTokens : null,
  };
  // DSH counters are disjoint; an absent cache counter is unknown, not zero.
  const knownCache = report.cacheReadTokens !== null && report.cacheWriteTokens !== null;
  const input = knownCache
    ? usage.inputTokens + report.cacheReadTokens + report.cacheWriteTokens : null;
  report.totalInputTokens = count(input) ? input : null;
  report.cacheReadRate = report.totalInputTokens > 0 ? report.cacheReadTokens / input : null;
  report.totalTokens = count(usage.totalTokens) ? usage.totalTokens : null;
  return report;
}

export async function* observeUsage(next, record) {
  let usage;
  let finish;
  try {
    for await (const chunk of next()) {
      if (chunk.type === 'usage') usage = chunk.usage;
      if (chunk.type === 'finish') finish = chunk.reason;
      yield chunk;
    }
  } finally {
    record({ ...usageReport(usage), finish: finish ?? 'incomplete' });
  }
}
