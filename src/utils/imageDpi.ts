import type { ImageElement } from '@/types/element'
import { fromPx } from './units'

export const DPI_WARNING_THRESHOLD = 200
export const DPI_OK_THRESHOLD = 300

export const imageEffectiveDpi = (el: ImageElement): number => {
  const widthInches = fromPx(el.width, 'in')
  const heightInches = fromPx(el.height, 'in')
  if (widthInches <= 0 || heightInches <= 0) return Infinity
  const dpiX = el.naturalWidth / widthInches
  const dpiY = el.naturalHeight / heightInches
  return Math.min(dpiX, dpiY)
}

export type DpiQuality = 'ok' | 'low' | 'critical'

export const dpiQuality = (dpi: number): DpiQuality => {
  if (dpi >= DPI_OK_THRESHOLD) return 'ok'
  if (dpi >= DPI_WARNING_THRESHOLD) return 'low'
  return 'critical'
}
