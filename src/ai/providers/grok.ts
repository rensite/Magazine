// xAI Grok provider via OpenAI-compatible Chat Completions API.
// Also supports image generation via grok image endpoint.

import {
  type CompletionResult,
  type GeneratedImage,
  type Message,
  type Provider,
  ProviderError,
} from '../types'
import { getKey, getModelOverride } from '../keys'

const BASE = 'https://api.x.ai/v1'
// xAI does NOT publish `-latest` aliases — every model ID needs the date
// suffix or its canonical version. `grok-3` is the current multimodal
// flagship (handles text AND vision in one model), and `grok-2-image-1212`
// is the image-generation model. If these 404, call listGrokModels() from
// devtools — it hits GET /v1/models and returns whatever your account has.
const TEXT_MODEL = 'grok-3'
const VISION_MODEL = 'grok-3'
const IMAGE_MODEL = 'grok-2-image-1212'

interface GrokContentPart {
  type: 'text' | 'image_url'
  text?: string
  image_url?: { url: string }
}

interface GrokMessage {
  role: 'system' | 'user' | 'assistant'
  content: string | GrokContentPart[]
}

const toGrokMessages = (system: string | undefined, messages: Message[]): GrokMessage[] => {
  const out: GrokMessage[] = []
  if (system) out.push({ role: 'system', content: system })
  for (const m of messages) {
    if (m.role === 'system') {
      out.push({ role: 'system', content: m.content })
      continue
    }
    if (m.images?.length) {
      const parts: GrokContentPart[] = []
      for (const img of m.images) {
        if (img.url) {
          parts.push({ type: 'image_url', image_url: { url: img.url } })
        } else if (img.base64) {
          parts.push({
            type: 'image_url',
            image_url: { url: `data:${img.mimeType ?? 'image/jpeg'};base64,${img.base64}` },
          })
        }
      }
      if (m.content) parts.push({ type: 'text', text: m.content })
      out.push({ role: m.role, content: parts })
    } else {
      out.push({ role: m.role, content: m.content })
    }
  }
  return out
}

const systemFromMessages = (messages: Message[]): string | undefined => {
  const sys = messages.filter((m) => m.role === 'system').map((m) => m.content)
  return sys.length ? sys.join('\n\n') : undefined
}

/** Parse OpenAI-style SSE. Each event: `data: {...}` with choices[0].delta.content. */
const consumeStream = async (
  body: ReadableStream<Uint8Array>,
  onToken: (delta: string) => void,
): Promise<{ text: string; usage?: CompletionResult['usage'] }> => {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let fullText = ''
  let usage: CompletionResult['usage'] | undefined

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      const payload = line.slice(6).trim()
      if (!payload || payload === '[DONE]') continue
      try {
        const evt = JSON.parse(payload) as {
          choices?: Array<{ delta?: { content?: string } }>
          usage?: { prompt_tokens?: number; completion_tokens?: number }
        }
        const delta = evt.choices?.[0]?.delta?.content
        if (delta) {
          fullText += delta
          onToken(delta)
        }
        if (evt.usage) {
          usage = {
            inputTokens: evt.usage.prompt_tokens,
            outputTokens: evt.usage.completion_tokens,
          }
        }
      } catch {
        // Skip malformed line.
      }
    }
  }
  return { text: fullText, usage }
}

export const grokProvider: Provider = {
  id: 'grok',
  async complete({ system, messages, maxTokens, temperature, onToken, signal }) {
    const apiKey = getKey('grok')
    const streaming = !!onToken
    const hasImages = messages.some((m) => m.images?.length)
    const model = getModelOverride('grok') ?? (hasImages ? VISION_MODEL : TEXT_MODEL)
    const sys = system ?? systemFromMessages(messages)

    const body = {
      model,
      stream: streaming,
      max_tokens: maxTokens ?? 4096,
      temperature: temperature ?? 0.7,
      messages: toGrokMessages(sys, messages.filter((m) => m.role !== 'system')),
    }

    let res: Response
    try {
      res = await fetch(`${BASE}/chat/completions`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
        signal,
      })
    } catch (err) {
      throw new ProviderError('grok', 'network error', err)
    }

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      const isModelNotFound =
        res.status === 400 &&
        (text.includes('Model not found') || text.includes('model not found'))
      const hint = isModelNotFound
        ? ` (Hint: model "${model}" doesn't exist on your account. Run listGrokModels() from devtools, then set the override in Settings — xAI does not publish "-latest" aliases.)`
        : ''
      throw new ProviderError(
        'grok',
        `${res.status} ${res.statusText}: ${text.slice(0, 200)}${hint}`,
        undefined,
        res.status >= 500 || res.status === 429,
      )
    }

    if (streaming && res.body) {
      const { text, usage } = await consumeStream(res.body, onToken!)
      return { text, usage, servedBy: 'grok' }
    }

    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>
      usage?: { prompt_tokens?: number; completion_tokens?: number }
    }
    const text = json.choices?.[0]?.message?.content ?? ''
    return {
      text,
      usage: json.usage
        ? { inputTokens: json.usage.prompt_tokens, outputTokens: json.usage.completion_tokens }
        : undefined,
      servedBy: 'grok',
    }
  },
  async generateImage({ prompt, signal }) {
    const apiKey = getKey('grok')
    const body = {
      model: IMAGE_MODEL,
      prompt,
      n: 1,
      response_format: 'b64_json',
    }
    let res: Response
    try {
      res = await fetch(`${BASE}/images/generations`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
        signal,
      })
    } catch (err) {
      throw new ProviderError('grok', 'image network error', err)
    }
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new ProviderError('grok', `image ${res.status}: ${text.slice(0, 200)}`)
    }
    const json = (await res.json()) as {
      data?: Array<{ b64_json?: string; revised_prompt?: string }>
    }
    const first = json.data?.[0]
    if (!first?.b64_json) {
      throw new ProviderError('grok', 'image response missing b64_json')
    }
    return {
      base64: first.b64_json,
      mimeType: 'image/jpeg',
      servedBy: 'grok',
      revisedPrompt: first.revised_prompt,
    } as GeneratedImage
  },
}

/**
 * Debug helper: lists every Grok model the current API key has access to.
 * xAI exposes an OpenAI-compatible /v1/models endpoint. Call from the
 * browser console:
 *
 *   (await import('@/ai')).listGrokModels().then(console.table)
 *
 * Returns trimmed { id, ownedBy, created } rows — useful when the
 * configured model id 404s.
 */
export const listAvailableModels = async (): Promise<
  Array<{ id: string; ownedBy?: string; created?: number }>
> => {
  const apiKey = getKey('grok')
  const res = await fetch(`${BASE}/models`, {
    headers: { authorization: `Bearer ${apiKey}` },
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`listGrokModels failed: ${res.status} ${text.slice(0, 200)}`)
  }
  const json = (await res.json()) as {
    data?: Array<{ id?: string; owned_by?: string; created?: number }>
  }
  return (json.data ?? [])
    .map((m) => ({ id: m.id ?? '', ownedBy: m.owned_by, created: m.created }))
    .filter((m) => m.id.length > 0)
    .sort((a, b) => a.id.localeCompare(b.id))
}
