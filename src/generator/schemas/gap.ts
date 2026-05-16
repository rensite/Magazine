// Gap suggestions emitted by editors. Drives the right-hand "what to add /
// remove / reshoot" panel in the UI and the image-generation flow in PR 8.

import { z } from 'zod'

export const gapKindSchema = z.enum([
  'missing-text',
  'missing-image',
  'missing-quote',
  'missing-factbox',
  'missing-caption',
  'tonal-imbalance',
  'length-mismatch',
  'image-quality',
  'redundancy',
])
export type GapKind = z.infer<typeof gapKindSchema>

export const suggestedActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('generate-text'), brief: z.string() }),
  z.object({ type: z.literal('shoot-photo'), brief: z.string() }),
  z.object({ type: z.literal('find-stock'), query: z.string() }),
  z.object({
    type: z.literal('generate-image'),
    /** Restricted to image-capable providers; aiGenerateImage handles fallback. */
    provider: z.enum(['grok', 'gemini']).optional(),
    brief: z.string(),
    aspectRatio: z.string().optional(),
    style: z.string().optional(),
  }),
  z.object({
    type: z.literal('add-element'),
    element: z.enum(['pullquote', 'caption', 'factbox']),
    content: z.string(),
  }),
  z.object({ type: z.literal('drop-element'), targetId: z.string() }),
  z.object({ type: z.literal('rewrite'), targetId: z.string(), brief: z.string() }),
])
export type SuggestedAction = z.infer<typeof suggestedActionSchema>

export const gapSchema = z.object({
  id: z.string().min(1),
  kind: gapKindSchema,
  priority: z.enum(['critical', 'recommended', 'nice-to-have']),
  description: z.string().min(1),
  reason: z.string().min(1),
  suggestedAction: suggestedActionSchema,
  preview: z.string().optional(),
})
export type Gap = z.infer<typeof gapSchema>
