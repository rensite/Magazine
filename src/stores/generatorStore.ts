// Pinia store for the editorial generator. Holds the live session, exposes
// granular mutations (the pipeline layers in PR 4+ call these), and
// auto-persists patches to Supabase with a short debounce so the UI stays
// responsive while typing or reordering materials.

import { defineStore } from 'pinia'
import type {
  GenerationSession,
  GenerationSessionPatch,
  GenerationStatus,
  RawMaterial,
} from '@/types/generation'
import { emptyCost } from '@/types/generation'
import {
  currentGenerationService,
  type GenerationListItem,
} from '@/services/generationService'
import type { SpreadSchema } from '@/types/element'

/**
 * Transient pipeline progress for the active stage. Not persisted: it
 * describes "what's happening right now" (e.g. "analyzing image 3/8"),
 * which is meaningless after a refresh — the underlying status field on
 * the session is what survives. UI reads this to render the progress bar
 * above the stage cards.
 */
export interface PipelineProgress {
  /** Which pipeline stage produces this progress signal. */
  stage: 'analyzing' | 'angles' | 'editors' | 'compiling'
  /** Human-readable label shown next to the counter, e.g. "Анализ фото". */
  label: string
  /** 0..total. When current === total the stage just finished. */
  current: number
  total: number
}

interface State {
  session: GenerationSession | null
  list: GenerationListItem[]
  loading: boolean
  saving: boolean
  /** UI-only: surface a save error without overwriting the live session. */
  saveError: string | null
  /** Transient per-item progress for the running stage; null when idle. */
  progress: PipelineProgress | null
}

const DEBOUNCE_MS = 400

/** localStorage key for the most-recently-touched generator session id. */
const LAST_SESSION_KEY = 'stan:lastGeneratorSessionId'

const rememberSessionId = (id: string | null): void => {
  try {
    if (id) localStorage.setItem(LAST_SESSION_KEY, id)
    else localStorage.removeItem(LAST_SESSION_KEY)
  } catch {
    /* private mode / quota — ignore */
  }
}

const readLastSessionId = (): string | null => {
  try {
    return localStorage.getItem(LAST_SESSION_KEY)
  } catch {
    return null
  }
}

const WORKING_STATUSES: GenerationStatus[] = [
  'uploading',
  'analyzing',
  'generating-angles',
  'previewing',
  'compiling',
]

/**
 * Pick the most-advanced "ready" milestone the session's data actually
 * supports. Used after restoring a session whose job was interrupted,
 * so the UI doesn't stay stuck in a working state forever.
 */
const anyAnglePreviews = (angles: unknown): boolean => {
  if (!Array.isArray(angles)) return false
  return angles.some((a) => a && typeof a === 'object' && 'preview' in a)
}

const milestoneForData = (s: GenerationSession): GenerationStatus => {
  if (!WORKING_STATUSES.includes(s.status)) return s.status
  if (Object.keys(s.variants ?? {}).length > 0) return 'variants-ready'
  if (anyAnglePreviews(s.angles)) return 'previews-ready'
  if (s.angles) return 'angles-ready'
  if (s.brief) return 'brief-ready'
  return 'idle'
}

/** Coalesce overlapping patches in flight. Last write wins per field. */
let pending: GenerationSessionPatch = {}
let timer: ReturnType<typeof setTimeout> | null = null
let inflight: Promise<void> | null = null

