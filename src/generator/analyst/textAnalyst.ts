// Text analyst: raw lon-form text → ContentAnalysis via Claude.

import { aiCall } from '@/ai'
import { contentAnalysisSchema, type ContentAnalysis } from '../schemas/brief'

const SYSTEM = `You are an editorial editor analyzing source material for a magazine spread. Return STRICT JSON matching the requested schema. Quote the source verbatim when extracting pullquotes — do NOT paraphrase.`

const buildPrompt = (rawText: string, uiLanguage = 'ru'): string => {
  const wordCount = rawText.trim().split(/\s+/).filter(Boolean).length
  return `Analyze this raw text for an editorial spread. Total length: ${wordCount} words.

Source:
"""
${rawText.slice(0, 12000)}
"""
${rawText.length > 12000 ? `(Truncated at 12 000 chars. Total: ${rawText.length} chars.)` : ''}

Return a JSON object with these fields:
- detectedLanguage: ISO-639-1 code of the dominant language (ru, en, etc.)
- genre: one of interview | essay | reportage | review | guide | memoir | lyrics | poetry | other
- structure:
  - title: best title candidate if obvious, else omit
  - deck: 1-line subtitle / kicker if applicable, else omit
  - sections: array of { id (unique slug), heading (optional), content (verbatim), wordCount }
    — split at natural paragraph or heading breaks; preserve original wording
- tone: { primary: warm|cool|urgent|reflective|playful|serious, secondary: optional descriptor }
- candidatePullquotes: up to 6 strong quotable sentences pulled verbatim from the text
  — { text, sourceLocation: section id, strength 0..1, reason: why it works as a pullquote }
- candidateFactboxes: up to 4 standalone facts that could be a sidebar { fact, context }
- naturalBreakpoints: indices into sections[] where a column / spread split would feel natural
- totalWordCount: integer
- keyEntities: up to 10 named people / places / brands
- themes: 3–5 thematic phrases the material is about

UI language for any user-facing captions you produce: ${uiLanguage}.

DO NOT invent material. DO NOT paraphrase quotes. If the source is too short for a field, omit it or use an empty array.`
}

export const analyzeText = async (
  rawText: string,
  uiLanguage = 'ru',
  signal?: AbortSignal,
): Promise<ContentAnalysis> => {
  if (!rawText.trim()) {
    // Don't pay a model call for empty input — return a stub the brief
    // composer can still emit a "too-short" sufficiency note from.
    return {
      detectedLanguage: uiLanguage,
      genre: 'other',
      structure: { sections: [] },
      tone: { primary: 'reflective' },
      candidatePullquotes: [],
      candidateFactboxes: [],
      naturalBreakpoints: [],
      totalWordCount: 0,
      keyEntities: [],
      themes: [],
    }
  }
  const { data } = await aiCall(buildPrompt(rawText, uiLanguage), {
    task: 'analyst',
    system: SYSTEM,
    schema: contentAnalysisSchema,
    temperature: 0.3,
    promptVersion: 'analyst/v1',
    signal,
  })
  return data
}
