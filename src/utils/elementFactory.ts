import type {
  ImageElement,
  Margins,
  PageSettings,
  SpreadElement,
  SpreadSchema,
  TextElement,
} from '@/types/element'
import { isLegacyV1 } from '@/types/element'
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

export const emptySchema = (): SpreadSchema => ({
  version: 2,
  units: 'mm',
  orientation: 'portrait',
  pages: { left: defaultPage(), right: defaultPage() },
  mirrorPages: true,
  gutter: toPx(10, 'mm'),
  background: { type: 'paper' },
  showGuides: true,
  elements: [],
})

export const cloneElement = (el: SpreadElement): SpreadElement => ({
  ...el,
  id: uid(),
  x: el.x + 24,
  y: el.y + 24,
})

export const migrateSchema = (raw: unknown): SpreadSchema => {
  if (isLegacyV1(raw)) {
    const half = Math.round(raw.pageWidth / 2)
    const page: PageSettings = {
      width: half,
      height: raw.pageHeight,
      margins: defaultMargins(),
      bleed: toPx(3, 'mm'),
    }
    return {
      version: 2,
      units: 'mm',
      orientation: 'portrait',
      pages: { left: { ...page }, right: { ...page } },
      mirrorPages: true,
      gutter: 0,
      background: raw.background,
      showGuides: true,
      elements: raw.elements,
    }
  }
  if (raw && typeof raw === 'object' && (raw as { version?: number }).version === 2) {
    return raw as SpreadSchema
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