export const useGeneratorStore = defineStore('generator', {
  state: (): State => ({
    session: null,
    list: [],
    loading: false,
    saving: false,
    saveError: null,
    progress: null,
  }),

  getters: {
    status: (s): GenerationStatus => s.session?.status ?? 'idle',
    hasSession: (s): boolean => s.session !== null,
    sessionId: (s): string | null => s.session?.id ?? null,
    materials: (s): RawMaterial[] => s.session?.rawMaterials ?? [],
    cost: (s) => s.session?.cost ?? emptyCost(),
  },

  actions: {
    async refreshList() {
      this.loading = true
      try {
        this.list = await currentGenerationService().list()
      } finally {
        this.loading = false
      }
    },

    async createSession(title: string, rawMaterials: RawMaterial[] = []) {
      this.loading = true
      try {
        this.session = await currentGenerationService().create({ title, rawMaterials })
        this.saveError = null
        rememberSessionId(this.session.id)
        // Also refresh the list so the new session appears in any picker.
        this.list = [
          {
            id: this.session.id,
            title: this.session.title,
            status: this.session.status,
            updatedAt: this.session.updatedAt,
            resultSpreadId: this.session.resultSpreadId,
          },
          ...this.list,
        ]
      } finally {
        this.loading = false
      }
    },

    async openSession(id: string) {
      this.loading = true
      try {
        this.session = await currentGenerationService().load(id)
        this.saveError = null
        rememberSessionId(this.session.id)
        // A session whose status is mid-work was almost certainly
        // interrupted (refresh, tab close, network drop). The job isn't
        // running anymore — but `isWorking` keys off status, so leaving
        // it as e.g. `compiling` permanently disables the "advance"
        // buttons. Downgrade to the latest milestone the data supports.
        const downgraded = milestoneForData(this.session)
        if (downgraded !== this.session.status) {
          this.patch({ status: downgraded })
        }
      } finally {
        this.loading = false
      }
    },

    /**
     * Attempt to re-open the last session the user worked on. Returns true
     * if a session was hydrated. Silently no-ops if there's no remembered
     * id or the row is gone (e.g. deleted from another tab). Called on
     * Generator surface mount so a page refresh resumes mid-pipeline.
     */
    async tryRestoreLastSession(): Promise<boolean> {
      const id = readLastSessionId()
      if (!id) return false
      try {
        await this.openSession(id)
        return true
      } catch {
        // Stale id (deleted/permissions) — forget it so we don't loop.
        rememberSessionId(null)
        return false
      }
    },

    closeSession() {
      // Flush any pending writes before clearing local state, otherwise
      // the user loses in-progress edits on tab close. We deliberately
      // do NOT forget the lastSessionId here: closing the Generator
      // surface is a navigation event, not a deletion — the user should
      // be able to resume by reopening the surface or refreshing.
      this.flushPending()
      this.session = null
      pending = {}
      if (timer) {
        clearTimeout(timer)
        timer = null
      }
    },

    /**
     * Patch the live session and schedule a debounced persist. Optimistic:
     * UI sees the change immediately; persistence catches up.
     */
    patch(p: GenerationSessionPatch) {
      if (!this.session) return
      // Apply in-memory immediately.
      this.session = { ...this.session, ...p, updatedAt: new Date().toISOString() }
      // Merge into the pending bag (last write wins per field).
      pending = { ...pending, ...p }
      this.scheduleFlush()
    },

    scheduleFlush() {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => {
        void this.flushPending()
      }, DEBOUNCE_MS)
    },

    /**
     * Force-flush the pending patch buffer. Awaitable. Safe to call when no
     * writes are pending — resolves immediately.
     */
    async flushPending(): Promise<void> {
      if (timer) {
        clearTimeout(timer)
        timer = null
      }
      if (!this.session) return
      if (Object.keys(pending).length === 0) {
        // Wait for any in-flight write so callers can rely on flushPending()
        // meaning "no more outstanding network writes after this".
        if (inflight) await inflight
        return
      }
      const id = this.session.id
      const payload = pending
      pending = {}
      this.saving = true
      this.saveError = null
      const promise = (async () => {
        try {
          const updated = await currentGenerationService().update(id, payload)
          // Only overwrite local fields the server returned, preserving any
          // user edits that happened during the await.
          if (this.session && this.session.id === id) {
            this.session = {
              ...this.session,
              updatedAt: updated.updatedAt,
              // server may have validated/normalized some fields:
              status: updated.status,
            }
          }
        } catch (err) {
          this.saveError = err instanceof Error ? err.message : String(err)
          // Re-enqueue the patch so the next user action / explicit retry
          // tries again. This keeps writes from silently disappearing.
          pending = { ...payload, ...pending }
        } finally {
          this.saving = false
          inflight = null
        }
      })()
      inflight = promise
      await promise
    },

    // ===== Pipeline mutations =====
    // These are the entry points the generator layers (PR 4+) call.

    setStatus(status: GenerationStatus) {
      this.patch({ status })
    },

    /** Replace the transient progress payload. Pass null to clear. */
    setProgress(p: PipelineProgress | null) {
      this.progress = p
    },

    /** Bump the counter of an in-flight progress payload. No-op if cleared. */
    bumpProgress(delta = 1) {
      if (!this.progress) return
      this.progress = { ...this.progress, current: this.progress.current + delta }
    },

    setError(message: string | null) {
      this.patch({
        errorMessage: message,
        status: message ? 'error' : this.session?.status ?? 'idle',
      })
    },

    addMaterial(m: RawMaterial) {
      if (!this.session) return
      this.patch({ rawMaterials: [...this.session.rawMaterials, m] })
    },

    removeMaterial(id: string) {
      if (!this.session) return
      this.patch({
        rawMaterials: this.session.rawMaterials.filter((m) => m.id !== id),
      })
    },

    setBrief(brief: unknown) {
      this.patch({ brief, status: 'brief-ready' })
    },

    setAngles(angles: unknown, selectedIds: string[]) {
      this.patch({
        angles,
        selectedAngleIds: selectedIds,
        status: 'angles-ready',
      })
    },

    /**
     * Attach a block-by-block preview to a specific angle in the session.
     * Stored as an extra field on the angle object (the angles blob is
     * persisted as opaque JSON, so we get free persistence without a DB
     * migration). Pass null to clear that angle's preview.
     */
    setAnglePreview(angleId: string, preview: unknown | null) {
      if (!this.session) return
      const current = this.session.angles
      if (!Array.isArray(current)) return
      const next = current.map((a) => {
        if (!a || typeof a !== 'object' || (a as { id?: string }).id !== angleId) return a
        const clone: Record<string, unknown> = { ...(a as Record<string, unknown>) }
        if (preview === null) delete clone.preview
        else clone.preview = preview
        return clone
      })
      this.patch({ angles: next })
    },

    setVariant(angleId: string, variant: unknown) {
      if (!this.session) return
      this.patch({
        variants: { ...this.session.variants, [angleId]: variant },
      })
    },

    selectVariant(angleId: string) {
      this.patch({ selectedVariantId: angleId })
    },

    setResult(schema: SpreadSchema, spreadId: string) {
      this.patch({
        resultSchema: schema,
        resultSpreadId: spreadId,
        status: 'opened-in-editor',
      })
    },

    /**
     * Add to the cumulative cost counter. Each LLM call from the generator
     * reports its usage here for the cost-counter UI in PR 8.
     */
    addCost(input: { inputTokens?: number; outputTokens?: number; usd?: number }) {
      if (!this.session) return
      const c = this.session.cost
      this.patch({
        cost: {
          totalInputTokens: c.totalInputTokens + (input.inputTokens ?? 0),
          totalOutputTokens: c.totalOutputTokens + (input.outputTokens ?? 0),
          totalUsd: c.totalUsd + (input.usd ?? 0),
          calls: c.calls + 1,
        },
      })
    },
  },
})

/** Test helper: reset module-level debouncer state between tests. */
export const __resetGeneratorPendingForTests = (): void => {
  pending = {}
  if (timer) {
    clearTimeout(timer)
    timer = null
  }
  inflight = null
}
