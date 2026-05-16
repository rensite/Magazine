// Public AI API. Everything in the generator pipeline goes through aiCall().
//
// Responsibilities of this module:
//   1. Compose the message list from the simpler {prompt, system, images} shape.
//   2. Route to the right provider (or honor a forced override).
//   3. On structured output (schema present), validate with zod; on failure,
//      retry once with the validation error injected into the prompt.
//   4. On provider error (network / 5xx / 429), fall through the router's
//      fallback chain unless the caller disabled it.
//   5. Surface streaming via opts.onToken; usage stats via the return value.

import type { ZodType } from 'zod'
import {
  type AiCallOptions,
  type CompletionResult,
  type GeneratedImage,
  type ImageGenOptions,
  type Message,
  type Provider,
  MissingKeyError,
  ProviderError,
  StructuredOutputError,
} from './types'
import { chainForTask, providerById } from './router'
import { normalizeImageInputs } from './imageInput'

const buildMessages = (
  prompt: string,
  opts: Pick<AiCallOptions, 'messages' | 'images'>,
): Message[] => {
  if (opts.messages?.length) {
    // If caller pre-built messages, append any extra images to the last user message.
    if (opts.images?.length) {
      const cloned = opts.messages.map((m) => ({ ...m, images: m.images ? [...m.images] : undefined }))
      for (let i = cloned.length - 1; i >= 0; i--) {
        if (cloned[i].role === 'user') {
          cloned[i].images = [...(cloned[i].images ?? []), ...opts.images]
          break
        }
      }
      return cloned
    }
    return opts.messages
  }
  return [{ role: 'user', content: prompt, images: opts.images }]
}

/** Best-effort JSON extraction: strip ```json fences, look for outermost braces. */
const extractJson = (text: string): string => {
  const trimmed = text.trim()
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fenced) return fenced[1].trim()
  // Find the outermost {…} or […]. Bias toward objects since our schemas are objects.
  const firstBrace = trimmed.indexOf('{')
  const firstBracket = trimmed.indexOf('[')
  const start =
    firstBrace === -1
      ? firstBracket
      : firstBracket === -1
        ? firstBrace
        : Math.min(firstBrace, firstBracket)
  if (start === -1) return trimmed
  // Naive last-brace match; sufficient for well-formed model outputs.
  const lastBrace = trimmed.lastIndexOf('}')
  const lastBracket = trimmed.lastIndexOf(']')
  const end = Math.max(lastBrace, lastBracket)
  if (end === -1 || end <= start) return trimmed
  return trimmed.slice(start, end + 1)
}

/** Attempt parse + zod validate. Returns either parsed data or a structured error message. */
const tryParse = <T>(
  raw: string,
  schema: ZodType<T>,
): { ok: true; value: T } | { ok: false; reason: string } => {
  let json: unknown
  try {
    json = JSON.parse(extractJson(raw))
  } catch (err) {
    return { ok: false, reason: `Invalid JSON: ${(err as Error).message}` }
  }
  const result = schema.safeParse(json)
  if (!result.success) {
    return {
      ok: false,
      reason: `Schema validation failed: ${result.error.issues
        .map((i) => `${i.path.join('.') || '<root>'}: ${i.message}`)
        .join('; ')}`,
    }
  }
  return { ok: true, value: result.data }
}

const STRUCTURED_SUFFIX =
  '\n\nRespond with ONLY a single JSON object that matches the schema. No prose, no markdown fences, no commentary.'

/**
 * Single attempt against one provider. Throws ProviderError on network /
 * HTTP failure (so the caller can decide whether to fall back).
 */
const callProvider = async <T>(
  provider: Provider,
  opts: AiCallOptions<T>,
  messages: Message[],
): Promise<{ result: CompletionResult; structured?: T }> => {
  const result = await provider.complete({
    system: opts.system,
    messages,
    maxTokens: opts.maxTokens,
    temperature: opts.temperature,
    onToken: opts.onToken,
    signal: opts.signal,
  })
  if (!opts.schema) return { result }
  const parsed = tryParse(result.text, opts.schema)
  if (parsed.ok) return { result, structured: parsed.value }

  // One inline retry with the validation error pasted back to the model.
  if (opts.retryOnInvalidStructure !== false) {
    const retryMessages: Message[] = [
      ...messages,
      { role: 'assistant', content: result.text },
      {
        role: 'user',
        content: `Your last response did not match the required JSON schema. ${parsed.reason}\n\nReturn ONLY the corrected JSON object.`,
      },
    ]
    const retryResult = await provider.complete({
      system: opts.system,
      messages: retryMessages,
      maxTokens: opts.maxTokens,
      temperature: 0, // be more deterministic on the retry
      // Streaming on retry would double-emit tokens to the UI; suppress.
      onToken: undefined,
      signal: opts.signal,
    })
    const retryParsed = tryParse(retryResult.text, opts.schema)
    if (retryParsed.ok) {
      // Combine usage from both attempts.
      const combined: CompletionResult = {
        ...retryResult,
        usage: {
          inputTokens:
            (result.usage?.inputTokens ?? 0) + (retryResult.usage?.inputTokens ?? 0),
          outputTokens:
            (result.usage?.outputTokens ?? 0) + (retryResult.usage?.outputTokens ?? 0),
        },
      }
      return { result: combined, structured: retryParsed.value }
    }
    throw new StructuredOutputError(
      `Structured output failed validation after retry: ${retryParsed.reason}`,
      retryResult.text,
      retryParsed.reason,
    )
  }
  throw new StructuredOutputError(
    `Structured output failed validation: ${parsed.reason}`,
    result.text,
    parsed.reason,
  )
}

