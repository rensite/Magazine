export type ElementId = string
export type FontFamily = 'mono' | 'serif' | 'hand'
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
}

export interface ImageElement extends BaseElement {
  type: 'image'
  src: string
  thumb: string
  naturalWidth: number
  naturalHeight: number
  maskId?: string
}

export type SpreadElement = TextElement | ImageElement

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

export interface SpreadSchema {
  version: 2
  units: Unit
  orientation: Orientation
  pages: { left: PageSettings; right: PageSettings }
  mirrorPages: boolean
  gutter: number
  background: BackgroundSettings
  showGuides: boolean
  elements: SpreadElement[]
}

export const isText = (el: SpreadElement): el is TextElement => el.type === 'text'
export const isImage = (el: SpreadElement): el is ImageElement => el.type === 'image'

export interface SpreadRecord {
  id: string
  title: string
  schema: SpreadSchema
  current_version: number
  updated_at: string
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

export const isLegacyV1 = (s: unknown): s is LegacySchemaV1 =>
  !!s && typeof s === 'object' && 'version' in s && (s as { version: unknown }).version === 1
