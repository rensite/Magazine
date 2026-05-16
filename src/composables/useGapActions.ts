// Resolve gap suggestedActions into concrete side effects. The biggest one
// is `generate-image` — we kick off parallel calls to Grok AND Gemini so
// the user can pick the better result.

import { ref } from 'vue'
import { aiGenerateImage } from '@/ai'
import type { GeneratedImage, ProviderId } from '@/ai'
import type { Gap, SuggestedAction } from '@/generator/schemas/gap'
import { useGeneratorStore } from '@/stores/generatorStore'

export interface ImagePair {
  grok: GeneratedImage | { error: string } | null
  gemini: GeneratedImage | { error: string } | null
}

export const useGapActions = () => {
  const store = useGeneratorStore()
  /** Map of gap.id → ImagePair (or null while pending). */
  const generatedImages = ref<Record<string, ImagePair>>({})
  const inflight = ref<Set<string>>(new Set())

  const trackCostFromImage = (img: GeneratedImage | null): void => {
    if (!img) return
    // Image providers don't surface token counts; we just increment the call counter.
    store.addCost({ inputTokens: 0, outputTokens: 0, usd: 0 })
  }

  /**
   * For a generate-image gap, kick off BOTH Grok and Gemini in parallel.
   * Each result is stored independently so the user sees whichever
   * arrives first; the slower one fills in when it lands. Failures
   * surface as `{ error }` rather than crashing the panel.
   */
  const generateImagesForGap = async (gap: Gap): Promise<void> => {
    if (gap.suggestedAction.type !== 'generate-image') return
    if (inflight.value.has(gap.id)) return
    inflight.value.add(gap.id)
    generatedImages.value[gap.id] = { grok: null, gemini: null }
    const brief = (gap.suggestedAction as Extract<SuggestedAction, { type: 'generate-image' }>)
      .brief
    const aspect = (gap.suggestedAction as Extract<SuggestedAction, { type: 'generate-image' }>)
      .aspectRatio
    const runFor = async (provider: ProviderId) => {
      try {
        const img = await aiGenerateImage(brief, {
          provider,
          aspectRatio: aspect,
          enableFallback: false,
        })
        generatedImages.value = {
          ...generatedImages.value,
          [gap.id]: {
            ...(generatedImages.value[gap.id] ?? { grok: null, gemini: null }),
            [provider]: img,
          },
        }
        trackCostFromImage(img)
      } catch (err) {
        generatedImages.value = {
          ...generatedImages.value,
          [gap.id]: {
            ...(generatedImages.value[gap.id] ?? { grok: null, gemini: null }),
            [provider]: { error: err instanceof Error ? err.message : String(err) },
          },
        }
      }
    }
    await Promise.all([runFor('grok'), runFor('gemini')])
    inflight.value.delete(gap.id)
  }

  return { generatedImages, inflight, generateImagesForGap }
}
