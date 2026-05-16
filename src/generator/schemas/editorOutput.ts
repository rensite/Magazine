import { z } from 'zod'
import { editorArchetypeIdSchema } from './angle'
import { gapSchema } from './gap'
import { partituraSchema } from './partitura'

/** What the LLM returns from an editor persona (before compiler). */
export const editorLlmOutputSchema = z.object({
  selection: z.object({
    usedTextSections: z.array(z.string()),
    droppedTextSections: z
      .array(z.object({ id: z.string(), reason: z.string() }))
      .default([]),
    usedMedia: z.array(z.string()),
    droppedMedia: z
      .array(z.object({ id: z.string(), reason: z.string() }))
      .default([]),
  }),
  gaps: z.array(gapSchema).default([]),
  /** Editor's partitura. May be refined by the archetype's postProcess hook. */
  partitura: partituraSchema,
  editorialNotes: z.string().default(''),
})

/** Full editor output, with the angle id stamped on by the orchestrator. */
export const editorOutputSchema = editorLlmOutputSchema.extend({
  angleId: z.string(),
  archetypeId: editorArchetypeIdSchema,
})
export type EditorOutput = z.infer<typeof editorOutputSchema>
export type EditorLlmOutput = z.infer<typeof editorLlmOutputSchema>
