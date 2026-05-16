// Google Gemini provider via Generative Language REST API.
// Also supports image generation via Imagen 3.

import {
  type CompletionResult,
  type GeneratedImage,
  type Message,
  type Provider,
  ProviderError,
} from '../types'
import { getKey } from '../keys'

const BASE = 'https://generativelanguage.googleapis.com/v1beta'
const TEXT_MODEL = 'gemini-2.0-flash'
const VISION_MODEL = 'gemini-2.0-flash'
const IMAGE_MODEL = 'imagen-3.0-generate-002'

interface GeminiPart {
  text?: string
  inline_data?: { mime_type: string; data: string }
  file_data?: { mime_type: string; file_uri: string }
}

interface GeminiContent {
  role: 'user' | 'model'
  parts: GeminiPart[]
}

const toGeminiContents = (messages: Message[]): GeminiContent[] => {
  return messages
    .filter((m) => m.role !== 'system')
    .map((m) => {
      const parts: GeminiPart[] = []
      if (m.images?.length) {
        for (const img of m.images) {
          if (img.base64) {
            parts.push({
              inline_data: { mime_type: img.mimeType ?? 'image/jpeg', data: img.base64 },
            })
          } else if (img.url) {
            // file_data requires a Google-hosted file. For Supabase-signed URLs,
            // the caller should download to base64 first. We pass the URL as a
            // best-effort hint via text — providers ignore unknown fields.
            parts.push({ file_data: { mime_type: 'image/jpeg', file_uri: img.url } })
          }
        }
      }
      if (m.content) parts.push({ text: m.content })
      return { role: m.role === 'assistant' ? 'model' : 'user', parts }
    })
}

const systemFromMessages = (messages: Message[]): string | undefined => {
  const sys = messages.filter((m) => m.role === 'system').map((m) => m.content)
  return sys.length ? sys.join('\n\n') : undefined
}

/** Parse Gemini SSE — each event is `data: {...}` with candidates[0].content.parts[*].text. */
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
          candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
          usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number }
        }
        const parts = evt.candidates?.[0]?.content?.parts ?? []
        for (const p of parts) {
          if (p.text) {
            fullText += p.text
            onToken(p.text)
          }
        }
        if (evt.usageMetadata) {
          usage = {
            inputTokens: evt.usageMetadata.promptTokenCount,
            outputTokens: evt.usageMetadata.candidatesTokenCount,
          }
        }
      } catch {
        // Skip malformed SSE line.
      }
    }
  }
  return { text: fullText, usage }
}

export const geminiProvider: Provider = {
  id: 'gemini',
  async complete({ system, messages, maxTokens, temperature, onToken, signal }) {
    const apiKey = getKey('gemini')
    const streaming = !!onToken
    const hasImages = messages.some((m) => m.images?.length)
    const model = hasImages ? VISION_MODEL : TEXT_MODEL
    const path = streaming ? 'streamGenerateContent' : 'generateContent'
    const url = `${BASE}/models/${model}:${path}?key=${apiKey}${streaming ? '&alt=sse' : ''}`
    const sys = system ?? systemFromMessages(messages)

    const body = {
      contents: toGeminiContents(messages),
      ...(sys ? { system_instruction: { parts: [{ text: sys }] } } : {}),
      generationConfig: {
        maxOutputTokens: maxTokens ?? 4096,
        temperature: temperature ?? 0.7,
      },
    }

    let res: Response
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal,
      })
    } catch (err) {
      throw new ProviderError('gemini', 'network error', err)
    }

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new ProviderError(
        'gemini',
        `${res.status} ${res.statusText}: ${text.slice(0, 200)}`,
        undefined,
        res.status >= 500 || res.status === 429,
      )
    }

    if (streaming && res.body) {
      const { text, usage } = await consumeStream(res.body, onToken!)
      return { text, usage, servedBy: 'gemini' }
    }

    const json = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
      usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number }
    }
    const parts = json.candidates?.[0]?.content?.parts ?? []
    const text = parts.map((p) => p.text ?? '').join('')
    return {
      text,
      usage: json.usageMetadata
        ? {
            inputTokens: json.usageMetadata.promptTokenCount,
            outputTokens: json.usageMetadata.candidatesTokenCount,
          }
        : undefined,
      servedBy: 'gemini',
    }
  },
  async generateImage({ prompt, aspectRatio, signal }) {
    const apiKey = getKey('gemini')
    const url = `${BASE}/models/${IMAGE_MODEL}:predict?key=${apiKey}`
    const body = {
      instances: [{ prompt }],
      parameters: {
        sampleCount: 1,
        ...(aspectRatio ? { aspectRatio } : {}),
      },
    }
    let res: Response
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal,
      })
    } catch (err) {
      throw new ProviderError('gemini', 'image network error', err)
    }
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new ProviderError('gemini', `image ${res.status}: ${text.slice(0, 200)}`)
    }
    const json = (await res.json()) as {
      predictions?: Array<{ bytesBase64Encoded?: string; mimeType?: string }>
    }
    const pred = json.predictions?.[0]
    if (!pred?.bytesBase64Encoded) {
      throw new ProviderError('gemini', 'image response missing bytesBase64Encoded')
    }
    return {
      base64: pred.bytesBase64Encoded,
      mimeType: pred.mimeType ?? 'image/png',
      servedBy: 'gemini',
    } as GeneratedImage
  },
}
