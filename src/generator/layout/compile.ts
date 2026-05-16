// Layer 4: Layout Compiler. Partitura → SpreadSchema v3.
//
// The compiler is deterministic given a (partitura, seed) pair. It:
//   1. Computes a fresh SpreadSchema scaffold (page sizes, margins, grids).
//   2. Resolves each Partitura zone to absolute pixel coordinates using the
//      column grid, then materializes the appropriate v3 element kind for
//      that zone's role.
//   3. Materializes accents (pullquote/sticker/divider) as their kinds.
//   4. Applies controlled violations (small rotations, edge overlaps) per
//      the archetype's budget, seeded by the partitura's identity so reruns
//      reproduce the same chaos.
//
// The output is a SpreadSchema that any other code in the editor can render.

import type {
  CaptionElement,
  ImageElement,
  PullquoteElement,
  ShapeElement,
  SpreadElement,
  SpreadSchema,
  StickerElement,
  TextElement,
} from '@/types/element'
import { emptySchema } from '@/utils/elementFactory'
import { toPx } from '@/utils/units'
import type { Brief } from '../schemas/brief'
import type { EditorOutput } from '../schemas/editorOutput'
import type { Partitura, Zone, ZoneRole, Accent } from '../schemas/partitura'
import { hashString, mulberry32 } from './seed'

const uid = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `id_${Math.random().toString(36).slice(2)}`

interface ColumnGrid {
  pageWidth: number
  marginLeft: number
  marginRight: number
  columns: number
  gutter: number
  columnWidth: number
}

const buildColumnGrid = (p: Partitura, pageWidthPx: number): ColumnGrid => {
  const u = p.pageSize.units
  const mLeft = u === 'mm' ? toPx(p.margins.left, 'mm') : p.margins.left
  const mRight = u === 'mm' ? toPx(p.margins.right, 'mm') : p.margins.right
  const live = pageWidthPx - mLeft - mRight
  const totalGutter = p.grid.gutter * (p.grid.columns - 1)
  const columnWidth = (live - totalGutter) / p.grid.columns
  return {
    pageWidth: pageWidthPx,
    marginLeft: mLeft,
    marginRight: mRight,
    columns: p.grid.columns,
    gutter: p.grid.gutter,
    columnWidth,
  }
}

/** Internal alias kept for clarity. `units` lives inside `pageSize`. */
type CompilerPartitura = Partitura

interface ResolvedBox {
  x: number
  y: number
  width: number
  height: number
}

/**
 * Map a zone's (col, row) span to pixel coordinates. Rows are computed
 * relative to a uniform baseline-rhythm: each row = baseline * 4 (rough
 * 1U cell ≈ four baselines). This is the only place we approximate; a
 * full editorial typographer would tune row height per archetype, but
 * 4 baselines per row keeps things readable across all three.
 */
const resolveBox = (
  zone: Zone,
  grid: ColumnGrid,
  baseline: number,
  marginTop: number,
): ResolvedBox => {
  const [c0, c1] = zone.span.col
  const [r0, r1] = zone.span.row
  const colSpan = Math.max(1, c1 - c0)
  const x = grid.marginLeft + c0 * (grid.columnWidth + grid.gutter)
  const width = colSpan * grid.columnWidth + (colSpan - 1) * grid.gutter
  const rowUnit = baseline * 4
  const y = marginTop + r0 * rowUnit
  const height = Math.max(rowUnit, (r1 - r0) * rowUnit)
  return { x, y, width, height }
}

/** Lookup body content for a contentRef from the brief. */
const resolveText = (contentRef: string, brief: Brief, used: Set<string>): string => {
  const section = brief.content.structure.sections.find((s) => s.id === contentRef)
  if (section) {
    used.add(contentRef)
    return section.content
  }
  return ''
}

const resolveMedia = (contentRef: string, brief: Brief): Brief['media'][number] | undefined =>
  brief.media.find((m) => m.id === contentRef)

/** Pick fontSize per role using the archetype's typeScale. */
const sizeForRole = (role: ZoneRole, base: number, ratio: number): number => {
  switch (role) {
    case 'masthead':
      return Math.round(base * Math.pow(ratio, 5))
    case 'title':
      return Math.round(base * Math.pow(ratio, 4))
    case 'deck':
      return Math.round(base * Math.pow(ratio, 2))
    case 'byline':
      return Math.round(base * Math.pow(ratio, -1))
    case 'folio':
      return Math.round(base * Math.pow(ratio, -1))
    case 'pullquote':
      return Math.round(base * Math.pow(ratio, 2))
    case 'caption':
      return Math.round(base * Math.pow(ratio, -1))
    case 'sidebar':
    case 'factbox':
      return Math.round(base * Math.pow(ratio, -0.5))
    case 'body':
    default:
      return Math.round(base)
  }
}

