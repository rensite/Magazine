import { onBeforeUnmount, onMounted, watch } from 'vue'
import { useSpreadStore } from '@/stores/spreadStore'
import { cacheMarkSynced, cachePut } from '@/services/localCache'
import type { SpreadService } from '@/services/spreadService'

const LOCAL_DEBOUNCE_MS = 500
const REMOTE_INTERVAL_MS = 60_000

export interface PersistenceState {
  status: 'idle' | 'saving-local' | 'saving-remote' | 'error'
  lastError: Error | null
  lastSyncedAt: number | null
}

export const usePersistence = (service: SpreadService) => {
  const store = useSpreadStore()
  const state: PersistenceState = {
    status: 'idle',
    lastError: null,
    lastSyncedAt: null,
  }

  let localTimer: number | null = null
  let remoteTimer: number | null = null
  let needsRemote = false

  const flushLocal = async () => {
    if (!store.spreadId) return
    state.status = 'saving-local'
    try {
      await cachePut(store.spreadId, store.schema)
      needsRemote = true
      state.status = 'idle'
    } catch (err) {
      state.status = 'error'
      state.lastError = err as Error
    }
  }

  const flushRemote = async (opts: { snapshotVersion?: boolean; label?: string } = {}) => {
    if (!store.spreadId || !needsRemote) return
    state.status = 'saving-remote'
    try {
      await service.saveAuto(store.spreadId, store.schema)
      if (opts.snapshotVersion) {
        await service.saveVersion(store.spreadId, store.schema, opts.label)
      }
      await cacheMarkSynced(store.spreadId)
      state.lastSyncedAt = Date.now()
      needsRemote = false
      store.markClean()
      state.status = 'idle'
    } catch (err) {
      state.status = 'error'
      state.lastError = err as Error
    }
  }

  const scheduleLocal = () => {
    if (localTimer !== null) window.clearTimeout(localTimer)
    localTimer = window.setTimeout(() => {
      localTimer = null
      void flushLocal()
    }, LOCAL_DEBOUNCE_MS)
  }

  const startRemoteHeartbeat = () => {
    if (remoteTimer !== null) return
    remoteTimer = window.setInterval(() => {
      void flushRemote()
    }, REMOTE_INTERVAL_MS)
  }

  const stopRemoteHeartbeat = () => {
    if (remoteTimer !== null) {
      window.clearInterval(remoteTimer)
      remoteTimer = null
    }
  }

  const forceSave = async (label?: string) => {
    if (localTimer !== null) {
      window.clearTimeout(localTimer)
      localTimer = null
    }
    await flushLocal()
    await flushRemote({ snapshotVersion: true, label })
  }

  const stopWatcher = watch(
    () => store.dirty,
    (isDirty) => {
      if (isDirty && !store.inTransaction) scheduleLocal()
    },
  )

  const beforeUnload = (e: BeforeUnloadEvent) => {
    if (store.dirty || needsRemote) {
      e.preventDefault()
      e.returnValue = ''
    }
  }

  onMounted(() => {
    startRemoteHeartbeat()
    window.addEventListener('beforeunload', beforeUnload)
  })

  onBeforeUnmount(() => {
    stopWatcher()
    stopRemoteHeartbeat()
    window.removeEventListener('beforeunload', beforeUnload)
    if (localTimer !== null) window.clearTimeout(localTimer)
  })

  return { state, forceSave, flushLocal, flushRemote }
}
