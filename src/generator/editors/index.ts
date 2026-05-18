// Editor persona orchestration. Picks the right archetype, runs the LLM,
// validates output, and stamps the angleId + archetypeId on the result.

import { aiCall } from '@/ai'
import type { Brief } from '../schemas/brief'
import type { StoryAngle, EditorArchetypeId } from '../schemas/angle'
import { editorLlmOutputSchema, type EditorOutput } from '../schemas/editorOutput'
import { japaneseLifestyle } from './japaneseLifestyle'
import { swissBook } from './swissBook'
import { nytLongread } from './nytLongread'
import type { EditorArchetype } from './types'

const ARCHETYPES: Partial<Record<EditorArchetypeId, EditorArchetype>> = {
  'japanese-lifestyle': japaneseLifestyle,
  'swiss-book': swissBook,
  'nyt-longread': nytLongread,
}

export const getArchetype = (id: EditorArchetypeId): EditorArchetype => {
  const a = ARCHETYPES[id]
  if (!a) throw new Error(`Editor archetype "${id}" is not implemented in MVP.`)
  return a
}

export const availableArchetypes = (): EditorArchetype[] =>
  Object.values(ARCHETYPES).filter((a): a is EditorArchetype => !!a)

const SYSTEM = `You are an experienced magazine art director. Produce STRICT JSON matching the editor-output schema. Reference content by id from the brief — do NOT invent new content in the partitura's zones.`

export interface RunEditorOptions {
  brief: Brief
  angle: StoryAngle
  archetypeId?: EditorArchetypeId // override the angle's recommendation
  uiLanguage?: string
  signal?: AbortSignal
}

export const runEditor = async (opts: RunEditorOptions): Promise<EditorOutput> => {
  const archId = opts.archetypeId ?? opts.angle.recommendedEditor
  const archetype = getArchetype(archId)
  const lang = opts.uiLanguage ?? opts.brief.content.detectedLanguage ?? 'ru'

  const prompt = archetype.buildPrompt({
    brief: opts.brief,
    angle: opts.angle,
    uiLanguage: lang,
    signal: opts.signal,
  })

  const { data } = await aiCall(prompt, {
    task: 'editor',
    system: SYSTEM,
    schema: editorLlmOutputSchema,
    temperature: 0.7,
    promptVersion: `editor/${archId}/v1`,
    signal: opts.signal,
  })

  const processed = archetype.postProcess ? archetype.postProcess(data) : data
  return {
    ...processed,
    angleId: opts.angle.id,
    archetypeId: archId,
  }
}

/**
 * Run the editor pass in parallel for a list of angles. Each is wrapped
 * so one failure doesn't kill the rest — the failing slot becomes null
 * which the UI renders as a fallback card.
 */
export const runEditorsForAngles = async (
  brief: Brief,
  angles: StoryAngle[],
  uiLanguage: string,
  signal?: AbortSignal,
  onProgress?: (done: number, total: number) => void,
): Promise<Array<{ angleId: string; output: EditorOutput | null; error?: string }>> => {
  const total = angles.length
  let done = 0
  onProgress?.(0, total)
  const results = await Promise.all(
    angles.map(async (angle) => {
      try {
        const output = await runEditor({ brief, angle, uiLanguage, signal })
        return { angleId: angle.id, output }
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') throw err
        return {
          angleId: angle.id,
          output: null,
          error: err instanceof Error ? err.message : String(err),
        }
      } finally {
        done += 1
        onProgress?.(done, total)
      }
    }),
  )
  return results
}

export type { EditorArchetype, EditorInput } from './types'
