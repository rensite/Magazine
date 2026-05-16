// Brief composer: merges ContentAnalysis + Media[] into a Brief and
// runs deterministic sufficiency rules. No LLM here — sufficiency is
// rule-based so it's stable, fast, and testable.

import type { Brief, ContentAnalysis, Media, Sufficiency } from '../schemas/brief'

/**
 * Spec §12.3 sufficiency rules.
 * Spreads in this app target ~300–800 words of body copy; outside that band
 * we flag the user before generating angles so they can adjust the source.
 */
const evaluateSufficiency = (
  content: ContentAnalysis,
  media: Media[],
): Sufficiency => {
  const notes: string[] = []

  let textVolume: Sufficiency['textVolume']
  if (content.totalWordCount < 120) {
    textVolume = 'too-short'
    notes.push('Текст коротковат — меньше 120 слов; ангелы получатся скудными.')
  } else if (content.totalWordCount > 1500) {
    textVolume = 'too-long-for-spread'
    notes.push('Текст велик для одного разворота — рекомендую серию из 2–3.')
  } else {
    textVolume = 'fits-spread'
  }

  let mediaVariety: Sufficiency['mediaVariety']
  if (media.length === 0) {
    mediaVariety = 'insufficient'
    notes.push('Нет фотографий — будет использован text-driven архетип.')
  } else if (media.length === 1) {
    mediaVariety = 'insufficient'
    notes.push('Одна фотография — рекомендую добавить хотя бы детальный кадр.')
  } else {
    // Monotony check: all images in the same mood category?
    const moods = new Set(media.map((m) => m.semantic.mood))
    const shots = new Set(media.map((m) => m.semantic.shotType))
    if (moods.size === 1 && media.length >= 3) {
      mediaVariety = 'monotone'
      notes.push('Все фото в одной тональности — добавьте контрастный кадр.')
    } else if (shots.size === 1) {
      mediaVariety = 'monotone'
      notes.push('Все фото в одном плане — не хватает крупного/общего контраста.')
    } else {
      mediaVariety = 'enough'
    }
  }

  return { textVolume, mediaVariety, notes }
}

export const composeBrief = (
  content: ContentAnalysis,
  media: Media[],
): Brief => ({
  content,
  media,
  sufficiency: evaluateSufficiency(content, media),
  createdAt: new Date().toISOString(),
})

/** Re-exported for tests and downstream layers. */
export { evaluateSufficiency }
