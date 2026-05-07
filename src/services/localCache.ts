import { get, set, del, keys } from 'idb-keyval'
import type { SpreadSchema } from '@/types/element'

interface CacheEntry {
  schema: SpreadSchema
  savedAt: number
  syncedAt: number | null
}

const key = (spreadId: string) => `spread:${spreadId}`

const toPlain = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T

export const cacheGet = (spreadId: string): Promise<CacheEntry | undefined> =>
  get<CacheEntry>(key(spreadId))

export const cachePut = async (
  spreadId: string,
  schema: SpreadSchema,
  syncedAt: number | null = null,
): Promise<void> => {
  await set(key(spreadId), {
    schema: toPlain(schema),
    savedAt: Date.now(),
    syncedAt,
  } satisfies CacheEntry)
}

export const cacheMarkSynced = async (spreadId: string): Promise<void> => {
  const entry = await cacheGet(spreadId)
  if (!entry) return
  entry.syncedAt = Date.now()
  await set(key(spreadId), entry)
}

export const cacheDrop = (spreadId: string): Promise<void> =>
  del(key(spreadId))

export const cacheList = async (): Promise<string[]> => {
  const ks = await keys()
  return ks
    .map((k) => String(k))
    .filter((k) => k.startsWith('spread:'))
    .map((k) => k.slice('spread:'.length))
}

export const isCacheNewer = (entry: CacheEntry | undefined, serverUpdatedAt: string): boolean => {
  if (!entry) return false
  if (entry.syncedAt === null) return true
  const serverMs = Date.parse(serverUpdatedAt)
  return entry.savedAt > serverMs
}
