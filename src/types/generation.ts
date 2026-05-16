// Cross-layer types for the editorial generator. Inner content types
// (Brief, StoryAngle, EditorOutput) are intentionally widened to `unknown`
// at the persistence boundary in PR 3 — PR 4+ narrows them via zod
// schemas at the point of LLM I/O. Persisting as jsonb means renaming
// inner fields later doesn't require a SQL migration.

import type { SpreadSchema } from './element'

export type GenerationStatus =
  | 'idle'
  | 'uploading'
  | 'analyzing'
  | 'brief-ready'
  | 'generating-angles'
  | 'angles-ready'
  | 'compiling'
  | 'variants-ready'
  | 'opened-in-editor'
  | 'error'

/**
 * Uploaded raw material. Lives on Supabase Storage; service layer hands
 * back signed URLs for LLM consumption.
 */
export interface RawMaterial {
  id: string
  kind: 'text' | 'image'
  /** Storage path (text content stored as a .txt blob) or inline text. */
  storagePath?: string
  /** Inline text content when user pastes directly. */
  inlineText?: string
  /** Display filename. */
  filename: string
  /** Bytes uploaded so far / total. */
  size?: number
  /** Optional user-provided hint shown alongside the asset. */
  userHint?: string
  createdAt: string
}

/**
 * Persisted session record. The four big payloads (brief, angles, variants,
 * cost) are typed as `unknown` here and Zod-validated by their producers in
 * PR 4 and later. Keeping them opaque at the storage seam means a prompt
 * tweak doesn't require a DB migration.
 */
export interface GenerationSession {
  id: string
  ownerId: string
  status: GenerationStatus
  /** User-facing label, defaults to first material filename. */
  title: string
  rawMaterials: RawMaterial[]
  brief: unknown | null
  angles: unknown | null
  selectedAngleIds: string[]
  variants: Record<string, unknown>
  selectedVariantId: string | null
  /** Final SpreadSchema once user opens a variant in the editor. */
  resultSchema: SpreadSchema | null
  /** Spread row id created when user picks a variant. */
  resultSpreadId: string | null
  /** Last error message visible to the user. */
  errorMessage: string | null
  /** Cumulative provider usage stats. */
  cost: {
    totalInputTokens: number
    totalOutputTokens: number
    totalUsd: number
    calls: number
  }
  createdAt: string
  updatedAt: string
}

/** Minimum payload required to bootstrap a session row. */
export type GenerationSessionInsert = Pick<
  GenerationSession,
  'title' | 'rawMaterials'
>

/** Patchable fields when persisting incremental progress. */
export type GenerationSessionPatch = Partial<
  Pick<
    GenerationSession,
    | 'status'
    | 'title'
    | 'rawMaterials'
    | 'brief'
    | 'angles'
    | 'selectedAngleIds'
    | 'variants'
    | 'selectedVariantId'
    | 'resultSchema'
    | 'resultSpreadId'
    | 'errorMessage'
    | 'cost'
  >
>

export const emptyCost = (): GenerationSession['cost'] => ({
  totalInputTokens: 0,
  totalOutputTokens: 0,
  totalUsd: 0,
  calls: 0,
})
