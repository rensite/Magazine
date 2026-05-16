// Runtime key store for LLM providers.
//
// Source of truth (in order):
//   1. In-memory store, populated from the Settings UI.
//   2. localStorage, hydrated on first read.
//   3. `import.meta.env.VITE_*_API_KEY` (dev-only fallback).
//
// The Vite build is deliberately *not* the primary path anymore: in
// production, users enter their own keys at runtime via the Settings
// modal, and those values live in localStorage (per-origin, per-browser).
// This keeps keys out of the shipped JS bundle and lets a single
// deployment serve many users with different providers.
//
// Trade-offs we're explicitly accepting:
//   - localStorage is not encrypted. The XSS surface here is the same
//     as for Supabase session tokens, which already live in localStorage,
//     so we're not raising the bar on attackers but we're not lowering
//     it either. A future hardening step is to move providers behind a
//     Supabase Edge Function so the browser never sees the key at all.
//   - Each browser/device needs the key entered once. That's fine for
//     a BYO-key SaaS pattern and matches OpenAI Playground / Cursor.

import { reactive } from 'vue'
import { MissingKeyError, type ProviderId } from './types'

const STORAGE_KEY = 'stan:ai-keys/v1'

const ENV_VARS: Record<ProviderId, string> = {
  claude: 'VITE_ANTHROPIC_API_KEY',
  gemini: 'VITE_GEMINI_API_KEY',
  grok: 'VITE_GROK_API_KEY',
}

type Bag = Partial<Record<ProviderId, string>>

interface KeyState {
  /** Bag of {claude, gemini, grok} strings as entered by the user. */
  runtime: Bag
  /** True once we've attempted localStorage hydration. */
  hydrated: boolean
}

// Vue-reactive so the Settings modal's `keysStatus()` recomputes when the
// underlying bag mutates. The earlier issue that looked like "reactive is
// broken under vitest" was actually stale .js files in src/ from a prior
// vue-tsc emit — now cleaned up and prevented by .gitignore + --noEmit.
const state: KeyState = reactive({ runtime: {}, hydrated: false })

const hydrate = (): void => {
  if (state.hydrated) return
  state.hydrated = true
  if (typeof localStorage === 'undefined') return
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return
    const parsed = JSON.parse(raw) as Bag
    for (const provider of ['claude', 'gemini', 'grok'] as ProviderId[]) {
      const value = parsed[provider]
      if (typeof value === 'string' && value.length >= 4) {
        state.runtime[provider] = value
      }
    }
  } catch {
    // Corrupt JSON in localStorage — wipe it so we don't keep tripping.
    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch {
      /* ignore */
    }
  }
}

const persist = (): void => {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.runtime))
  } catch {
    // Quota / private-mode failures are non-fatal; the in-memory copy
    // still works for the current session.
  }
}

const readEnv = (provider: ProviderId): string | undefined => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const meta = (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {}
  return meta[ENV_VARS[provider]]
}

/** Test override; null means read normal sources. */
let envOverride: Record<string, string | undefined> | null = null
const readEnvForTests = (provider: ProviderId): string | undefined => {
  if (envOverride) return envOverride[ENV_VARS[provider]]
  return readEnv(provider)
}

/** Throws MissingKeyError if no key for the provider. */
export const getKey = (provider: ProviderId): string => {
  hydrate()
  const runtime = state.runtime[provider]
  if (runtime && runtime.length >= 4) return runtime
  const env = readEnvForTests(provider)
  if (env && env.length >= 4) return env
  throw new MissingKeyError(provider)
}

export const hasKey = (provider: ProviderId): boolean => {
  hydrate()
  const runtime = state.runtime[provider]
  if (runtime && runtime.length >= 4) return true
  const env = readEnvForTests(provider)
  return !!(env && env.length >= 4)
}

/** Set or clear a key for a provider; pass empty string to clear. */
export const setKey = (provider: ProviderId, value: string): void => {
  hydrate()
  const trimmed = value.trim()
  if (!trimmed) {
    delete state.runtime[provider]
  } else {
    state.runtime[provider] = trimmed
  }
  persist()
}

/** Clear all stored keys. */
export const clearAllKeys = (): void => {
  hydrate()
  for (const p of Object.keys(state.runtime) as ProviderId[]) delete state.runtime[p]
  persist()
}

/**
 * Reactive view of which providers have a key, for the Settings UI. The
 * Vue components can subscribe to this without importing the raw state.
 */
export const keysStatus = (): Record<ProviderId, { hasRuntime: boolean; hasEnv: boolean }> => {
  hydrate()
  return {
    claude: {
      hasRuntime: !!(state.runtime.claude && state.runtime.claude.length >= 4),
      hasEnv: !!readEnvForTests('claude'),
    },
    gemini: {
      hasRuntime: !!(state.runtime.gemini && state.runtime.gemini.length >= 4),
      hasEnv: !!readEnvForTests('gemini'),
    },
    grok: {
      hasRuntime: !!(state.runtime.grok && state.runtime.grok.length >= 4),
      hasEnv: !!readEnvForTests('grok'),
    },
  }
}

/**
 * Subscribe to the reactive runtime bag. Vue components can pass this
 * into `computed()` for auto-updating UI.
 */
export const keysState = (): Readonly<Bag> => {
  hydrate()
  return state.runtime
}

/** Test-only seam — older signature kept for backwards compat with PR 2/3/4 tests. */
export const __setEnvForTests = (bag: Record<string, string | undefined> | null): void => {
  envOverride = bag
  // Also wipe runtime so tests see a clean slate.
  for (const p of Object.keys(state.runtime) as ProviderId[]) delete state.runtime[p]
  state.hydrated = true // skip localStorage in tests
}
