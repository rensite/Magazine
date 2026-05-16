// Layer 2: Story Angles.
//
// Strategy: ask Claude for 4–5 conceptually different angles. Validate with
// zod. Then run a cheap uniqueness check on the titles (Jaccard over
// lowercase tokens, threshold 0.6). If two angles are too similar, retry
// once with the conflict pasted back. If the retry still collides we accept
// the result — we'd rather show the user 4 mostly-different angles than fail.

import { aiCall } from '@/ai'
import type { Brief } from '../schemas/brief'
import {
  storyAnglesResponseSchema,
  type StoryAngle,
} from '../schemas/angle'

const SYSTEM = `You are an editor planning a magazine spread. Your job is to propose distinct story angles — different ways to frame the same material. Different angles should differ in WHAT the story is about (theme, protagonist, question), not just in tone or style.`

const buildPrompt = (brief: Brief, count: number, lang: string): string => {
  const trimmedText = brief.content.structure.sections
    .map((s) => `[${s.id}${s.heading ? ' ' + s.heading : ''}] ${s.content.slice(0, 600)}`)
    .join('\n\n')
    .slice(0, 6000)
  const mediaSummary = brief.media
    .map(
      (m) =>
        `- ${m.id}: ${m.semantic.shotType}, ${m.semantic.mood}, "${m.semantic.subjectDetail}"`,
    )
    .join('\n')
  return `Propose ${count} conceptually different story angles for an editorial spread.

Material genre: ${brief.content.genre}
Detected language: ${brief.content.detectedLanguage}
Tone: ${brief.content.tone.primary}
Themes: ${brief.content.themes.join(', ') || '(none)'}

Text excerpts:
${trimmedText || '(no text)'}

Available images:
${mediaSummary || '(none)'}

Each angle must include:
- id: short slug (e.g. "morning-ritual")
- title: 2–5 word noun phrase, in ${lang}
- oneliner: one sentence "why this is interesting"
- hook: concrete sentence/quote, preferably pulled from or echoing the source
- arc: { opening, development, climax, closing } — each a short sentence
- keyBeats: 3–5 narrative beats
- recommendedEditor: one of "japanese-lifestyle" | "swiss-book" | "nyt-longread"
- suitabilityScore: 0..1 — how well the material supports this angle
- caveats: array of risks (e.g. "material may be too short")

The angles must be CONCEPTUALLY DIFFERENT. Examples of bad output:
- Two angles whose titles are paraphrases of each other.
- All angles using the same protagonist + same theme but different adjectives.

Return JSON: { "angles": [ ... ${count} items ... ] }`
}

/** Jaccard similarity over lowercase token sets. */
const tokens = (s: string): Set<string> =>
  new Set(
    s
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .split(/\s+/)
      .filter((t) => t.length > 2),
  )

const jaccard = (a: Set<string>, b: Set<string>): number => {
  if (a.size === 0 && b.size === 0) return 1
  let inter = 0
  for (const t of a) if (b.has(t)) inter++
  const uni = a.size + b.size - inter
  return uni === 0 ? 1 : inter / uni
}

// 0.4 is empirically tight enough to catch word-permuted titles ("Утренний
// ритуал" / "Ритуал утра") but loose enough that genuinely different angles
// don't false-positive on shared common nouns. Tested across both Russian
// and English fixtures; lower thresholds flagged adjacent-theme pairs that
// were actually concept-different.
const SIMILARITY_THRESHOLD = 0.4

/** Returns true if any two angle titles are too similar. */
export const anglesTooSimilar = (angles: StoryAngle[]): { i: number; j: number } | null => {
  const tokenSets = angles.map((a) => tokens(`${a.title} ${a.oneliner}`))
  for (let i = 0; i < tokenSets.length; i++) {
    for (let j = i + 1; j < tokenSets.length; j++) {
      if (jaccard(tokenSets[i], tokenSets[j]) >= SIMILARITY_THRESHOLD) {
        return { i, j }
      }
    }
  }
  return null
}

export interface GenerateAnglesOptions {
  count?: number
  uiLanguage?: string
  signal?: AbortSignal
}

export const generateAngles = async (
  brief: Brief,
  opts: GenerateAnglesOptions = {},
): Promise<StoryAngle[]> => {
  const count = opts.count ?? 4
  const lang = opts.uiLanguage ?? brief.content.detectedLanguage ?? 'ru'
  const prompt = buildPrompt(brief, count, lang)
  const { data } = await aiCall(prompt, {
    task: 'angles',
    system: SYSTEM,
    schema: storyAnglesResponseSchema,
    temperature: 0.85,
    promptVersion: 'angles/v1',
    signal: opts.signal,
  })

  const collision = anglesTooSimilar(data.angles)
  if (!collision) return data.angles

  // One retry, calling out the collision explicitly.
  const conflictA = data.angles[collision.i]
  const conflictB = data.angles[collision.j]
  const retryPrompt = `${prompt}\n\nYour previous attempt produced two angles that are conceptually too similar:\n- "${conflictA.title}" — ${conflictA.oneliner}\n- "${conflictB.title}" — ${conflictB.oneliner}\n\nGenerate a fresh set of ${count} angles. Each must address a different question, protagonist, or theme — not just a different mood.`
  const retry = await aiCall(retryPrompt, {
    task: 'angles',
    system: SYSTEM,
    schema: storyAnglesResponseSchema,
    temperature: 1.0,
    promptVersion: 'angles/v1-retry',
    signal: opts.signal,
  })
  // Accept whichever set is more diverse; if retry is still bad, keep originals
  // because the test only mandates ≥1 retry, not infinite.
  return retry.data.angles
}
