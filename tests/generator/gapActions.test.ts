import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useGapActions } from '@/composables/useGapActions'
import { __setEnvForTests } from '@/ai/keys'
import { setGenerationService } from '@/services/generationService'
import { useGeneratorStore, __resetGeneratorPendingForTests } from '@/stores/generatorStore'
import type { Gap } from '@/generator/schemas/gap'

const fakeService = {
  list: async () => [],
  load: async () => {
    throw new Error('not used')
  },
  create: async (input: { title: string; rawMaterials: unknown[] }) => ({
    id: 's1',
    ownerId: 'u1',
    status: 'idle' as const,
    title: input.title,
    rawMaterials: input.rawMaterials as never,
    brief: null,
    angles: null,
    selectedAngleIds: [],
    variants: {},
    selectedVariantId: null,
    resultSchema: null,
    resultSpreadId: null,
    errorMessage: null,
    cost: { totalInputTokens: 0, totalOutputTokens: 0, totalUsd: 0, calls: 0 },
    createdAt: '',
    updatedAt: '',
  }),
  update: async (id: string, patch: unknown) => ({
    id,
    ownerId: 'u1',
    status: 'idle' as const,
    title: '',
    rawMaterials: [],
    brief: null,
    angles: null,
    selectedAngleIds: [],
    variants: {},
    selectedVariantId: null,
    resultSchema: null,
    resultSpreadId: null,
    errorMessage: null,
    cost: { totalInputTokens: 0, totalOutputTokens: 0, totalUsd: 0, calls: 0 },
    createdAt: '',
    updatedAt: '',
    ...(patch as object),
  }),
  remove: async () => {
    /* noop */
  },
}

const jsonResponse = (body: unknown): Response =>
  new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })

const gap = (): Gap => ({
  id: 'g1',
  kind: 'missing-image',
  priority: 'recommended',
  description: 'Не хватает закрывающего кадра.',
  reason: 'Финал тонет в тексте.',
  suggestedAction: {
    type: 'generate-image',
    brief: 'a quiet morning room, low contrast',
    aspectRatio: '4:5',
  },
})

beforeEach(() => {
  setActivePinia(createPinia())
  __resetGeneratorPendingForTests()
  setGenerationService(fakeService as never)
  __setEnvForTests({
    VITE_GROK_API_KEY: 'xai-test',
    VITE_GEMINI_API_KEY: 'gem-test',
    VITE_ANTHROPIC_API_KEY: 'sk-ant-test',
  })
})

afterEach(() => {
  __setEnvForTests(null)
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('useGapActions.generateImagesForGap', () => {
  it('fires Grok + Gemini in parallel and stores both results', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString()
        if (url.includes('api.x.ai')) {
          return jsonResponse({ data: [{ b64_json: 'GROK', revised_prompt: 'r' }] })
        }
        if (url.includes('generativelanguage.googleapis.com')) {
          return jsonResponse({
            predictions: [{ bytesBase64Encoded: 'GEMINI', mimeType: 'image/png' }],
          })
        }
        return new Response('?', { status: 404 })
      }),
    )
    const store = useGeneratorStore()
    await store.createSession('s', [])
    const actions = useGapActions()
    const g = gap()
    await actions.generateImagesForGap(g)
    const result = actions.generatedImages.value[g.id]
    expect(result).toBeDefined()
    expect((result?.grok as { base64?: string }).base64).toBe('GROK')
    expect((result?.gemini as { base64?: string }).base64).toBe('GEMINI')
    expect(store.cost.calls).toBe(2)
  })

  it('records errors per-provider without throwing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString()
        if (url.includes('api.x.ai')) {
          return new Response('boom', { status: 503, statusText: 'down' })
        }
        if (url.includes('generativelanguage.googleapis.com')) {
          return jsonResponse({
            predictions: [{ bytesBase64Encoded: 'GEMINI', mimeType: 'image/png' }],
          })
        }
        return new Response('?', { status: 404 })
      }),
    )
    const store = useGeneratorStore()
    await store.createSession('s', [])
    const actions = useGapActions()
    const g = gap()
    await actions.generateImagesForGap(g)
    const result = actions.generatedImages.value[g.id]
    expect(result?.grok).toEqual(expect.objectContaining({ error: expect.any(String) }))
    expect((result?.gemini as { base64?: string }).base64).toBe('GEMINI')
    // Only the Gemini success bumped the cost counter.
    expect(store.cost.calls).toBe(1)
  })

  it('does not re-fire while a request is already in flight', async () => {
    let calls = 0
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        calls++
        await new Promise((r) => setTimeout(r, 10))
        return jsonResponse({ data: [{ b64_json: 'X' }] })
      }),
    )
    const store = useGeneratorStore()
    await store.createSession('s', [])
    const actions = useGapActions()
    const g = gap()
    const p = actions.generateImagesForGap(g)
    // Second call before the first resolves should be a no-op.
    await actions.generateImagesForGap(g)
    await p
    expect(calls).toBeLessThanOrEqual(2) // exactly the first run's 2 providers
  })
})