export interface AiCallReturn<T> {
  /** Parsed structured value when a schema was provided. */
  data: T
  /** Raw text + usage + which provider served the request. */
  meta: CompletionResult
}

/**
 * Run an AI completion with structured-output guarantees, streaming, and
 * automatic provider fallback. The single entry point used by the generator.
 */
export async function aiCall<T = string>(
  prompt: string,
  opts: AiCallOptions<T>,
): Promise<AiCallReturn<T>> {
  const baseMessages = buildMessages(prompt, opts)
  // Normalize image URLs that providers can't fetch directly (blob:, data:).
  // Done once here so every provider in the fallback chain sees the same
  // resolved bytes instead of re-fetching the blob URL three times.
  for (const m of baseMessages) {
    if (m.images && m.images.length) {
      m.images = await normalizeImageInputs(m.images)
    }
  }
  const messages =
    opts.schema && baseMessages.length
      ? baseMessages.map((m, i) =>
          i === baseMessages.length - 1 && m.role === 'user'
            ? { ...m, content: m.content + STRUCTURED_SUFFIX }
            : m,
        )
      : baseMessages

  const chain = chainForTask(opts.task, opts.provider)
  const fallbackEnabled = opts.enableFallback !== false

  let lastError: unknown
  for (let i = 0; i < chain.length; i++) {
    const id = chain[i]
    const provider = providerById(id)
    try {
      const { result, structured } = await callProvider(provider, opts, messages)
      return {
        data: (opts.schema ? structured : result.text) as T,
        meta: result,
      }
    } catch (err) {
      lastError = err
      // Structured-output failures are not provider faults; don't fall back.
      if (err instanceof StructuredOutputError) throw err
      // Abort signals are user intent; don't fall back.
      if (err instanceof Error && err.name === 'AbortError') throw err
      // Non-retriable provider errors (e.g. 4xx auth) skip the fallback chain.
      if (err instanceof ProviderError && !err.retriable) throw err
      // Missing key → silently skip to next provider in the chain. Allows
      // partial-config setups (only Grok key, etc.) to still work for tasks
      // whose primary provider isn't configured.
      if (err instanceof MissingKeyError) {
        if (!fallbackEnabled || i === chain.length - 1) throw err
        continue
      }
      if (!fallbackEnabled) throw err
      if (i === chain.length - 1) throw err
      // else: try next provider
    }
  }
  throw lastError instanceof Error ? lastError : new Error('aiCall: no providers attempted')
}

/**
 * Image generation entry point. Mirrors aiCall's fallback semantics but
 * for the image-generation task. Returns the first successful image.
 */
export async function aiGenerateImage(
  prompt: string,
  opts: ImageGenOptions = {},
): Promise<GeneratedImage> {
  const chain = chainForTask('image-generation', opts.provider)
  const fallbackEnabled = opts.enableFallback !== false
  let lastError: unknown
  for (let i = 0; i < chain.length; i++) {
    const provider = providerById(chain[i])
    if (!provider.generateImage) {
      lastError = new Error(`${chain[i]} does not support image generation`)
      continue
    }
    try {
      return await provider.generateImage({
        prompt,
        aspectRatio: opts.aspectRatio,
        signal: opts.signal,
      })
    } catch (err) {
      lastError = err
      if (err instanceof ProviderError && !err.retriable) throw err
      if (err instanceof MissingKeyError) {
        if (!fallbackEnabled || i === chain.length - 1) throw err
        continue
      }
      if (!fallbackEnabled) throw err
      if (i === chain.length - 1) throw err
    }
  }
  throw lastError instanceof Error ? lastError : new Error('aiGenerateImage: no providers attempted')
}

export type {
  AiCallOptions,
  AiTask,
  GeneratedImage,
  ImageGenOptions,
  ImageInput,
  Message,
  ProviderId,
} from './types'
export { ProviderError, StructuredOutputError, MissingKeyError } from './types'
// Debug-only: list every Gemini model your API key has access to.
// Call from the browser console: `(await import('@/ai')).listGeminiModels()`
export { listAvailableModels as listGeminiModels } from './providers/gemini'
