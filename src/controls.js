export async function adaptReasoning(config, requested, llm, signal) {
  if (requested === 'inherit') return { config, reasoning: 'inherited' };
  signal?.throwIfAborted();
  const model = await llm.resolveModelInfo(config.provider, config.model, signal);
  signal?.throwIfAborted();
  const supported = model.reasoning?.efforts.some(effort => effort.id === requested);
  return supported
    ? { config: { ...config, reasoningEffort: requested }, reasoning: 'applied' }
    : { config, reasoning: 'unsupported' };
}
