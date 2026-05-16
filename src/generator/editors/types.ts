import type { Brief } from '../schemas/brief'
import type { StoryAngle, EditorArchetypeId } from '../schemas/angle'
import type { EditorLlmOutput, EditorOutput } from '../schemas/editorOutput'

export interface EditorInput {
  brief: Brief
  angle: StoryAngle
  uiLanguage: string
  signal?: AbortSignal
}

export interface EditorArchetype {
  id: EditorArchetypeId
  meta: {
    name: string
    referenceTitles: string[]
    description: string
  }
  defaults: {
    grid: { columns: number; gutter: number; baseline: number }
    typeScale: { base: number; ratio: number }
    typePair: { display: string; text: string }
    palette: { paper: string; ink: string; accents: string[] }
    /** Allowed "violations budget" (rotations, overlaps) on a 0–5 scale. */
    violationsBudget: number
    /** Suggested rhythm. */
    rhythm: 'dense' | 'balanced' | 'spacious'
  }
  /** Build the LLM prompt for this archetype + angle + brief. */
  buildPrompt(input: EditorInput): string
  /** Lightweight post-processing applied to LLM output (deterministic). */
  postProcess?(out: EditorLlmOutput): EditorLlmOutput
}

export type EditorRunResult = EditorOutput
