const count = value => Number.isSafeInteger(value) && value >= 0;

export function usageReport(usage) {
  if (!usage || !count(usage.inputTokens) || !count(usage.outputTokens)) {
    return { status: 'unknown', reason: 'Provider usage was absent or invalid.' };
  }
  const report = {
    status: 'reported',
    uncachedInputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    reasoningTokens: count(usage.reasoningTokens) ? usage.reasoningTokens : null,
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

const tokenFields = ['uncachedInputTokens', 'outputTokens', 'reasoningTokens', 'cacheReadTokens', 'cacheWriteTokens', 'totalInputTokens', 'totalTokens'];

export function accumulateUsage(previous, report) {
  const totals = {
    calls: (previous?.calls ?? 0) + 1,
    unknownUsageCalls: (previous?.unknownUsageCalls ?? 0) + Number(report.status !== 'reported'),
    incompleteCalls: (previous?.incompleteCalls ?? 0) + Number(report.finish === 'incomplete'),
  };
  for (const field of tokenFields) {
    const before = previous ? previous[field] : 0;
    const value = report[field];
    const sum = before + value;
    totals[field] = count(before) && count(value) && count(sum) ? sum : null;
  }
  totals.cacheReadRate = totals.totalInputTokens > 0 && totals.cacheReadTokens !== null
    ? totals.cacheReadTokens / totals.totalInputTokens : null;
  return totals;
}

export function recordUsage(previous, report, purpose = 'conversation') {
  const group = ['conversation', 'compaction', 'session-title'].includes(purpose) ? purpose : 'other';
  return {
    usage: { ...report, purpose },
    totals: accumulateUsage(previous?.totals, report),
    byPurpose: {
      ...previous?.byPurpose,
      [group]: accumulateUsage(previous?.byPurpose[group], report),
    },
  };
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
