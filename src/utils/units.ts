import type { Unit } from '@/types/element'

export const DPI = 96
export const MM_PER_INCH = 25.4

const PX_PER_UNIT: Record<Unit, number> = {
  px: 1,
  mm: DPI / MM_PER_INCH,
  in: DPI,
}

export const toPx = (value: number, unit: Unit): number => value * PX_PER_UNIT[unit]
export const fromPx = (px: number, unit: Unit): number => px / PX_PER_UNIT[unit]

export const formatInUnit = (px: number, unit: Unit, digits = 1): string =>
  fromPx(px, unit).toFixed(digits)

export const UNIT_SUFFIX: Record<Unit, string> = { px: 'px', mm: 'mm', in: 'in' }
