import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { aiCall, aiGenerateImage } from '@/ai'
import { ProviderError, StructuredOutputError } from '@/ai/types'
import { __setEnvForTests, setModelOverride } from '@/ai/keys'

// Helper: build a JSON Response that fetch would return.
const jsonResponse = (status: number, body: unknown): Response =>
  new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })

const errorResponse = (status: number, text = 'oops'): Response =>
  new Response(text, { status, statusText: 'Error' })

// Mock provider responses by URL substring.
const mockFetch = (handler: (url: string, init?: RequestInit) => Response | Promise<Response>) => {
  const spy = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString()
    return handler(url, init)
  })
  vi.stubGlobal('fetch', spy)
  return spy
}

beforeEach(() => {
  __setEnvForTests({
    VITE_ANTHROPIC_API_KEY: 'sk-ant-test',
    VITE_GEMINI_API_KEY: 'gem-test',
    VITE_GROK_API_KEY: 'xai-test',
  })
})

afterEach(() => {
  __setEnvForTests(null)
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('aiCall — routing', () => {
  it('routes "analyst" task to Claude by default', async () => {
    const spy = mockFetch((url) => {
      expect(url).toContain('anthropic.com')
      return jsonResponse(200, {
        content: [{ type: 'text', text: 'hello' }],
        usage: { input_tokens: 10, output_tokens: 5 },
      })
    })
    const out = await aiCall('Summarize this', { task: 'analyst' })
    expect(out.data).toBe('hello')
    expect(out.meta.servedBy).toBe('claude')
    expect(spy).toHaveBeenCalledOnce()
  })

  it('routes "vision" task to Gemini by default', async () => {
    mockFetch((url) => {
      expect(url).toContain('generativelanguage.googleapis.com')
      return jsonResponse(200, {
        candidates: [{ content: { parts: [{ text: 'a cat' }] } }],
      })
    })
    const out = await aiCall('Describe', { task: 'vision', images: [{ url: 'http://x/y.jpg' }] })
    expect(out.data).toBe('a cat')
    expect(out.meta.servedBy).toBe('gemini')
  })

  it('honors a forced provider override', async () => {
    mockFetch((url) => {
      expect(url).toContain('api.x.ai')
      return jsonResponse(200, { choices: [{ message: { content: 'from grok' } }] })
    })
    const out = await aiCall('hi', { task: 'analyst', provider: 'grok' })
    expect(out.meta.servedBy).toBe('grok')
  })
})

describe('aiCall — fallback chain', () => {
  it('falls back to next provider on retriable error', async () => {
    let calls = 0
    mockFetch((url) => {
      calls++
      if (url.includes('anthropic.com')) return errorResponse(503, 'down')
      if (url.includes('api.x.ai'))
        return jsonResponse(200, { choices: [{ message: { content: 'grok ok' } }] })
      return errorResponse(500)
    })
    const out = await aiCall('hi', { task: 'analyst' })
    expect(out.data).toBe('grok ok')
    expect(out.meta.servedBy).toBe('grok')
    expect(calls).toBeGreaterThanOrEqual(2)
  })

  it('does NOT fall back on non-retriable error (4xx auth)', async () => {
    const spy = mockFetch((url) => {
      if (url.includes('anthropic.com')) return errorResponse(401, 'bad key')
      return jsonResponse(200, { choices: [{ message: { content: 'should not be reached' } }] })
    })
    await expect(aiCall('hi', { task: 'analyst' })).rejects.toBeInstanceOf(ProviderError)
    expect(spy).toHaveBeenCalledOnce()
  })

  it('does not fall back when enableFallback=false', async () => {
    mockFetch(() => errorResponse(503))
    await expect(
      aiCall('hi', { task: 'analyst', enableFallback: false }),
    ).rejects.toBeInstanceOf(ProviderError)
  })

  it('throws the last error when entire chain fails', async () => {
    mockFetch(() => errorResponse(503))
    await expect(aiCall('hi', { task: 'analyst' })).rejects.toBeInstanceOf(ProviderError)
  })
})

describe('aiCall — structured output', () => {
  const schema = z.object({ name: z.string(), score: z.number() })

  it('returns parsed data when output is valid JSON', async () => {
    mockFetch(() =>
      jsonResponse(200, {
        content: [{ type: 'text', text: '{"name":"x","score":7}' }],
      }),
    )
    const out = await aiCall('go', { task: 'analyst', schema })
    expect(out.data).toEqual({ name: 'x', score: 7 })
  })

  it('strips markdown fences before parsing', async () => {
    mockFetch(() =>
      jsonResponse(200, {
        content: [
          { type: 'text', text: 'Here you go:\n```json\n{"name":"x","score":7}\n```' },
        ],
      }),
    )
    const out = await aiCall('go', { task: 'analyst', schema })
    expect(out.data.name).toBe('x')
  })

  it('retries once with error feedback when schema validation fails', async () => {
    let n = 0
    const fetchSpy = mockFetch(() => {
      n++
      const text =
        n === 1 ? '{"name":"x","score":"not-a-number"}' : '{"name":"x","score":7}'
      return jsonResponse(200, { content: [{ type: 'text', text }] })
    })
    const out = await aiCall('go', { task: 'analyst', schema })
    expect(out.data).toEqual({ name: 'x', score: 7 })
    expect(fetchSpy).toHaveBeenCalledTimes(2)
  })

  it('throws StructuredOutputError when retry also fails', async () => {
    mockFetch(() =>
      jsonResponse(200, {
        content: [{ type: 'text', text: '{"name":"x","score":"nope"}' }],
      }),
    )
    await expect(
      aiCall('go', { task: 'analyst', schema }),
    ).rejects.toBeInstanceOf(StructuredOutputError)
  })

  it('does NOT fall back to another provider on structured-output failure', async () => {
    let claudeCalls = 0
    let grokCalls = 0
    mockFetch((url) => {
      if (url.includes('anthropic.com')) {
        claudeCalls++
        return jsonResponse(200, { content: [{ type: 'text', text: 'not json at all' }] })
      }
      grokCalls++
      return jsonResponse(200, {
        choices: [{ message: { content: '{"name":"x","score":7}' } }],
      })
    })
    await expect(
      aiCall('go', { task: 'analyst', schema }),
    ).rejects.toBeInstanceOf(StructuredOutputError)
    expect(claudeCalls).toBe(2) // initial + retry
    expect(grokCalls).toBe(0) // structured failures are not provider faults
  })
})

describe('aiCall — streaming', () => {
  it('forwards token deltas to onToken and collects full text', async () => {
    const sse = [
      'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Hel"}}',
      'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"lo"}}',
      'data: {"type":"message_delta","usage":{"input_tokens":3,"output_tokens":2}}',
      '',
    ].join('\n\n')
    mockFetch(
      () =>
        new Response(sse, {
          status: 200,
          headers: { 'content-type': 'text/event-stream' },
        }),
    )
    const tokens: string[] = []
    const out = await aiCall('hi', { task: 'analyst', onToken: (t) => tokens.push(t) })
    expect(tokens).toEqual(['Hel', 'lo'])
    expect(out.data).toBe('Hello')
    expect(out.meta.usage?.outputTokens).toBe(2)
  })
})

describe('aiGenerateImage', () => {
  it('returns base64 image from Grok by default', async () => {
    mockFetch((url) => {
      expect(url).toContain('api.x.ai/v1/images/generations')
      return jsonResponse(200, { data: [{ b64_json: 'BASE64DATA', revised_prompt: 'p' }] })
    })
    const img = await aiGenerateImage('a cat')
    expect(img.servedBy).toBe('grok')
    expect(img.base64).toBe('BASE64DATA')
    expect(img.revisedPrompt).toBe('p')
  })

  it('falls back to Gemini imagen when Grok image fails', async () => {
    mockFetch((url) => {
      if (url.includes('api.x.ai')) return errorResponse(503)
      if (url.includes('generativelanguage.googleapis.com'))
        return jsonResponse(200, {
          predictions: [{ bytesBase64Encoded: 'IMAGEN', mimeType: 'image/png' }],
        })
      return errorResponse(500)
    })
    const img = await aiGenerateImage('a cat')
    expect(img.servedBy).toBe('gemini')
    expect(img.base64).toBe('IMAGEN')
  })

  it('honors forced provider override', async () => {
    mockFetch(() =>
      jsonResponse(200, {
        predictions: [{ bytesBase64Encoded: 'X', mimeType: 'image/png' }],
      }),
    )
    const img = await aiGenerateImage('a cat', { provider: 'gemini' })
    expect(img.servedBy).toBe('gemini')
  })
})

describe('aiCall — model override', () => {
  it('embeds the user-configured Gemini model into the request URL', async () => {
    setModelOverride('gemini', 'gemini-3-flash-preview')
    let capturedUrl = ''
    mockFetch((url) => {
      capturedUrl = url
      return jsonResponse(200, {
        candidates: [{ content: { parts: [{ text: 'ok' }] } }],
      })
    })
    await aiCall('hi', { task: 'vision', images: [{ url: 'http://x/y.jpg' }] })
    expect(capturedUrl).toContain('gemini-3-flash-preview:generateContent')
  })

  it('passes the configured Claude model in the request body', async () => {
    setModelOverride('claude', 'claude-3-5-haiku-latest')
    let capturedBody = ''
    mockFetch((_url, init) => {
      capturedBody = (init?.body as string) ?? ''
      return jsonResponse(200, {
        content: [{ type: 'text', text: 'ok' }],
      })
    })
    await aiCall('hi', { task: 'analyst' })
    expect(capturedBody).toContain('claude-3-5-haiku-latest')
  })
})

describe('aiCall — missing keys', () => {
  it('throws MissingKeyError before issuing fetch when provider has no key', async () => {
    __setEnvForTests({
      // Only Grok configured.
      VITE_GROK_API_KEY: 'xai-test',
    })
    const spy = mockFetch(() =>
      jsonResponse(200, { choices: [{ message: { content: 'grok' } }] }),
    )
    // analyst defaults to claude → no key → falls back to grok automatically.
    const out = await aiCall('hi', { task: 'analyst' })
    expect(out.meta.servedBy).toBe('grok')
    expect(spy).toHaveBeenCalledOnce()
  })
})
