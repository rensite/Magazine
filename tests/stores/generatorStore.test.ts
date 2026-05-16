import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import {
  __resetGeneratorPendingForTests,
  useGeneratorStore,
} from '@/stores/generatorStore'
import {
  setGenerationService,
  type GenerationService,
} from '@/services/generationService'
import type {
  GenerationSession,
  GenerationSessionInsert,
  GenerationSessionPatch,
} from '@/types/generation'
import { emptyCost } from '@/types/generation'

/** In-memory service that records calls — lets us assert persistence semantics. */
const makeStubService = () => {
  const rows: GenerationSession[] = []
  const updates: Array<{ id: string; patch: GenerationSessionPatch }> = []
  let nextId = 1
  let updateImpl: ((patch: GenerationSessionPatch, current: GenerationSession) => GenerationSession) | null = null

  const svc: GenerationService = {
    async list() {
      return rows.map((r) => ({
        id: r.id,
        title: r.title,
        status: r.status,
        updatedAt: r.updatedAt,
        resultSpreadId: r.resultSpreadId,
      }))
    },
    async load(id) {
      const row = rows.find((r) => r.id === id)
      if (!row) throw new Error('not found')
      return { ...row }
    },
    async create(input: GenerationSessionInsert) {
      const now = new Date().toISOString()
      const row: GenerationSession = {
        id: `s${nextId++}`,
        ownerId: 'u1',
        status: 'idle',
        title: input.title,
        rawMaterials: input.rawMaterials,
        brief: null,
        angles: null,
        selectedAngleIds: [],
        variants: {},
        selectedVariantId: null,
        resultSchema: null,
        resultSpreadId: null,
        errorMessage: null,
        cost: emptyCost(),
        createdAt: now,
        updatedAt: now,
      }
      rows.push(row)
      return { ...row }
    },
    async update(id, patch) {
      updates.push({ id, patch })
      const row = rows.find((r) => r.id === id)
      if (!row) throw new Error('not found')
      if (updateImpl) {
        const next = updateImpl(patch, row)
        Object.assign(row, next)
      } else {
        Object.assign(row, patch, { updatedAt: new Date().toISOString() })
      }
      return { ...row }
    },
    async remove(id) {
      const idx = rows.findIndex((r) => r.id === id)
      if (idx >= 0) rows.splice(idx, 1)
    },
  }
  return {
    svc,
    rows,
    updates,
    setUpdateImpl(fn: typeof updateImpl) {
      updateImpl = fn
    },
  }
}

describe('generatorStore', () => {
  let stub: ReturnType<typeof makeStubService>

  beforeEach(() => {
    setActivePinia(createPinia())
    __resetGeneratorPendingForTests()
    stub = makeStubService()
    setGenerationService(stub.svc)
  })

  it('createSession creates a row and surfaces it', async () => {
    const store = useGeneratorStore()
    await store.createSession('My session', [])
    expect(store.session).toBeTruthy()
    expect(store.session!.title).toBe('My session')
    expect(store.list).toHaveLength(1)
  })

  it('setBrief flips status and persists after debounce', async () => {
    vi.useFakeTimers()
    try {
      const store = useGeneratorStore()
      await store.createSession('s', [])
      store.setBrief({ summary: 'x' })
      expect(store.session!.brief).toEqual({ summary: 'x' })
      expect(store.session!.status).toBe('brief-ready')
      // No persistence yet — still in debounce window.
      expect(stub.updates).toHaveLength(0)
      // Advance through the debounce.
      await vi.advanceTimersByTimeAsync(500)
      expect(stub.updates).toHaveLength(1)
      expect(stub.updates[0].patch.brief).toEqual({ summary: 'x' })
      expect(stub.updates[0].patch.status).toBe('brief-ready')
    } finally {
      vi.useRealTimers()
    }
  })

  it('coalesces multiple rapid patches into a single write', async () => {
    vi.useFakeTimers()
    try {
      const store = useGeneratorStore()
      await store.createSession('s', [])
      store.setStatus('analyzing')
      store.setStatus('brief-ready')
      store.setBrief({ a: 1 })
      await vi.advanceTimersByTimeAsync(500)
      expect(stub.updates).toHaveLength(1)
      // Last writer wins per field.
      expect(stub.updates[0].patch.status).toBe('brief-ready')
      expect(stub.updates[0].patch.brief).toEqual({ a: 1 })
    } finally {
      vi.useRealTimers()
    }
  })

  it('flushPending forces an immediate write', async () => {
    const store = useGeneratorStore()
    await store.createSession('s', [])
    store.setBrief({ a: 1 })
    await store.flushPending()
    expect(stub.updates).toHaveLength(1)
  })

  it('re-enqueues the patch when persistence fails', async () => {
    vi.useFakeTimers()
    try {
      const store = useGeneratorStore()
      await store.createSession('s', [])
      // First update throws, second succeeds.
      let n = 0
      stub.setUpdateImpl((patch, row) => {
        n++
        if (n === 1) throw new Error('boom')
        Object.assign(row, patch, { updatedAt: new Date().toISOString() })
        return row
      })
      store.setBrief({ a: 1 })
      await vi.advanceTimersByTimeAsync(500)
      expect(store.saveError).toContain('boom')
      // Retry on next user action.
      store.setStatus('analyzing')
      await vi.advanceTimersByTimeAsync(500)
      expect(stub.updates.length).toBeGreaterThanOrEqual(2)
      const second = stub.updates[stub.updates.length - 1]
      // Re-enqueued patch must still carry brief from the failed attempt.
      expect(second.patch.brief).toEqual({ a: 1 })
    } finally {
      vi.useRealTimers()
    }
  })

  it('addMaterial / removeMaterial keep the array in sync', async () => {
    const store = useGeneratorStore()
    await store.createSession('s', [])
    const m = {
      id: 'm1',
      kind: 'text' as const,
      filename: 'note.txt',
      inlineText: 'hello',
      createdAt: '2025-01-01T00:00:00Z',
    }
    store.addMaterial(m)
    expect(store.materials).toHaveLength(1)
    store.removeMaterial('m1')
    expect(store.materials).toHaveLength(0)
  })

  it('addCost accumulates tokens and call count', async () => {
    const store = useGeneratorStore()
    await store.createSession('s', [])
    store.addCost({ inputTokens: 100, outputTokens: 50, usd: 0.01 })
    store.addCost({ inputTokens: 200, outputTokens: 100, usd: 0.02 })
    expect(store.cost.totalInputTokens).toBe(300)
    expect(store.cost.totalOutputTokens).toBe(150)
    expect(store.cost.totalUsd).toBeCloseTo(0.03)
    expect(store.cost.calls).toBe(2)
  })

  it('closeSession flushes pending writes then clears state', async () => {
    const store = useGeneratorStore()
    await store.createSession('s', [])
    store.setBrief({ a: 1 })
    store.closeSession()
    // After close, the pending write should have been flushed.
    expect(stub.updates).toHaveLength(1)
    expect(store.session).toBeNull()
  })

  it('setResult persists the final SpreadSchema and spread id', async () => {
    const store = useGeneratorStore()
    await store.createSession('s', [])
    const schema = { version: 3, elements: [] } as never
    store.setResult(schema, 'spread-123')
    await store.flushPending()
    expect(stub.updates[0].patch.resultSpreadId).toBe('spread-123')
    expect(stub.updates[0].patch.status).toBe('opened-in-editor')
  })
})
