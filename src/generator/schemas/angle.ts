// Schemas for Layer 2 outputs.

import { z } from 'zod'

export const editorArchetypeIdSchema = z.enum([
  'japanese-lifestyle',
  'swiss-book',
  'nyt-longread',
  // V2 archetypes; routed-to but not yet implemented in MVP.
  'apartamento',
  'hiphop-underground',
])
export type EditorArchetypeId = z.infer<typeof editorArchetypeIdSchema>

export const storyAngleSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(2).max(60),
  oneliner: z.string().min(4).max(200),
  hook: z.string().min(4),
  arc: z.object({
    opening: z.string(),
    development: z.string(),
    climax: z.string(),
    closing: z.string(),
  }),
  keyBeats: z.array(z.string()).min(2).max(8),
  recommendedEditor: editorArchetypeIdSchema,
  suitabilityScore: z.number().min(0).max(1),
  caveats: z.array(z.string()).default([]),
})
export type StoryAngle = z.infer<typeof storyAngleSchema>

export const storyAnglesResponseSchema = z.object({
  angles: z.array(storyAngleSchema).min(2).max(6),
})
export type StoryAnglesResponse = z.infer<typeof storyAnglesResponseSchema>
