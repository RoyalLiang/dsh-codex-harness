import type { Context } from '@deepseek-ai/cordis'
import type { GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { remoteCompactStream } from '../src/remote.ts'

function compactionContext(): Context {
  return {
    get: (name: string) => name === 'settings'
      ? { get: () => ({ providers: { relay: { api: 'openai-responses', baseURL: 'https://relay.example/v1', apiKeyEnv: 'RELAY_KEY' } } }) }
      : { resolve: async () => ({ value: 'secret' }) },
    logger: { warn: vi.fn() },
  } as unknown as Context
}

function compactionOptions(signal: AbortSignal): GenerateOptions {
  return {
    provider: 'relay',
    model: 'gpt-5.4',
    messages: [],
    purpose: 'compaction',
    signal,
  }
}

async function collect(stream: AsyncIterable<StreamChunk>): Promise<StreamChunk[]> {
  const chunks: StreamChunk[] = []
  for await (const chunk of stream) chunks.push(chunk)
  return chunks
}

afterEach(() => { vi.unstubAllGlobals() })

describe('remote compaction cancellation and fallback', () => {
  it('uses Config-derived provider settings for the authenticated remote endpoint', async () => {
    const request = vi.fn(async () => Response.json({
      output: [{ type: 'compaction', encrypted_content: 'opaque' }],
    }))
    vi.stubGlobal('fetch', request)
    const ctx = {
      get: (name: string) => name === 'settings' ? {
        describe: () => [{ ns: 'llm-pi-ai', value: { providers: {
          relay: { api: 'openai-responses', baseURL: 'https://relay.example/v1', apiKeyEnv: 'RELAY_KEY' },
        } } }],
      } : { resolve: async () => ({ value: 'secret' }) },
      logger: { warn: vi.fn() },
    } as unknown as Context
    const fallback = vi.fn(async function* () {
      yield { type: 'finish', reason: { kind: 'stop' } } as const
    })
    const chunks = await collect(remoteCompactStream(ctx, compactionOptions(new AbortController().signal), fallback))
    expect(request).toHaveBeenCalledWith('https://relay.example/v1/responses/compact', expect.objectContaining({
      headers: expect.objectContaining({ authorization: 'Bearer secret' }),
    }))
    expect(chunks.at(-1)).toMatchObject({ type: 'finish', reason: { kind: 'stop' } })
    expect(fallback).not.toHaveBeenCalled()
  })
  it('does not publish a completed remote summary after cancellation', async () => {
    const controller = new AbortController()
    const cancelled = new Error('compaction cancelled during response decoding')
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => {
        // Cancellation can race with an already-decoded response: fetch does
        // not retroactively reject a promise that has fulfilled successfully.
        controller.abort(cancelled)
        return { output: [{ type: 'compaction', encrypted_content: 'opaque' }] }
      },
    })))
    const fallback = vi.fn(async function* () {
      yield { type: 'finish', reason: { kind: 'stop' } } as const
    })
    const stream = remoteCompactStream(compactionContext(), compactionOptions(controller.signal), fallback)

    await expect(stream[Symbol.asyncIterator]().next()).rejects.toBe(cancelled)
    expect(fallback).not.toHaveBeenCalled()
  })

  it('does not finish successfully when cancellation arrives between summary chunks', async () => {
    const controller = new AbortController()
    const cancelled = new Error('cancelled while reading remote summary')
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({
      output: [{ type: 'compaction', encrypted_content: 'opaque' }],
    })))
    const fallback = vi.fn(async function* () {
      yield { type: 'finish', reason: { kind: 'stop' } } as const
    })
    const iterator = remoteCompactStream(
      compactionContext(), compactionOptions(controller.signal), fallback,
    )[Symbol.asyncIterator]()
    expect((await iterator.next()).value).toMatchObject({ type: 'block-start' })
    controller.abort(cancelled)
    const chunks: StreamChunk[] = []
    const drain = async () => {
      for (let result = await iterator.next(); !result.done; result = await iterator.next()) {
        chunks.push(result.value)
      }
    }

    await expect(drain()).rejects.toBe(cancelled)
    expect(chunks.some(chunk => chunk.type === 'finish')).toBe(false)
    expect(fallback).not.toHaveBeenCalled()
  })

  it('preserves cancellation errors without starting local fallback', async () => {
    const controller = new AbortController()
    const cancelled = new Error('remote request cancelled')
    vi.stubGlobal('fetch', vi.fn(async () => {
      controller.abort(cancelled)
      throw cancelled
    }))
    const fallback = vi.fn(async function* () {
      yield { type: 'finish', reason: { kind: 'stop' } } as const
    })

    await expect(collect(remoteCompactStream(
      compactionContext(), compactionOptions(controller.signal), fallback,
    ))).rejects.toBe(cancelled)
    expect(fallback).not.toHaveBeenCalled()
  })

  it('uses local fallback when the remote endpoint fails without cancellation', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 503 })))
    const fallback = vi.fn(async function* () {
      yield { type: 'finish', reason: { kind: 'stop' } } as const
    })

    await expect(collect(remoteCompactStream(
      compactionContext(), compactionOptions(new AbortController().signal), fallback,
    ))).resolves.toEqual([{ type: 'finish', reason: { kind: 'stop' } }])
    expect(fallback).toHaveBeenCalledOnce()
  })
})
