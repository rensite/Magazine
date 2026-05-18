// Anthropic Messages API provider. Fetch-based to keep bundle small and
// mocks simple (override global fetch in tests). Supports streaming via SSE.

import {
  type CompletionResult,
  type Message,
  type Provider,
  ProviderError,
} from '../types'
import { getKey, getModelOverride } from '../keys'

const API_URL = 'https://api.anthropic.com/v1/messages'
const API_VERSION = '2023-06-01'
const DEFAULT_MODEL = 'claude-haiku-4-5'

interface AnthropicContentBlock {
  type: 'text' | 'image'
  text?: string
  source?: {
    type: 'base64' | 'url'
    media_type?: string
    data?: string
    url?: string
  }
}

interface AnthropicMessage {
  role: 'user' | 'assistant'
  content: AnthropicContentBlock[]
}

const toAnthropicMessages = (messages: Message[]): AnthropicMessage[] => {
  return messages
    .filter((m) => m.role !== 'system')
    .map((m) => {
      const blocks: AnthropicContentBlock[] = []
      if (m.images?.length) {
        for (const img of m.images) {
          if (img.base64) {
            blocks.push({
              type: 'image',
              source: { type: 'base64', media_type: img.mimeType ?? 'image/jpeg', data: img.base64 },
            })
          } else if (img.url) {
            blocks.push({ type: 'image', source: { type: 'url', url: img.url } })
          }
        }
      }
      if (m.content) blocks.push({ type: 'text', text: m.content })
      return { role: m.role === 'assistant' ? 'assistant' : 'user', content: blocks }
    })
}

const systemFromMessages = (messages: Message[]): string | undefined => {
  const sys = messages.filter((m) => m.role === 'system').map((m) => m.content)
  return sys.length ? sys.join('\n\n') : undefined
}

/** Parses an Anthropic SSE stream, calling onToken for each `content_block_delta`. */
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
          type: string
          delta?: { type?: string; text?: string }
          usage?: { input_tokens?: number; output_tokens?: number }
          message?: { usage?: { input_tokens?: number; output_tokens?: number } }
        }
        if (evt.type === 'content_block_delta' && evt.delta?.text) {
          fullText += evt.delta.text
          onToken(evt.delta.text)
        } else if (evt.type === 'message_delta' && evt.usage) {
          usage = {
            inputTokens: evt.usage.input_tokens,
            outputTokens: evt.usage.output_tokens,
          }
        } else if (evt.type === 'message_start' && evt.message?.usage) {
          usage = {
            inputTokens: evt.message.usage.input_tokens,
            outputTokens: evt.message.usage.output_tokens,
          }
        }
      } catch {
        // Skip malformed SSE line — we'll see it as missing tokens, not a crash.
      }
    }
  }
  return { text: fullText, usage }
}

export const claudeProvider: Provider = {
  id: 'claude',
  async complete({ system, messages, maxTokens, temperature, onToken, signal, preferredModel }) {
    const apiKey = getKey('claude')
    const streaming = !!onToken
    const sys = system ?? systemFromMessages(messages)

    const body = {
      // Priority: user override (Settings) > caller's per-call preference > hardcoded default.
      model: getModelOverride('claude') ?? preferredModel ?? DEFAULT_MODEL,
      max_tokens: maxTokens ?? 4096,
      temperature: temperature ?? 0.7,
      stream: streaming,
      ...(sys ? { system: sys } : {}),
      messages: toAnthropicMessages(messages),
    }

    let res: Response
    try {
      res = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': API_VERSION,
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify(body),
        signal,
      })
    } catch (err) {
      throw new ProviderError('claude', 'network error', err)
    }

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new ProviderError(
        'claude',
        `${res.status} ${res.statusText}: ${text.slice(0, 200)}`,
        undefined,
        res.status >= 500 || res.status === 429,
      )
    }

    if (streaming && res.body) {
      const { text, usage } = await consumeStream(res.body, onToken!)
      return { text, usage, servedBy: 'claude' }
    }

    const json = (await res.json()) as {
      content?: Array<{ type: string; text?: string }>
      usage?: { input_tokens?: number; output_tokens?: number }
    }
    const text = (json.content ?? [])
      .filter((b) => b.type === 'text')
      .map((b) => b.text ?? '')
      .join('')
    return {
      text,
      usage: json.usage
        ? { inputTokens: json.usage.input_tokens, outputTokens: json.usage.output_tokens }
        : undefined,
      servedBy: 'claude',
    }
  },
}
