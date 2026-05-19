// Angle preview — a block-by-block outline of how an editor MIGHT lay
// out a selected angle. Cheaper than the full editor pass; runs after
// the user picks angles, before they commit to "compile variants".
//
// Purpose: give the user a concrete plan to choose from ("section X
// goes here with photo Y, with this editorial note") so they're not
// blindly paying for editor runs on angles that don't fit the material.

import { z } from 'zod'

export const previewBlockKindSchema = z.enum([
  'intro',
  'body',
  'pullquote',
  'caption',
  'sidebar',
  'factbox',
  'image-hero',
  'image-detail',
])
export type PreviewBlockKind = z.infer<typeof previewBlockKindSchema>

export const previewBlockSchema = z.object({
  /** Stable id within the preview — `b-1`, `b-2`, etc. */
  id: z.string().min(1),
  kind: previewBlockKindSchema,
  /** One-sentence description of what lives in this block. */
  summary: z.string().min(2),
  /** Section id from brief.content.structure.sections, if applicable. */
  contentRef: z.string().optional(),
  /** Media id from brief.media[], if applicable. */
  mediaRef: z.string().optional(),
  /** Editor comment: why this block sits here, what tone, etc. */
  note: z.string().optional(),
})
export type PreviewBlock = z.infer<typeof previewBlockSchema>

export const anglePreviewSchema = z.object({
  angleId: z.string().min(1),
  /** 4–12 blocks. Two-page spread won't usefully hold more than that. */
  blocks: z.array(previewBlockSchema).min(3).max(12),
  /** One-liner about overall pacing — affects editor's rhythm choice. */
  pacing: z.enum(['dense', 'balanced', 'spacious']).optional(),
})
export type AnglePreview = z.infer<typeof anglePreviewSchema>

/** LLM-facing wrapper so we can demand a single top-level object. */
export const anglePreviewResponseSchema = z.object({
  preview: anglePreviewSchema,
})
