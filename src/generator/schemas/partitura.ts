// Partitura — the intermediate score between an editor's decision and the
// pixel-level SpreadSchema. Layer 4 (compiler) reads partituras and writes
// SpreadSchemas; this layer is where typographic discipline lives.

import { z } from 'zod'
import { editorArchetypeIdSchema } from './angle'

export const zoneRoleSchema = z.enum([
  'masthead',
  'title',
  'deck',
  'body',
  'image-hero',
  'image-detail',
  'pullquote',
  'caption',
  'sidebar',
  'factbox',
  'byline',
  'folio',
])
export type ZoneRole = z.infer<typeof zoneRoleSchema>

export const zoneSchema = z.object({
  id: z.string().min(1),
  role: zoneRoleSchema,
  /** Column span [start, endExclusive], 0-indexed. */
  span: z.object({
    col: z.tuple([z.number().int().nonnegative(), z.number().int().positive()]),
    row: z.tuple([z.number().int().nonnegative(), z.number().int().positive()]),
  }),
  /** Reference to content: section id from ContentAnalysis or media id. */
  contentRef: z.string().min(1),
  treatment: z
    .object({
      bleed: z.boolean().optional(),
      mask: z.string().optional(),
      halftone: z.boolean().optional(),
      tint: z.string().optional(),
    })
    .optional(),
})
export type Zone = z.infer<typeof zoneSchema>

export const accentSchema = z.object({
  id: z.string(),
  kind: z.enum(['pullquote', 'sticker', 'marker', 'stamp', 'divider']),
  /** Loose placement hint; compiler resolves to absolute coords. */
  anchor: z.object({
    col: z.number().nonnegative(),
    row: z.number().nonnegative(),
  }),
  payload: z.record(z.string(), z.unknown()).default({}),
})
export type Accent = z.infer<typeof accentSchema>

export const violationSchema = z.object({
  kind: z.enum(['rotate', 'overlap', 'overflow']),
  /** Stable seed so re-compilation produces the same chaos. */
  seed: z.number(),
  amount: z.number(),
  targetId: z.string(),
})
export type Violation = z.infer<typeof violationSchema>

export const partituraSchema = z.object({
  archetypeId: editorArchetypeIdSchema,
  pageSize: z.object({
    w: z.number().positive(),
    h: z.number().positive(),
    units: z.enum(['mm', 'px']),
  }),
  margins: z.object({
    top: z.number(),
    right: z.number(),
    bottom: z.number(),
    left: z.number(),
  }),
  bleed: z.number().nonnegative().optional(),
  grid: z.object({
    columns: z.number().int().positive(),
    gutter: z.number().nonnegative(),
    baseline: z.number().positive(),
  }),
  typeScale: z.object({
    base: z.number().positive(),
    ratio: z.number().positive(),
  }),
  typePair: z.object({
    display: z.string(),
    text: z.string(),
  }),
  palette: z.object({
    paper: z.string(),
    ink: z.string(),
    accents: z.array(z.string()).max(6),
  }),
  zones: z.array(zoneSchema).min(1),
  accents: z.array(accentSchema).default([]),
  violations: z.array(violationSchema).default([]),
  rhythm: z.enum(['dense', 'balanced', 'spacious']),
})
export type Partitura = z.infer<typeof partituraSchema>
