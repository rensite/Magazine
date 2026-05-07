import { describe, it, expect } from 'vitest'
import { fromPx, toPx } from '@/utils/units'

describe('units', () => {
  it('mm <-> px round trip', () => {
    const px = toPx(210, 'mm')
    expect(fromPx(px, 'mm')).toBeCloseTo(210)
  })

  it('A4 width 210mm = 793.7 px @96dpi', () => {
    expect(toPx(210, 'mm')).toBeCloseTo(793.7, 1)
  })

  it('1 inch = 96 px', () => {
    expect(toPx(1, 'in')).toBe(96)
  })

  it('px is identity', () => {
    expect(toPx(123, 'px')).toBe(123)
    expect(fromPx(123, 'px')).toBe(123)
  })
})
