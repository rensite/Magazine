// Zod schemas for Layer 1 outputs. These are the contract between the LLM
// and downstream pipeline layers. Each schema mirrors the TypeScript
// interface verbatim; zod validates at the LLM boundary and TS protects
// everything downstream.

import { z } from 'zod'

/** OKLCH color tuple — `L` 0..1, `C` 0..0.4-ish, `H` 0..360, optional alpha. */
export const oklchSchema = z.object({
  l: z.number().min(0).max(1),
  c: z.number().min(0).max(0.5),
  h: z.number().min(0).max(360),
  alpha: z.number().min(0).max(1).optional(),
})
export type OklchColor = z.infer<typeof oklchSchema>

/** Per-image technical metadata extracted client-side (no LLM). */
export const mediaTechSchema = z.object({
  width: z.number().positive(),
  height: z.number().positive(),
  aspectRatio: z.number().positive(),
  byteSize: z.number().nonnegative().optional(),
  exifDate: z.string().optional(),
  /** 3–5 dominant colors in OKLCH. */
  palette: z.array(oklchSchema).max(8),
  /** SHA-256 hex hash of the file bytes, for dedup. */
  hash: z.string().optional(),
})
export type MediaTechMeta = z.infer<typeof mediaTechSchema>

/** Per-image semantic analysis from the vision model. */
export const mediaSemanticSchema = z.object({
  shotType: z.enum(['portrait', 'closeup', 'environment', 'detail', 'wide', 'object']),
  subject: z.string().min(1),
  subjectDetail: z.string(),
  focalPoint: z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) }),
  mood: z.enum(['warm', 'cold', 'neutral', 'tense', 'serene', 'energetic']),
  palette: z.array(oklchSchema).max(8).default([]),
  hasFaces: z.boolean(),
  faceCount: z.number().int().nonnegative(),
  faceGazeDirection: z.enum(['left', 'right', 'up', 'down', 'camera']).optional(),
  technicalQuality: z.enum(['high', 'medium', 'low']),
  /** 0..1 — how editorially strong this kadr is. */
  editorialFitness: z.number().min(0).max(1),
  tags: z.array(z.string()).max(20).default([]),
  caption: z.string().default(''),
})
export type MediaSemantic = z.infer<typeof mediaSemanticSchema>

export const mediaSchema = z.object({
  id: z.string(),
  url: z.string(),
  tech: mediaTechSchema,
  semantic: mediaSemanticSchema,
})
export type Media = z.infer<typeof mediaSchema>

/** Output of the text analyst. */
export const contentAnalysisSchema = z.object({
  detectedLanguage: z.string().min(2),
  genre: z.enum([
    'interview',
    'essay',
    'reportage',
    'review',
    'guide',
    'memoir',
    'lyrics',
    'poetry',
    'other',
  ]),
  structure: z.object({
    title: z.string().optional(),
    deck: z.string().optional(),
    sections: z.array(
      z.object({
        id: z.string(),
        heading: z.string().optional(),
        content: z.string(),
        wordCount: z.number().int().nonnegative(),
      }),
    ),
  }),
  tone: z.object({
    primary: z.enum(['warm', 'cool', 'urgent', 'reflective', 'playful', 'serious']),
    secondary: z.string().optional(),
  }),
  candidatePullquotes: z
    .array(
      z.object({
        text: z.string().min(1),
        sourceLocation: z.string(),
        strength: z.number().min(0).max(1),
        reason: z.string(),
      }),
    )
    .max(8)
    .default([]),
  candidateFactboxes: z
    .array(z.object({ fact: z.string(), context: z.string() }))
    .max(8)
    .default([]),
  naturalBreakpoints: z.array(z.number().int().nonnegative()).default([]),
  totalWordCount: z.number().int().nonnegative(),
  keyEntities: z.array(z.string()).max(20).default([]),
  themes: z.array(z.string()).max(8).default([]),
})
export type ContentAnalysis = z.infer<typeof contentAnalysisSchema>

export const sufficiencySchema = z.object({
  textVolume: z.enum(['too-short', 'fits-spread', 'too-long-for-spread']),
  mediaVariety: z.enum(['enough', 'monotone', 'insufficient']),
  notes: z.array(z.string()).default([]),
})
export type Sufficiency = z.infer<typeof sufficiencySchema>

export const briefSchema = z.object({
  content: contentAnalysisSchema,
  media: z.array(mediaSchema),
  sufficiency: sufficiencySchema,
  createdAt: z.string(),
})
export type Brief = z.infer<typeof briefSchema>
