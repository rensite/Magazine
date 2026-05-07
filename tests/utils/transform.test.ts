import { describe, it, expect } from 'vitest'
import { ensureBox, rotatePoint, toCssTransform, toSvgTransform } from '@/utils/transform'

describe('transform', () => {
  it('rotatePoint identity at 0deg', () => {
    const p = rotatePoint({ x: 10, y: 0 }, { x: 0, y: 0 }, 0)
    expect(p.x).toBeCloseTo(10)
    expect(p.y).toBeCloseTo(0)
  })

  it('rotatePoint 90deg around origin', () => {
    const p = rotatePoint({ x: 10, y: 0 }, { x: 0, y: 0 }, 90)
    expect(p.x).toBeCloseTo(0)
    expect(p.y).toBeCloseTo(10)
  })

  it('toCssTransform formats translate+rotate', () => {
    const css = toCssTransform({ x: 10, y: 20, width: 100, height: 50, rotate: 45 })
    expect(css).toBe('translate(10px, 20px) rotate(45deg)')
  })

  it('toSvgTransform rotates around element center', () => {
    const svg = toSvgTransform({ x: 0, y: 0, width: 100, height: 50, rotate: 90 })
    expect(svg).toBe('translate(0 0) rotate(90 50 25)')
  })

  it('ensureBox extracts only geometry fields', () => {
    const box = ensureBox({ x: 1, y: 2, width: 3, height: 4, rotate: 5 })
    expect(box).toEqual({ x: 1, y: 2, width: 3, height: 4, rotate: 5 })
  })
})
