export type ElementId = string
export type FontFamily = string
export type Unit = 'mm' | 'px' | 'in'
export type Orientation = 'portrait' | 'landscape'
export type PageSide = 'left' | 'right'

export interface BaseElement {
  id: ElementId
  x: number
  y: number
  width: number
  height: number
  rotate: number
  opacity: number
  locked?: boolean
  hidden?: boolean
  name?: string
  /**
   * Optional id of a group this element belongs to. Groups are
   * logical containers used by the editorial generator to keep
   * a figure (image + caption) or a stack (title + deck) together.
   * Rendering is unaffected; selection layer reads this lazily.
   */
  groupId?: ElementId
}

export interface TextElement extends BaseElement {
  type: 'text'
  content: string
  fontFamily: FontFamily
  fontSize: number
  color: string
  align: 'left' | 'center' | 'right'
  lineHeight: number
  autoWidth: boolean
  fontWeight?: number
  italic?: boolean
  underline?: boolean
  letterSpacing?: number
  /**
   * If set, this text block flows around the referenced image
   * element. The renderer treats `wrapAroundImageId` as a layout
   * hint; in MVP it has no runtime effect (text renders as a
   * normal block), but the editorial compiler emits this so future
   * renderer work can pick it up without another migration.
   */
  wrapAroundImageId?: ElementId
}

export interface ImageElement extends BaseElement {
  type: 'image'
  src: string
  thumb: string
  naturalWidth: number
  naturalHeight: number
  maskId?: string
}

/** Editorial callout quote, styled distinctly from body text. */
export interface PullquoteElement extends BaseElement {
  type: 'pullquote'
  content: string
  attribution?: string
  fontFamily: FontFamily
  fontSize: number
  color: string
  align: 'left' | 'center' | 'right'
  lineHeight: number
  fontWeight?: number
  italic?: boolean
  letterSpacing?: number
  /** 'block' = standalone large quote; 'inline' = thin rule + quote, NYT style. */
  quoteStyle: 'block' | 'inline'
  /** Optional decorative quote marks. */
  showQuoteMarks?: boolean
}

/** Caption tied to an image. */
export interface CaptionElement extends BaseElement {
  type: 'caption'
  content: string
  /** Image this caption belongs to. Optional so captions can be free-floating. */
  imageId?: ElementId
  fontFamily: FontFamily
  fontSize: number
  color: string
  align: 'left' | 'center' | 'right'
  lineHeight: number
  italic?: boolean
  letterSpacing?: number
}

/** Plashka / stamp / badge — short text on a filled background, often rotated. */
export interface StickerElement extends BaseElement {
  type: 'sticker'
  content: string
  fontFamily: FontFamily
  fontSize: number
  color: string
  fontWeight?: number
  italic?: boolean
  letterSpacing?: number
  backgroundColor: string
  borderRadius: number
  paddingX: number
  paddingY: number
  /** Optional border ring (thin outline stamp). */
  borderColor?: string
  borderWidth?: number
}

export type ShapeKind = 'line' | 'rect' | 'arrow' | 'divider'

/** Geometric primitive: line, rect, arrow, or horizontal divider. */
export interface ShapeElement extends BaseElement {
  type: 'shape'
  shape: ShapeKind
  stroke: string
  strokeWidth: number
  /** Only meaningful for 'rect'. Undefined = transparent fill. */
  fill?: string
  /** dashed | solid. */
  dashed?: boolean
}

/**
 * Logical group: a named bag of element ids. Has its own bounding box
 * for hit-testing later; rendering of children is unchanged.
 * Group elements appear in the elements[] array alongside their members
 * so existing flat iteration code keeps working.
 */
export interface GroupElement extends BaseElement {
  type: 'group'
  childIds: ElementId[]
  /** Optional label shown in LayersPanel. */
  label?: string
}

export type SpreadElement =
  | TextElement
  | ImageElement
  | PullquoteElement
  | CaptionElement
  | StickerElement
  | ShapeElement
  | GroupElement

export interface Margins {
  top: number
  right: number
  bottom: number
  left: number
}

export interface PageSettings {
  width: number
  height: number
  margins: Margins
  bleed: number
}

export interface BackgroundSettings {
  type: 'paper' | 'plain' | 'image'
  color?: string
  imageSrc?: string
}

export interface BaselineGrid {
  enabled: boolean
  lineHeight: number
  offset: number
  color: string
}

export interface ColumnGrid {
  enabled: boolean
  columns: number
  gutter: number
  color: string
}

export interface SpreadSchema {
  version: 3
  units: Unit
  orientation: Orientation
  pages: { left: PageSettings; right: PageSettings }
  mirrorPages: boolean
  gutter: number
  background: BackgroundSettings
  showGuides: boolean
  showDpiWarnings: boolean
  baselineGrid: BaselineGrid
  columnGrid: ColumnGrid
  elements: SpreadElement[]
}

export const isText = (el: SpreadElement): el is TextElement => el.type === 'text'
export const isImage = (el: SpreadElement): el is ImageElement => el.type === 'image'
export const isPullquote = (el: SpreadElement): el is PullquoteElement =>
  el.type === 'pullquote'
export const isCaption = (el: SpreadElement): el is CaptionElement => el.type === 'caption'
export const isSticker = (el: SpreadElement): el is StickerElement => el.type === 'sticker'
export const isShape = (el: SpreadElement): el is ShapeElement => el.type === 'shape'
export const isGroup = (el: SpreadElement): el is GroupElement => el.type === 'group'

/**
 * True for any element kind that carries inline text content. The editor's
 * Inspector uses this to decide whether to expose typography controls.
 */
export const isTextBearing = (
  el: SpreadElement,
): el is TextElement | PullquoteElement | CaptionElement | StickerElement =>
  isText(el) || isPullquote(el) || isCaption(el) || isSticker(el)

export interface SpreadRecord {
  id: string
  title: string
  schema: SpreadSchema
  current_version: number
  updated_at: string
  chapter_id?: string | null
  position?: number
}

export interface ChapterRecord {
  id: string
  title: string
  position: number
}

export interface SpreadVersion {
  id: string
  spread_id: string
  version: number
  schema: SpreadSchema
  label: string | null
  created_at: string
}

interface LegacySchemaV1 {
  version: 1
  pageWidth: number
  pageHeight: number
  background: { type: 'paper' | 'plain'; color?: string }
  elements: SpreadElement[]
}

/**
 * v2 schema as it lived before the editorial primitives landed.
 * Only used by the migration; new code should always read v3.
 */
export interface LegacySchemaV2 {
  version: 2
  units: Unit
  orientation: Orientation
  pages: { left: PageSettings; right: PageSettings }
  mirrorPages: boolean
  gutter: number
  background: BackgroundSettings
  showGuides: boolean
  showDpiWarnings?: boolean
  baselineGrid?: BaselineGrid
  columnGrid?: ColumnGrid
  /** v2 only knew text + image, but we keep the wider type for forward-compat. */
  elements: SpreadElement[]
}

export const isLegacyV1 = (s: unknown): s is LegacySchemaV1 =>
  !!s && typeof s === 'object' && 'version' in s && (s as { version: unknown }).version === 1

export const isLegacyV2 = (s: unknown): s is LegacySchemaV2 =>
  !!s && typeof s === 'object' && 'version' in s && (s as { version: unknown }).version === 2
