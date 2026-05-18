// Editor persona orchestration. Picks the right archetype, runs the LLM,
// validates output, and stamps the angleId + archetypeId on the result.

import { z } from 'zod'
import { aiCall } from '@/ai'
import type { Brief } from '../schemas/brief'
import type { StoryAngle, EditorArchetypeId } from '../schemas/angle'
import { editorLlmOutputSchema, type EditorOutput } from '../schemas/editorOutput'
import { japaneseLifestyle } from './japaneseLifestyle'
import { swissBook } from './swissBook'
import { nytLongread } from './nytLongread'
import type { EditorArchetype } from './types'
import { normalizeEditorOutput } from './normalize'

// Tolerant wrapper: fills synthetic ids, coerces stringified numbers,
// drops orphan zones/violations — then hands off to the strict schema.
// Saves a retry round-trip on the most common LLM mistakes.
const looseEditorOutputSchema = z.preprocess(
  normalizeEditorOutput,
  editorLlmOutputSchema,
)

// Editor partituras are big (zones × accents × violations × palette + gaps).
// The default 4096-token cap clips mid-JSON on detailed runs — bump it so
// the structured-output retry has a fighting chance.
const EDITOR_MAX_TOKENS = 8192

// Editor is the highest-reasoning step in the pipeline: it has to hold the
// brief + angle in mind and emit a self-consistent partitura with valid
// cross-refs. Haiku reliably fails the schema here; sonnet handles it.
// Users who want opus (or who already typed a model in Settings) get their
// choice — this is just a stronger default than the provider's haiku.
const EDITOR_PREFERRED_MODEL = 'claude-sonnet-4-6'

const ARCHETYPES: Partial<Record<EditorArchetypeId, EditorArchetype>> = {
  'japanese-lifestyle': japaneseLifestyle,
  'swiss-book': swissBook,
  'nyt-longread': nytLongread,
}

// Schema accepts more archetype ids than we've actually implemented
// (`apartamento`, `hiphop-underground` are v2). When the LLM picks one of
// the unimplemented ids we route to the nearest implemented archetype
// instead of failing the whole angle — failure here silently hides a
// variant card in the UI, which is the worst possible behaviour.
const FALLBACK_ROUTE: Record<EditorArchetypeId, EditorArchetypeId> = {
  'japanese-lifestyle': 'japanese-lifestyle',
  'swiss-book': 'swiss-book',
  'nyt-longread': 'nyt-longread',
  apartamento: 'japanese-lifestyle',
  'hiphop-underground': 'nyt-longread',
}

export const getArchetype = (id: EditorArchetypeId): EditorArchetype => {
  const direct = ARCHETYPES[id]
  if (direct) return direct
  const routed = ARCHETYPES[FALLBACK_ROUTE[id]]
  if (routed) {
    // eslint-disable-next-line no-console
    console.warn(`[generator] editor "${id}" not implemented — routing to "${FALLBACK_ROUTE[id]}"`)
    return routed
  }
  throw new Error(`Editor archetype "${id}" is not implemented and has no fallback.`)
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
    schema: looseEditorOutputSchema,
    temperature: 0.7,
    maxTokens: EDITOR_MAX_TOKENS,
    preferredModel: EDITOR_PREFERRED_MODEL,
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
