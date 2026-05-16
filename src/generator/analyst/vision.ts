// Vision analyst: image URL + tech metadata → MediaSemantic via Gemini.
// Falls back through router chain (Gemini → Claude → Grok) automatically.

import { aiCall } from '@/ai'
import { mediaSemanticSchema, type MediaSemantic, type MediaTechMeta } from '../schemas/brief'

const SYSTEM = `You are an editorial photo editor analyzing an image for use in a magazine spread. Return STRICT JSON matching the requested schema. Be terse; no flowery prose.`

const buildPrompt = (tech: MediaTechMeta, userHint?: string): string => {
  const aspect = tech.aspectRatio.toFixed(2)
  return `Analyze this image for editorial spread layout.

Technical metadata you already have:
- dimensions: ${tech.width}x${tech.height}px (aspect ${aspect})
- dominant palette (OKLCH, top 5): ${tech.palette.map((p) => `(${p.l.toFixed(2)}, ${p.c.toFixed(2)}, ${Math.round(p.h)}°)`).join(', ') || 'unknown'}
${userHint ? `User hint: "${userHint}"` : ''}

Return a JSON object with these fields:
- shotType: portrait | closeup | environment | detail | wide | object
- subject: 2–4 word noun phrase
- subjectDetail: one sentence
- focalPoint: { x, y } normalized 0..1 (where the eye should land)
- mood: warm | cold | neutral | tense | serene | energetic
- palette: 3–5 OKLCH colors (you may use the tech palette as a starting point or refine)
- hasFaces: boolean
- faceCount: integer
- faceGazeDirection: left|right|up|down|camera (omit if no faces)
- technicalQuality: high | medium | low — sharpness, exposure, noise
- editorialFitness: 0..1 — how strong this kadr is for a magazine spread
- tags: up to 8 single-word keywords (lowercase)
- caption: 1 sentence neutral caption in the language of the user hint, or English if none

Bad examples to avoid:
- shotType "selfie" (not in enum)
- caption longer than one sentence
- palette empty when colors are visible
`
}

/**
 * Analyze a single image. `url` should be publicly fetchable by the
 * provider (Supabase signed URL works for Gemini's file_data hint and
 * for Grok's image_url; Claude prefers base64 — for now we send URL
 * and rely on Gemini being the routed primary).
 */
export const analyzeImageSemantic = async (
  url: string,
  tech: MediaTechMeta,
  userHint?: string,
  signal?: AbortSignal,
): Promise<MediaSemantic> => {
  const { data } = await aiCall(buildPrompt(tech, userHint), {
    task: 'vision',
    system: SYSTEM,
    schema: mediaSemanticSchema,
    images: [{ url }],
    temperature: 0.2,
    promptVersion: 'vision/v1',
    signal,
  })
  return data
}
