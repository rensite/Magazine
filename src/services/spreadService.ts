import type { SpreadRecord, SpreadSchema, SpreadVersion } from '@/types/element'
import { getSupabase } from './supabaseClient'

export interface SpreadService {
  list(): Promise<Pick<SpreadRecord, 'id' | 'title' | 'updated_at' | 'current_version'>[]>
  load(id: string): Promise<SpreadRecord>
  create(title: string, schema: SpreadSchema): Promise<SpreadRecord>
  rename(id: string, title: string): Promise<void>
  remove(id: string): Promise<void>
  saveAuto(id: string, schema: SpreadSchema): Promise<void>
  saveVersion(id: string, schema: SpreadSchema, label?: string): Promise<SpreadVersion>
  listVersions(id: string): Promise<SpreadVersion[]>
  restoreVersion(id: string, versionId: string): Promise<SpreadRecord>
  signedUrls(paths: string[], expiresIn?: number): Promise<Record<string, string>>
}

export const supabaseSpreadService: SpreadService = {
  async list() {
    const { data, error } = await getSupabase()
      .from('spreads')
      .select('id, title, updated_at, current_version')
      .order('updated_at', { ascending: false })
    if (error) throw error
    return data ?? []
  },

  async load(id) {
    const { data, error } = await getSupabase()
      .from('spreads')
      .select('id, title, schema, current_version, updated_at')
      .eq('id', id)
      .single()
    if (error) throw error
    return data as SpreadRecord
  },

  async create(title, schema) {
    const { data, error } = await getSupabase()
      .from('spreads')
      .insert({ title, schema })
      .select('id, title, schema, current_version, updated_at')
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
