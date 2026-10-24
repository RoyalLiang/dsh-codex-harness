/**
 * Domain: Ephemeral Thought Pruner (Token Economics)
 *
 * Prunes historic reasoning tokens from previous turns when replaying
 * context history, drastically reducing token consumption and preventing
 * exponential context growth in multi-turn sessions.
 */

export interface MessageWithReasoning {
  role: string
  content?: unknown
  reasoning?: unknown
  [key: string]: unknown
}

export class EphemeralThoughtPruner {
  /**
   * Prune historic reasoning deltas/tokens from past assistant messages,
   * preserving only the final text output and tool calls.
   * Keeps the latest assistant turn intact for immediate verification.
   */
  static pruneHistory<T extends MessageWithReasoning>(messages: readonly T[]): T[] {
    if (!Array.isArray(messages) || messages.length <= 1) return [...messages]

    return messages.map((msg, index) => {
      // Keep user and non-assistant messages unchanged
      if (msg.role !== 'assistant') return msg

      // Keep the most recent turn's reasoning intact for immediate continuity
      if (index >= messages.length - 1) return msg

      // For older assistant messages, strip reasoning field if present
      if ('reasoning' in msg && msg.reasoning !== undefined) {
        const { reasoning: _pruned, ...withoutReasoning } = msg
        return withoutReasoning as T
      }

      return msg
    })
  }
}
