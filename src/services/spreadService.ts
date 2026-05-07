import type {
  ChapterRecord,
  SpreadRecord,
  SpreadSchema,
  SpreadVersion,
} from '@/types/element'
import { getSupabase } from './supabaseClient'

export type SpreadListItem = Pick<
  SpreadRecord,
  'id' | 'title' | 'updated_at' | 'current_version' | 'schema' | 'chapter_id' | 'position'
>

export interface SpreadService {
  list(): Promise<SpreadListItem[]>
  load(id: string): Promise<SpreadRecord>
  create(title: string, schema: SpreadSchema): Promise<SpreadRecord>
  rename(id: string, title: string): Promise<void>
  remove(id: string): Promise<void>
  setChapter(id: string, chapterId: string | null): Promise<void>
  setPosition(id: string, position: number): Promise<void>
  saveAuto(id: string, schema: SpreadSchema): Promise<void>
  saveVersion(id: string, schema: SpreadSchema, label?: string): Promise<SpreadVersion>
  listVersions(id: string): Promise<SpreadVersion[]>
  restoreVersion(id: string, versionId: string): Promise<SpreadRecord>
  signedUrls(paths: string[], expiresIn?: number): Promise<Record<string, string>>

  listChapters(): Promise<ChapterRecord[]>
  createChapter(title: string): Promise<ChapterRecord>
  renameChapter(id: string, title: string): Promise<void>
  removeChapter(id: string): Promise<void>
  setChapterPosition(id: string, position: number): Promise<void>
}

export const supabaseSpreadService: SpreadService = {
  async list() {
    const { data, error } = await getSupabase()
      .from('spreads')
      .select('id, title, updated_at, current_version, schema, chapter_id, position')
      .order('position', { ascending: true })
      .order('updated_at', { ascending: false })
    if (error) throw error
    return (data ?? []) as SpreadListItem[]
  },

  async load(id) {
    const { data, error } = await getSupabase()
      .from('spreads')
      .select('id, title, schema, current_version, updated_at, chapter_id, position')
      .eq('id', id)
      .single()
    if (error) throw error
    return data as SpreadRecord
  },

  async create(title, schema) {
    const { data, error } = await getSupabase()
      .from('spreads')
      .insert({ title, schema })
      .select('id, title, schema, current_version, updated_at, chapter_id, position')
      .single()
    if (error) throw error
    return data as SpreadRecord
  },

  async rename(id, title) {
    const { error } = await getSupabase()
      .from('spreads')
      .update({ title })
      .eq('id', id)
    if (error) throw error
  },

  async remove(id) {
    const { error } = await getSupabase()
      .from('spreads')
      .delete()
      .eq('id', id)
    if (error) throw error
  },

  async setChapter(id, chapterId) {
    const { error } = await getSupabase()
      .from('spreads')
      .update({ chapter_id: chapterId })
      .eq('id', id)
    if (error) throw error
  },

  async setPosition(id, position) {
    const { error } = await getSupabase()
      .from('spreads')
      .update({ position })
      .eq('id', id)
    if (error) throw error
  },

  async listChapters() {
    const { data, error } = await getSupabase()
      .from('chapters')
      .select('id, title, position')
      .order('position', { ascending: true })
    if (error) throw error
    return (data ?? []) as ChapterRecord[]
  },

  async createChapter(title) {
    const { data: existing, error: posErr } = await getSupabase()
      .from('chapters')
      .select('position')
      .order('position', { ascending: false })
      .limit(1)
    if (posErr) throw posErr
    const nextPosition = (existing?.[0]?.position ?? -1) + 1
    const { data, error } = await getSupabase()
      .from('chapters')
      .insert({ title, position: nextPosition })
      .select('id, title, position')
      .single()
    if (error) throw error
    return data as ChapterRecord
  },

  async renameChapter(id, title) {
    const { error } = await getSupabase()
      .from('chapters')
      .update({ title })
      .eq('id', id)
    if (error) throw error
  },

  async removeChapter(id) {
    const { error } = await getSupabase()
      .from('chapters')
      .delete()
      .eq('id', id)
    if (error) throw error
  },

  async setChapterPosition(id, position) {
    const { error } = await getSupabase()
      .from('chapters')
      .update({ position })
      .eq('id', id)
    if (error) throw error
  },

  async saveAuto(id, schema) {
    const { error } = await getSupabase()
      .from('spreads')
      .update({ schema })
      .eq('id', id)
    if (error) throw error
  },

  async saveVersion(id, schema, label) {
    const { data, error } = await getSupabase().rpc('save_spread_version', {
      p_spread_id: id,
      p_schema: schema,
      p_label: label ?? null,
    })
    if (error) throw error
    return data as SpreadVersion
  },

  async listVersions(id) {
    const { data, error } = await getSupabase()
      .from('spread_versions')
      .select('id, spread_id, version, schema, label, created_at')
      .eq('spread_id', id)
      .order('version', { ascending: false })
    if (error) throw error
    return (data ?? []) as SpreadVersion[]
  },

  async restoreVersion(id, versionId) {
    const { data, error } = await getSupabase().rpc('restore_spread_version', {
      p_spread_id: id,
      p_version_id: versionId,
    })
    if (error) throw error
    return data as SpreadRecord
  },

  async signedUrls(paths, expiresIn = 60 * 60) {
    if (paths.length === 0) return {}
    const bucket = (await import('./supabaseClient')).ASSETS_BUCKET
    const { data, error } = await getSupabase().storage
      .from(bucket)
      .createSignedUrls(paths, expiresIn)
    if (error) throw error
    const map: Record<string, string> = {}
    for (const item of data ?? []) {
      if (item.signedUrl && item.path) map[item.path] = item.signedUrl
    }
    return map
  },
}