const weightForRole = (role: ZoneRole): number => {
  switch (role) {
    case 'masthead':
      return 800
    case 'title':
      return 600
    case 'deck':
      return 500
    case 'byline':
      return 500
    case 'pullquote':
      return 500
    default:
      return 400
  }
}

const buildElementForZone = (
  zone: Zone,
  partitura: Partitura,
  brief: Brief,
  box: ResolvedBox,
  pageOffsetX: number,
  usedSections: Set<string>,
): SpreadElement | null => {
  const x = pageOffsetX + box.x
  const y = box.y
  const fontSize = sizeForRole(zone.role, partitura.typeScale.base, partitura.typeScale.ratio)
  const lineHeight = zone.role === 'body' ? 1.5 : 1.2
  const fontFamily =
    zone.role === 'body' || zone.role === 'caption' || zone.role === 'sidebar'
      ? partitura.typePair.text
      : partitura.typePair.display
  const baseFields = {
    id: uid(),
    x,
    y,
    width: box.width,
    height: box.height,
    rotate: 0,
    opacity: 1,
    name: zone.role,
  } as const

  switch (zone.role) {
    case 'image-hero':
    case 'image-detail': {
      const media = resolveMedia(zone.contentRef, brief)
      if (!media) return null
      const el: ImageElement = {
        ...baseFields,
        type: 'image',
        src: media.url,
        thumb: media.url,
        naturalWidth: media.tech.width,
        naturalHeight: media.tech.height,
      }
      return el
    }
    case 'pullquote': {
      const content = resolveText(zone.contentRef, brief, usedSections)
      const el: PullquoteElement = {
        ...baseFields,
        type: 'pullquote',
        content: content.slice(0, 280) || 'Pullquote',
        fontFamily,
        fontSize,
        color: partitura.palette.ink,
        align: 'left',
        lineHeight,
        fontWeight: weightForRole('pullquote'),
        quoteStyle: 'block',
        showQuoteMarks: true,
      }
      return el
    }
    case 'caption': {
      const content = resolveText(zone.contentRef, brief, usedSections)
      const el: CaptionElement = {
        ...baseFields,
        type: 'caption',
        content: content.slice(0, 200) || 'Caption',
        fontFamily,
        fontSize,
        color: partitura.palette.ink,
        align: 'left',
        lineHeight,
        italic: true,
      }
      return el
    }
    case 'masthead':
    case 'title':
    case 'deck':
    case 'body':
    case 'byline':
    case 'folio':
    case 'sidebar':
    case 'factbox': {
      const content = resolveText(zone.contentRef, brief, usedSections)
      const el: TextElement = {
        ...baseFields,
        type: 'text',
        content: content || zone.role,
        fontFamily,
        fontSize,
        color: partitura.palette.ink,
        align: 'left',
        lineHeight,
        autoWidth: false,
        fontWeight: weightForRole(zone.role),
      }
      return el
    }
    default:
      return null
  }
}

const buildAccent = (
  accent: Accent,
  partitura: Partitura,
  grid: ColumnGrid,
  pageOffsetX: number,
  marginTop: number,
): SpreadElement | null => {
  const baseline = partitura.grid.baseline
  const x = pageOffsetX + grid.marginLeft + accent.anchor.col * (grid.columnWidth + grid.gutter)
  const y = marginTop + accent.anchor.row * baseline * 4
  const baseFields = {
    id: uid(),
    x,
    y,
    rotate: 0,
    opacity: 1,
  } as const

  switch (accent.kind) {
    case 'pullquote': {
      const text =
        typeof accent.payload.content === 'string' ? (accent.payload.content as string) : 'Цитата'
      const el: PullquoteElement = {
        ...baseFields,
        type: 'pullquote',
        width: grid.columnWidth * 3 + grid.gutter * 2,
        height: 120,
        content: text,
        fontFamily: partitura.typePair.display,
        fontSize: sizeForRole('pullquote', partitura.typeScale.base, partitura.typeScale.ratio),
        color: partitura.palette.ink,
        align: 'left',
        lineHeight: 1.2,
        quoteStyle: 'block',
        showQuoteMarks: true,
      }
      return el
    }
    case 'sticker':
    case 'stamp':
    case 'marker': {
      const text =
        typeof accent.payload.content === 'string' ? (accent.payload.content as string) : 'NEW'
      const el: StickerElement = {
        ...baseFields,
        type: 'sticker',
        width: 80,
        height: 32,
        content: text,
        fontFamily: partitura.typePair.text,
        fontSize: partitura.typeScale.base * 0.9,
        color: partitura.palette.paper,
        fontWeight: 700,
        backgroundColor: partitura.palette.accents[0] ?? partitura.palette.ink,
        borderRadius: accent.kind === 'stamp' ? 0 : 4,
        paddingX: 12,
        paddingY: 6,
      }
      return el
    }
    case 'divider': {
      const el: ShapeElement = {
        ...baseFields,
        type: 'shape',
        width: grid.columnWidth * 2,
        height: 2,
        shape: 'divider',
        stroke: partitura.palette.accents[0] ?? partitura.palette.ink,
        strokeWidth: 1,
      }
      return el
    }
    default:
      return null
  }
}

