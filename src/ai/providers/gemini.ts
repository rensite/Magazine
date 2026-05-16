// Google Gemini provider via Generative Language REST API.
// Also supports image generation via Imagen 3.

import {
  type CompletionResult,
  type GeneratedImage,
  type Message,
  type Provider,
  ProviderError,
} from '../types'
import { getKey, getModelOverride } from '../keys'

const BASE = 'https://generativelanguage.googleapis.com/v1beta'
// Gemini 3 only. 2.0 endpoints return errors against current Google API.
// Default: flash, NOT pro. Pro-preview is severely rate-limited on free
// tier (~5 RPM) and 429s under normal generator load. Flash has ×30–50
// quota and is plenty for editorial vision tasks. Users who want pro
// quality can override per-provider in Settings.
// If this 404s, run listAvailableModels() from devtools, then update
// these constants OR override in Settings. See CLAUDE.md for rationale.
const TEXT_MODEL = 'gemini-3-flash-preview'
const VISION_MODEL = 'gemini-3-flash-preview'
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
    // User-configured override (Settings UI) wins over the hard-coded default.
    // Same override applies to both text and vision since Gemini 3 is unified
    // multimodal — separate override per task would just be a footgun.
    const model = getModelOverride('gemini') ?? (hasImages ? VISION_MODEL : TEXT_MODEL)
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
      const hints: string[] = []
      if (res.status === 404 && text.includes('is not found')) {
        hints.push(
          `Model "${model}" doesn't exist on your account. Run listGeminiModels() from devtools, then set the override in Settings.`,
        )
      }
      if (res.status === 429) {
        hints.push(
          `Quota exhausted on "${model}". Try a flash-variant in Settings (e.g. gemini-3-flash-preview) — preview Pro models have ~5 RPM on free tier.`,
        )
      }
      const hintStr = hints.length ? ` (Hint: ${hints.join(' ')})` : ''
      // 429 is "retriable" for the standard router fallback chain — let
      // the vision-task fallback to Claude→Grok kick in instead of waiting
      // for Google to refill the quota bucket.
      throw new ProviderError(
        'gemini',
        `${res.status} ${res.statusText}: ${text.slice(0, 200)}${hintStr}`,
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

/**
 * Debug helper: lists every Gemini model the current API key has access
 * to. Open the browser console while the app is running and call:
 *
 *   import('@/ai/providers/gemini').then(m => m.listAvailableModels()).then(console.log)
 *
 * Use this to discover the correct model ID when the configured one 404s.
 * Returns an array of { name, displayName, supportedMethods } trimmed for
 * readability — Google's full response is much chattier.
 */
export const listAvailableModels = async (): Promise<
  Array<{ name: string; displayName?: string; supportedMethods: string[] }>
> => {
  const apiKey = getKey('gemini')
  const res = await fetch(`${BASE}/models?key=${apiKey}&pageSize=200`)
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`listAvailableModels failed: ${res.status} ${text.slice(0, 200)}`)
  }
  const json = (await res.json()) as {
    models?: Array<{
      name?: string
      displayName?: string
      supportedGenerationMethods?: string[]
    }>
  }
  return (json.models ?? [])
    .map((m) => ({
      name: (m.name ?? '').replace(/^models\//, ''),
      displayName: m.displayName,
      supportedMethods: m.supportedGenerationMethods ?? [],
    }))
    .filter((m) => m.name.startsWith('gemini-'))
    .sort((a, b) => a.name.localeCompare(b.name))
}
