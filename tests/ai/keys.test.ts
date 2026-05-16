import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  __setEnvForTests,
  clearAllKeys,
  getKey,
  getModelOverride,
  hasKey,
  keysState,
  keysStatus,
  modelOverridesState,
  setKey,
  setModelOverride,
} from '@/ai/keys'
import { MissingKeyError } from '@/ai/types'

// happy-dom provides a localStorage shim; we wipe it between tests.
beforeEach(() => {
  __setEnvForTests(null)
  try {
    localStorage.clear()
  } catch {
    /* ignore */
  }
})

afterEach(() => {
  __setEnvForTests(null)
  clearAllKeys()
})

describe('keys — runtime store', () => {
  it('returns MissingKeyError when no key is configured', () => {
    expect(() => getKey('claude')).toThrow(MissingKeyError)
    expect(hasKey('claude')).toBe(false)
  })

  it('setKey persists, getKey reads it back', () => {
    setKey('claude', 'sk-ant-xxx')
    expect(hasKey('claude')).toBe(true)
    expect(getKey('claude')).toBe('sk-ant-xxx')
  })

  it('setKey with empty string clears the key', () => {
    setKey('grok', 'xai-abc')
    expect(hasKey('grok')).toBe(true)
    setKey('grok', '')
    expect(hasKey('grok')).toBe(false)
  })

  it('trims whitespace on save', () => {
    setKey('gemini', '   gem-trim-me   ')
    expect(getKey('gemini')).toBe('gem-trim-me')
  })

  it('clearAllKeys wipes everything', () => {
    setKey('claude', 'a')
    setKey('grok', 'b')
    clearAllKeys()
    expect(hasKey('claude')).toBe(false)
    expect(hasKey('grok')).toBe(false)
  })
})

describe('keys — localStorage persistence', () => {
  it('writes saved keys to localStorage', () => {
    setKey('claude', 'sk-ant-persist')
    const raw = localStorage.getItem('stan:ai-keys/v1')
    expect(raw).toBeTruthy()
    expect(raw!).toContain('sk-ant-persist')
  })

  it('rejects keys shorter than 4 chars (treated as missing)', () => {
    setKey('claude', 'abc') // too short
    expect(hasKey('claude')).toBe(false)
  })
})

describe('keys — env fallback', () => {
  it('falls back to VITE_*_API_KEY when no runtime value is set', () => {
    __setEnvForTests({ VITE_GROK_API_KEY: 'xai-from-env' })
    expect(hasKey('grok')).toBe(true)
    expect(getKey('grok')).toBe('xai-from-env')
  })

  it('runtime value wins over env', () => {
    __setEnvForTests({ VITE_CLAUDE_API_KEY: 'wont-be-used' })
    setKey('claude', 'runtime-wins')
    expect(getKey('claude')).toBe('runtime-wins')
  })
})

describe('keysStatus', () => {
  it('reports per-provider runtime/env presence separately', () => {
    __setEnvForTests({ VITE_GEMINI_API_KEY: 'gem-env' })
    setKey('claude', 'sk-ant-rt')
    const s = keysStatus()
    expect(s.claude.hasRuntime).toBe(true)
    expect(s.claude.hasEnv).toBe(false)
    expect(s.gemini.hasRuntime).toBe(false)
    expect(s.gemini.hasEnv).toBe(true)
    expect(s.grok.hasRuntime).toBe(false)
    expect(s.grok.hasEnv).toBe(false)
  })
})

describe('keysState reactivity', () => {
  it('exposes the current runtime bag (post-setKey)', () => {
    setKey('claude', 'rt-claude')
    setKey('grok', 'rt-grok')
    const bag = keysState()
    expect(bag.claude).toBe('rt-claude')
    expect(bag.grok).toBe('rt-grok')
    expect(bag.gemini).toBeUndefined()
  })
})

describe('model overrides', () => {
  it('returns undefined when nothing is set', () => {
    expect(getModelOverride('gemini')).toBeUndefined()
  })

  it('setModelOverride round-trips and persists to localStorage', () => {
    setModelOverride('gemini', 'gemini-3-flash-preview')
    expect(getModelOverride('gemini')).toBe('gemini-3-flash-preview')
    const raw = localStorage.getItem('stan:ai-models/v1')
    expect(raw).toBeTruthy()
    expect(raw!).toContain('gemini-3-flash-preview')
  })

  it('empty string clears the override', () => {
    setModelOverride('claude', 'claude-3-5-haiku-latest')
    expect(getModelOverride('claude')).toBe('claude-3-5-haiku-latest')
    setModelOverride('claude', '')
    expect(getModelOverride('claude')).toBeUndefined()
  })

  it('trims whitespace', () => {
    setModelOverride('grok', '  grok-2-vision-latest  ')
    expect(getModelOverride('grok')).toBe('grok-2-vision-latest')
  })

  it('modelOverridesState returns the current bag', () => {
    setModelOverride('claude', 'a')
    setModelOverride('gemini', 'b')
    const bag = modelOverridesState()
    expect(bag.claude).toBe('a')
    expect(bag.gemini).toBe('b')
    expect(bag.grok).toBeUndefined()
  })
})
