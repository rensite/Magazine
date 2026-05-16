import type {
  BaselineGrid,
  CaptionElement,
  ColumnGrid,
  GroupElement,
  ImageElement,
  Margins,
  PageSettings,
  PullquoteElement,
  ShapeElement,
  SpreadElement,
  SpreadSchema,
  StickerElement,
  TextElement,
} from '@/types/element'
import { isLegacyV1, isLegacyV2 } from '@/types/element'
import { presetToPx, presetById } from './pagePresets'
import { toPx } from './units'

const uid = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `id_${Math.random().toString(36).slice(2)}_${Date.now().toString(36)}`

export const makeTextElement = (overrides: Partial<TextElement> = {}): TextElement => ({
  id: uid(),
  type: 'text',
  x: 100,
  y: 100,
  width: 320,
  height: 80,
  rotate: 0,
  opacity: 1,
  content: 'Новый текст',
  fontFamily: 'serif',
  fontSize: 24,
  color: '#1a1410',
  align: 'left',
  lineHeight: 1.35,
  autoWidth: true,
  ...overrides,
})

export const makeImageElement = (
  overrides: Partial<ImageElement> &
    Pick<ImageElement, 'src' | 'thumb' | 'naturalWidth' | 'naturalHeight'>,
): ImageElement => {
  const ratio = overrides.naturalWidth / overrides.naturalHeight
  const width = overrides.width ?? 320
  const height = overrides.height ?? width / ratio
  return {
    id: uid(),
    type: 'image',
    x: 120,
    y: 120,
    width,
    height,
    rotate: 0,
    opacity: 1,
    ...overrides,
  }
}

export const makePullquoteElement = (
  overrides: Partial<PullquoteElement> = {},
): PullquoteElement => ({
  id: uid(),
  type: 'pullquote',
  x: 140,
  y: 140,
  width: 480,
  height: 160,
  rotate: 0,
  opacity: 1,
  content: 'Цитата, которая держит разворот.',
  fontFamily: 'serif',
  fontSize: 36,
  color: '#1a1410',
  align: 'left',
  lineHeight: 1.2,
  quoteStyle: 'block',
  showQuoteMarks: true,
  ...overrides,
})

export const makeCaptionElement = (
  overrides: Partial<CaptionElement> = {},
): CaptionElement => ({
  id: uid(),
  type: 'caption',
  x: 120,
  y: 480,
  width: 320,
  height: 32,
  rotate: 0,
  opacity: 1,
  content: 'Подпись к фото.',
  fontFamily: 'sans-serif',
  fontSize: 11,
  color: '#6b6055',
  align: 'left',
  lineHeight: 1.35,
  italic: true,
  ...overrides,
})

export const makeStickerElement = (
  overrides: Partial<StickerElement> = {},
): StickerElement => ({
  id: uid(),
  type: 'sticker',
  x: 200,
  y: 200,
  width: 120,
  height: 40,
  rotate: -6,
  opacity: 1,
  content: 'NEW',
  fontFamily: 'sans-serif',
  fontSize: 14,
  color: '#ffffff',
  fontWeight: 700,
  letterSpacing: 1,
  backgroundColor: '#1a1410',
  borderRadius: 4,
  paddingX: 12,
  paddingY: 6,
  ...overrides,
})

export const makeShapeElement = (
  overrides: Partial<ShapeElement> & Pick<ShapeElement, 'shape'>,
): ShapeElement => ({
  id: uid(),
  type: 'shape',
  x: 100,
  y: 100,
  width: 200,
  height: overrides.shape === 'line' || overrides.shape === 'divider' ? 2 : 80,
  rotate: 0,
  opacity: 1,
  stroke: '#1a1410',
  strokeWidth: 1,
  ...overrides,
})

export const makeGroupElement = (
  overrides: Partial<GroupElement> & Pick<GroupElement, 'childIds'>,
): GroupElement => ({
  id: uid(),
  type: 'group',
  x: 0,
  y: 0,
  width: 0,
  height: 0,
  rotate: 0,
  opacity: 1,
  ...overrides,
})

