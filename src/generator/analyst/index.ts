// Layer 1 facade: orchestrates text analysis + per-image semantic analysis
// in parallel, composes the Brief, and supports cancellation via AbortSignal.

import type { Brief, Media, MediaTechMeta } from '../schemas/brief'
import { analyzeText } from './textAnalyst'
import { analyzeImageSemantic } from './vision'
import { composeBrief } from './brief'

export interface RawImageInput {
  /** Stable id used downstream (Media.id). */
  id: string
  /** Publicly fetchable URL (Supabase signed URL etc.). */
  url: string
  /** Locally computed metadata, see imageTech.ts. */
  tech: MediaTechMeta
  /** Optional user-provided context for this image. */
  userHint?: string
}

export interface AnalyzeInput {
  rawText: string
  images: RawImageInput[]
  uiLanguage?: string
  signal?: AbortSignal
}

/**
 * Run the full Layer 1 pipeline. Text and images analyze in parallel;
 * any individual image failure degrades that image to a "low quality"
 * placeholder rather than failing the entire run — partial briefs are
 * useful and the user can re-upload later.
 */
export const runAnalyst = async (input: AnalyzeInput): Promise<Brief> => {
  const lang = input.uiLanguage ?? 'ru'
  const textPromise = analyzeText(input.rawText, lang, input.signal)
  const imagePromises = input.images.map(async (img): Promise<Media | null> => {
    try {
      const semantic = await analyzeImageSemantic(img.url, img.tech, img.userHint, input.signal)
      return { id: img.id, url: img.url, tech: img.tech, semantic }
    } catch (err) {
      // Abort propagates upward; other errors are tolerated.
      if (err instanceof Error && err.name === 'AbortError') throw err
      // eslint-disable-next-line no-console
      console.warn(`[generator] vision analysis failed for ${img.id}:`, err)
      return null
    }
  })
  const [content, mediaResults] = await Promise.all([textPromise, Promise.all(imagePromises)])
  const media = mediaResults.filter((m): m is Media => m !== null)
  return composeBrief(content, media)
}

export { analyzeText } from './textAnalyst'
export { analyzeImageSemantic } from './vision'
export { analyzeImageLocally } from './imageTech'
export { composeBrief, evaluateSufficiency } from './brief'