const applyViolations = (
  partitura: Partitura,
  elements: SpreadElement[],
  seedKey: string,
): void => {
  if (partitura.violations.length === 0) return
  const rng = mulberry32(hashString(seedKey))
  for (const v of partitura.violations) {
    const target = elements.find((e) => e.name === v.targetId || e.id === v.targetId)
    if (!target) continue
    switch (v.kind) {
      case 'rotate':
        target.rotate = Math.max(-7, Math.min(7, v.amount || (rng() * 6 - 3)))
        break
      case 'overlap':
        // Nudge target by a small fraction of its own width; visible but
        // never more than 15% per spec §10.2.
        target.x += target.width * Math.max(-0.15, Math.min(0.15, v.amount || (rng() * 0.2 - 0.1)))
        break
      case 'overflow':
        // Slightly extend the element past its column. Capped to prevent
        // off-page disasters.
        target.width *= 1 + Math.min(0.1, Math.max(0, v.amount || 0.05))
        break
    }
  }
}

export interface CompileOptions {
  brief: Brief
  output: EditorOutput
  /** Optional override of the seed; default = stable hash of the partitura. */
  seed?: string
}

/** Compile an EditorOutput into a SpreadSchema v3. */
export const compile = ({ brief, output, seed }: CompileOptions): SpreadSchema => {
  const partitura = output.partitura as CompilerPartitura
  const schema = emptySchema()
  // Apply page size from the partitura.
  const pageWidthMm = partitura.pageSize.w / 2
  const pageHeightMm = partitura.pageSize.h
  const pageWidthPx =
    partitura.pageSize.units === 'mm' ? toPx(pageWidthMm, 'mm') : pageWidthMm
  const pageHeightPx =
    partitura.pageSize.units === 'mm' ? toPx(pageHeightMm, 'mm') : pageHeightMm
  schema.units = 'mm'
  schema.pages.left.width = pageWidthPx
  schema.pages.right.width = pageWidthPx
  schema.pages.left.height = pageHeightPx
  schema.pages.right.height = pageHeightPx
  const mTop = toPx(partitura.margins.top, partitura.pageSize.units)
  const mBottom = toPx(partitura.margins.bottom, partitura.pageSize.units)
  const mLeft = toPx(partitura.margins.left, partitura.pageSize.units)
  const mRight = toPx(partitura.margins.right, partitura.pageSize.units)
  schema.pages.left.margins = { top: mTop, right: mRight, bottom: mBottom, left: mLeft }
  schema.pages.right.margins = { top: mTop, right: mRight, bottom: mBottom, left: mLeft }
  if (partitura.bleed) {
    const bleedPx = toPx(partitura.bleed, partitura.pageSize.units)
    schema.pages.left.bleed = bleedPx
    schema.pages.right.bleed = bleedPx
  }
  schema.background = { type: 'plain', color: partitura.palette.paper }
  schema.columnGrid = {
    enabled: false,
    columns: partitura.grid.columns,
    gutter: partitura.grid.gutter,
    color: '#e35353',
  }
  schema.baselineGrid = {
    enabled: false,
    lineHeight: partitura.grid.baseline,
    offset: 0,
    color: '#e35353',
  }

  const grid = buildColumnGrid(partitura, pageWidthPx)
  const usedSections = new Set<string>()
  const elements: SpreadElement[] = []

  // Pages: zones with col < columns/2 go on the left page; col >= columns/2 → right.
  // For spreads we treat the partitura as targeting the FULL spread width
  // (columns = the merged grid), but most archetypes specify per-page columns.
  // To stay simple in MVP we put everything on the left page coordinate space
  // and let the right page be a mirror that the user can manually pull from.
  // A later refinement: split zones by column-half automatically.
  for (const zone of partitura.zones) {
    const box = resolveBox(zone, grid, partitura.grid.baseline, mTop)
    const el = buildElementForZone(zone, partitura, brief, box, 0, usedSections)
    if (el) {
      el.name = zone.id
      elements.push(el)
    }
  }
  for (const accent of partitura.accents) {
    const el = buildAccent(accent, partitura, grid, 0, mTop)
    if (el) {
      // Stamp the accent id onto `name` so violations targeting accents
      // can find the rendered element (mirrors the convention used for
      // zone elements above).
      el.name = accent.id
      elements.push(el)
    }
  }

  // Stable seed: hash the partitura id-string set + archetype.
  const seedKey = seed ?? `${partitura.archetypeId}/${partitura.zones.map((z) => z.id).join(',')}`
  applyViolations(partitura, elements, seedKey)

  schema.elements = elements
  return schema
}
