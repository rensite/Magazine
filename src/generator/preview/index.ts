// Angle preview generator: for each user-selected angle, ask the LLM
// to lay out a concrete block-by-block outline. Cheaper than running
// the full editor (no partitura, no grid, no typography) but specific
// enough that the user can decide which angles to actually compile.
//
// One AI call per angle, fanned out in parallel with a progress hook.

import { aiCall } from '@/ai'
import type { Brief } from '../schemas/brief'
import type { StoryAngle } from '../schemas/angle'
import {
  anglePreviewResponseSchema,
  type AnglePreview,
} from '../schemas/preview'

const SYSTEM = `You are an editor sketching a magazine spread. Produce a concrete block-by-block plan for a single story angle. Reference the brief's section ids and media ids verbatim — do NOT invent new content. Return STRICT JSON.`

const PREVIEW_MAX_TOKENS = 4096

const buildPrompt = (brief: Brief, angle: StoryAngle, lang: string): string => {
  const sections = brief.content.structure.sections
    .map((s) => `- ${s.id}${s.heading ? ` "${s.heading}"` : ''}: ${s.content.slice(0, 280)}`)
    .join('\n')
  const media = brief.media
    .map(
      (m) =>
        `- ${m.id}: ${m.semantic.shotType}, ${m.semantic.mood}, "${m.semantic.subjectDetail}"`,
    )
    .join('\n')
  return `Sketch a block-by-block outline for this angle on a magazine spread.

Angle:
- title: ${angle.title}
- oneliner: ${angle.oneliner}
- hook: ${angle.hook}
- arc: ${JSON.stringify(angle.arc)}
- recommended editor: ${angle.recommendedEditor}

Available text sections (use these ids verbatim in contentRef):
${sections || '(no text)'}

Available media (use these ids verbatim in mediaRef):
${media || '(none)'}

Produce 4–10 blocks in reading order. Each block is one of:
- intro: lede paragraph that opens the story
- body: paragraph(s) of running text
- pullquote: a short quote pulled from or echoing the source
- caption: photo caption
- sidebar: tangential note / context box
- factbox: numbered facts
- image-hero: a dominant photo
- image-detail: a smaller supporting photo

For every block return:
- id: "b-1", "b-2", … unique within this preview
- kind: one of the values above
- summary: one sentence saying WHAT goes in this block, in ${lang}
- contentRef: id of a section above, if this block uses text from one
- mediaRef: id of a media above, if this block IS or SHOWS a photo
- note: short editor comment (why this block, what tone — in ${lang})

Constraints:
- Every image-hero / image-detail / caption MUST have a mediaRef.
- Every intro / body / pullquote / sidebar / factbox SHOULD have a contentRef when the brief has text supporting it (omit if it doesn't).
- Don't reuse the same mediaRef in more than one image-* block.
- Aim for natural reading rhythm: don't stack 5 body blocks in a row without a visual break.

Also pick overall pacing: "dense" | "balanced" | "spacious".

Return JSON exactly: { "preview": { "angleId": "${angle.id}", "blocks": [ … ], "pacing": "…" } }`
}

export interface GenerateAnglePreviewOptions {
  uiLanguage?: string
  signal?: AbortSignal
}

export const generateAnglePreview = async (
  brief: Brief,
  angle: StoryAngle,
  opts: GenerateAnglePreviewOptions = {},
): Promise<AnglePreview> => {
  const lang = opts.uiLanguage ?? brief.content.detectedLanguage ?? 'ru'
  const { data } = await aiCall(buildPrompt(brief, angle, lang), {
    task: 'editor',
    system: SYSTEM,
    schema: anglePreviewResponseSchema,
    temperature: 0.5,
    maxTokens: PREVIEW_MAX_TOKENS,
    promptVersion: 'preview/v1',
    signal: opts.signal,
  })
  // Stamp the angleId from our side so the model can't drift onto the wrong row.
  return { ...data.preview, angleId: angle.id }
}

export const generateAnglePreviewsForAngles = async (
  brief: Brief,
  angles: StoryAngle[],
  uiLanguage: string,
  signal?: AbortSignal,
  onProgress?: (done: number, total: number) => void,
): Promise<Array<{ angleId: string; preview: AnglePreview | null; error?: string }>> => {
  const total = angles.length
  let done = 0
  onProgress?.(0, total)
  return Promise.all(
    angles.map(async (angle) => {
      try {
        const preview = await generateAnglePreview(brief, angle, { uiLanguage, signal })
        return { angleId: angle.id, preview }
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') throw err
        return {
          angleId: angle.id,
          preview: null,
          error: err instanceof Error ? err.message : String(err),
        }
      } finally {
        done += 1
        onProgress?.(done, total)
      }
    }),
  )
}
