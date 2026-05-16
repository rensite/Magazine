// Core types for the AI layer. Provider-agnostic.
//
// SECURITY NOTE: This module is bundled into the browser. Any VITE_* env
// var lands in the client. For production, the providers should be moved
// behind a Supabase Edge Function proxy that holds keys server-side; the
// `Provider` interface here is the seam — replace `complete()` with a
// proxied fetch and nothing else changes.

import type { ZodType } from 'zod'

/** Logical task buckets used by the router to pick a default provider. */
export type AiTask =
  | 'vision'              // image → MediaSemantic
  | 'analyst'             // long-form text understanding (Brief)
  | 'angles'              // story angles generation
  | 'editor'              // editor persona → Partitura
  | 'gaps'                // gap suggestions
  | 'image-generation'    // text → image
  | 'classify'            // short, cheap classifications

export type ProviderId = 'claude' | 'gemini' | 'grok'

export type Role = 'system' | 'user' | 'assistant'

/** Inline image attached to a user message. Either a remote URL or base64. */
export interface ImageInput {
  /** Remote URL (provider must support URL fetching) — preferred for Supabase signed URLs. */
  url?: string
  /** Raw base64 (no data: prefix). */
  base64?: string
  /** MIME type, required when sending base64. */
  mimeType?: string
}

export interface Message {
  role: Role
  content: string
  images?: ImageInput[]
}

export interface AiCallOptions<T = unknown> {
  task: AiTask
  /** Force a specific provider; overrides the router. */
  provider?: ProviderId
  /** Zod schema for structured-output validation. If set, the call returns T. */
  schema?: ZodType<T>
  /** Convenience: lift images into the user message. Merged with messages[].images. */
  images?: ImageInput[]
  /** System prompt. Convention: English, role-defining, stable per task. */
  system?: string
  /** Optional pre-built messages; if absent, a single user message is built from `prompt`. */
  messages?: Message[]
  /** Max output tokens. Provider-specific defaults apply if unset. */
  maxTokens?: number
  /** 0..1 — lower for structured tasks, higher for creative angles. */
  temperature?: number
  /** Token-by-token callback for streaming. */
  onToken?: (delta: string) => void
  signal?: AbortSignal
  /**
   * If structured output fails validation, retry once with the error
   * appended to the prompt. Default true.
   */
  retryOnInvalidStructure?: boolean
  /**
   * If true and the primary provider errors, fall through the router's
   * fallback chain (e.g. claude → grok). Default true.
   */
  enableFallback?: boolean
  /** Prompt version tag for telemetry / regression debugging. */
  promptVersion?: string
}

/** Raw response from a provider, normalized. */
export interface CompletionResult {
  text: string
  /** Optional usage stats; not all providers report all fields. */
  usage?: {
    inputTokens?: number
    outputTokens?: number
    costUsd?: number
  }
  /** Provider that actually served the request (after fallback). */
  servedBy: ProviderId
}

/** Generated image, normalized across providers. */
export interface GeneratedImage {
  /** Base64-encoded image bytes (no data: prefix). */
  base64: string
  mimeType: string
  servedBy: ProviderId
  /** Optional revised prompt the provider applied. */
  revisedPrompt?: string
}

export interface ImageGenOptions {
  provider?: ProviderId
  /** e.g. "16:9", "1:1", "3:4" — providers normalize to nearest supported. */
  aspectRatio?: string
  signal?: AbortSignal
  enableFallback?: boolean
}

/**
 * Minimal provider interface. Every provider implements `complete()` (text +
 * vision via inline images) and optionally `generateImage()`. Streaming is
 * surfaced via `opts.onToken` rather than a separate API; keeps `aiCall`
 * uniform for streaming and non-streaming callers.
 */
export interface Provider {
  id: ProviderId
  complete(args: {
    system?: string
    messages: Message[]
    maxTokens?: number
    temperature?: number
    onToken?: (delta: string) => void
    signal?: AbortSignal
  }): Promise<CompletionResult>
  /** Optional — providers that support image generation. */
  generateImage?(args: {
    prompt: string
    aspectRatio?: string
    signal?: AbortSignal
  }): Promise<GeneratedImage>
}

/** Thrown when a provider call fails. Carries provider id for fallback logic. */
export class ProviderError extends Error {
  constructor(
    public readonly provider: ProviderId,
    message: string,
    public readonly cause?: unknown,
    public readonly retriable: boolean = true,
  ) {
    super(`[${provider}] ${message}`)
    this.name = 'ProviderError'
  }
}

/** Thrown when structured output fails zod validation after retries exhausted. */
export class StructuredOutputError extends Error {
  constructor(
    message: string,
    public readonly rawText: string,
    public readonly zodIssues: unknown,
  ) {
    super(message)
    this.name = 'StructuredOutputError'
  }
}

/** Thrown when no provider key is configured for a task. */
export class MissingKeyError extends Error {
  constructor(public readonly provider: ProviderId) {
    super(`No API key configured for provider "${provider}". Set VITE_${provider.toUpperCase()}_API_KEY in .env.local`)
    this.name = 'MissingKeyError'
  }
}
