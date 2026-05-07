import { toPx } from './units'

export interface PagePreset {
  id: string
  label: string
  widthMm: number
  heightMm: number
}

export const PAGE_PRESETS: PagePreset[] = [
  { id: 'a3', label: 'A3', widthMm: 297, heightMm: 420 },
  { id: 'a4', label: 'A4', widthMm: 210, heightMm: 297 },
  { id: 'a5', label: 'A5', widthMm: 148, heightMm: 210 },
  { id: 'a6', label: 'A6', widthMm: 105, heightMm: 148 },
  { id: 'b5', label: 'B5', widthMm: 176, heightMm: 250 },
  { id: 'letter', label: 'US Letter', widthMm: 215.9, heightMm: 279.4 },
  { id: 'square-200', label: 'Square 200mm', widthMm: 200, heightMm: 200 },
  { id: 'square-150', label: 'Square 150mm', widthMm: 150, heightMm: 150 },
]

export const presetById = (id: string): PagePreset | null =>
  PAGE_PRESETS.find((p) => p.id === id) ?? null

export const presetToPx = (preset: PagePreset): { width: number; height: number } => ({
  width: toPx(preset.widthMm, 'mm'),
  height: toPx(preset.heightMm, 'mm'),
})

export const matchPreset = (widthPx: number, heightPx: number): PagePreset | null => {
  const wMm = widthPx / (96 / 25.4)
  const hMm = heightPx / (96 / 25.4)
  return (
    PAGE_PRESETS.find(
      (p) =>
        (Math.abs(p.widthMm - wMm) < 0.5 && Math.abs(p.heightMm - hMm) < 0.5) ||
        (Math.abs(p.widthMm - hMm) < 0.5 && Math.abs(p.heightMm - wMm) < 0.5),
    ) ?? null
  )
}