const defaultMargins = (): Margins => ({
  top: toPx(15, 'mm'),
  right: toPx(15, 'mm'),
  bottom: toPx(15, 'mm'),
  left: toPx(20, 'mm'),
})

const defaultPage = (): PageSettings => {
  const a5 = presetToPx(presetById('a5')!)
  return {
    width: a5.width,
    height: a5.height,
    margins: defaultMargins(),
    bleed: toPx(3, 'mm'),
  }
}

const defaultBaselineGrid = (): BaselineGrid => ({
  enabled: false,
  lineHeight: toPx(4, 'mm'),
  offset: 0,
  color: '#e35353',
})

const defaultColumnGrid = (): ColumnGrid => ({
  enabled: false,
  columns: 6,
  gutter: toPx(4, 'mm'),
  color: '#e35353',
})

export const emptySchema = (): SpreadSchema => ({
  version: 3,
  units: 'mm',
  orientation: 'portrait',
  pages: { left: defaultPage(), right: defaultPage() },
  mirrorPages: true,
  gutter: toPx(10, 'mm'),
  background: { type: 'paper' },
  showGuides: true,
  showDpiWarnings: true,
  baselineGrid: defaultBaselineGrid(),
  columnGrid: defaultColumnGrid(),
  elements: [],
})

export const cloneElement = (el: SpreadElement): SpreadElement => ({
  ...el,
  id: uid(),
  x: el.x + 24,
  y: el.y + 24,
})

/**
 * Migrate any prior schema version to the current one.
 *
 * Versions:
 *   v1: single-page schema (pageWidth / pageHeight) — pre-spread refactor.
 *   v2: dual-page spreads with grids; only text+image kinds.
 *   v3: adds editorial primitives (pullquote, caption, sticker, shape, group)
 *       and optional groupId on BaseElement. Existing v2 elements are
 *       valid v3 elements; the migration is a version bump with no data loss.
 *
 * Strategy: cascade. v1 → v2 → v3. Garbage input returns a fresh empty schema.
 */
export const migrateSchema = (raw: unknown): SpreadSchema => {
  if (isLegacyV1(raw)) {
    const half = Math.round(raw.pageWidth / 2)
    const page: PageSettings = {
      width: half,
      height: raw.pageHeight,
      margins: defaultMargins(),
      bleed: toPx(3, 'mm'),
    }
    return migrateSchema({
      version: 2,
      units: 'mm' as const,
      orientation: 'portrait' as const,
      pages: { left: { ...page }, right: { ...page } },
      mirrorPages: true,
      gutter: 0,
      background: raw.background,
      showGuides: true,
      showDpiWarnings: true,
      baselineGrid: defaultBaselineGrid(),
      columnGrid: defaultColumnGrid(),
      elements: raw.elements,
    })
  }
  if (isLegacyV2(raw)) {
    return {
      version: 3,
      units: raw.units,
      orientation: raw.orientation,
      pages: raw.pages,
      mirrorPages: raw.mirrorPages,
      gutter: raw.gutter,
      background: raw.background,
      showGuides: raw.showGuides,
      showDpiWarnings: raw.showDpiWarnings ?? true,
      baselineGrid: raw.baselineGrid ?? defaultBaselineGrid(),
      columnGrid: raw.columnGrid ?? defaultColumnGrid(),
      elements: raw.elements,
    }
  }
  if (raw && typeof raw === 'object' && (raw as { version?: number }).version === 3) {
    const s = raw as SpreadSchema
    return {
      ...s,
      showDpiWarnings: s.showDpiWarnings ?? true,
      baselineGrid: s.baselineGrid ?? defaultBaselineGrid(),
      columnGrid: s.columnGrid ?? defaultColumnGrid(),
    }
  }
  return emptySchema()
}

export const spreadCanvasSize = (
  schema: SpreadSchema,
): { width: number; height: number } => {
  const { left, right } = schema.pages
  return {
    width: left.width + schema.gutter + right.width,
    height: Math.max(left.height, right.height),
  }
}

export const rightPageX = (schema: SpreadSchema): number =>
  schema.pages.left.width + schema.gutter
