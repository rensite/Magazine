// Persistence for editorial-generator sessions. Mirrors the shape of
// spreadService.ts so the rest of the codebase has one CRUD pattern.

import type {
  GenerationSession,
  GenerationSessionInsert,
  GenerationSessionPatch,
} from '@/types/generation'
import { getSupabase } from './supabaseClient'

/** Row as returned by Supabase. Snake_case fields are remapped to camelCase. */
interface GenerationRow {
  id: string
  owner_id: string
  status: string
  title: string
  raw_materials: unknown
  brief: unknown
  angles: unknown
  selected_angle_ids: unknown
  variants: unknown
  selected_variant_id: string | null
  result_schema: unknown
  result_spread_id: string | null
  error_message: string | null
  cost: unknown
  created_at: string
  updated_at: string
}

const fromRow = (row: GenerationRow): GenerationSession => ({
  id: row.id,
  ownerId: row.owner_id,
  status: (row.status as GenerationSession['status']) ?? 'idle',
  title: row.title,
  rawMaterials: Array.isArray(row.raw_materials)
    ? (row.raw_materials as GenerationSession['rawMaterials'])
    : [],
  brief: row.brief,
  angles: row.angles,
  selectedAngleIds: Array.isArray(row.selected_angle_ids)
    ? (row.selected_angle_ids as string[])
    : [],
  variants:
    row.variants && typeof row.variants === 'object'
      ? (row.variants as Record<string, unknown>)
      : {},
  selectedVariantId: row.selected_variant_id,
  resultSchema: row.result_schema as GenerationSession['resultSchema'],
  resultSpreadId: row.result_spread_id,
  errorMessage: row.error_message,
  cost: (row.cost as GenerationSession['cost']) ?? {
    totalInputTokens: 0,
    totalOutputTokens: 0,
    totalUsd: 0,
    calls: 0,
  },
  createdAt: row.created_at,
  updatedAt: row.updated_at,
})

/** Translate a camelCase patch into the snake_case payload Supabase expects. */
const toUpdatePayload = (patch: GenerationSessionPatch): Record<string, unknown> => {
  const out: Record<string, unknown> = {}
  if (patch.status !== undefined) out.status = patch.status
  if (patch.title !== undefined) out.title = patch.title
  if (patch.rawMaterials !== undefined) out.raw_materials = patch.rawMaterials
  if (patch.brief !== undefined) out.brief = patch.brief
  if (patch.angles !== undefined) out.angles = patch.angles
  if (patch.selectedAngleIds !== undefined) out.selected_angle_ids = patch.selectedAngleIds
  if (patch.variants !== undefined) out.variants = patch.variants
  if (patch.selectedVariantId !== undefined) out.selected_variant_id = patch.selectedVariantId
  if (patch.resultSchema !== undefined) out.result_schema = patch.resultSchema
  if (patch.resultSpreadId !== undefined) out.result_spread_id = patch.resultSpreadId
  if (patch.errorMessage !== undefined) out.error_message = patch.errorMessage
  if (patch.cost !== undefined) out.cost = patch.cost
  return out
}

export type GenerationListItem = Pick<
  GenerationSession,
  'id' | 'title' | 'status' | 'updatedAt' | 'resultSpreadId'
>

export interface GenerationService {
  list(): Promise<GenerationListItem[]>
  load(id: string): Promise<GenerationSession>
  create(input: GenerationSessionInsert): Promise<GenerationSession>
  update(id: string, patch: GenerationSessionPatch): Promise<GenerationSession>
  remove(id: string): Promise<void>
}

const SELECT_COLS =
  'id, owner_id, status, title, raw_materials, brief, angles, selected_angle_ids, variants, selected_variant_id, result_schema, result_spread_id, error_message, cost, created_at, updated_at'

const LIST_COLS = 'id, title, status, updated_at, result_spread_id'

export const supabaseGenerationService: GenerationService = {
  async list() {
    const { data, error } = await getSupabase()
      .from('generation_sessions')
      .select(LIST_COLS)
      .order('updated_at', { ascending: false })
    if (error) throw error
    return (data ?? []).map((r) => {
      const row = r as Pick<
        GenerationRow,
        'id' | 'title' | 'status' | 'updated_at' | 'result_spread_id'
      >
      return {
        id: row.id,
        title: row.title,
        status: row.status as GenerationSession['status'],
        updatedAt: row.updated_at,
        resultSpreadId: row.result_spread_id,
      }
    })
  },

  async load(id) {
    const { data, error } = await getSupabase()
      .from('generation_sessions')
      .select(SELECT_COLS)
      .eq('id', id)
      .single()
    if (error) throw error
    return fromRow(data as GenerationRow)
  },

  async create(input) {
    const { data, error } = await getSupabase()
      .from('generation_sessions')
      .insert({
        title: input.title,
        raw_materials: input.rawMaterials,
      })
      .select(SELECT_COLS)
      .single()
    if (error) throw error
    return fromRow(data as GenerationRow)
  },

  async update(id, patch) {
    const payload = toUpdatePayload(patch)
    if (Object.keys(payload).length === 0) {
      // No-op patch; just reload current row so callers get a consistent shape.
      return this.load(id)
    }
    const { data, error } = await getSupabase()
      .from('generation_sessions')
      .update(payload)
      .eq('id', id)
      .select(SELECT_COLS)
      .single()
    if (error) throw error
    return fromRow(data as GenerationRow)
  },

  async remove(id) {
    const { error } = await getSupabase()
      .from('generation_sessions')
      .delete()
      .eq('id', id)
    if (error) throw error
  },
}

/**
 * Test seam: allow injecting an alternate service implementation. The
 * generator store reads from `currentGenerationService()` so unit tests
 * can stub the whole persistence layer without mocking Supabase fetch.
 */
let activeService: GenerationService = supabaseGenerationService

export const setGenerationService = (svc: GenerationService): void => {
  activeService = svc
}

export const currentGenerationService = (): GenerationService => activeService
