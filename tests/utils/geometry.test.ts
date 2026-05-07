import { describe, it, expect } from 'vitest'
import { aabb, clamp, resizeBox, snapAngle, MIN_DIM } from '@/utils/geometry'

describe('geometry', () => {
  it('clamp', () => {
    expect(clamp(5, 0, 10)).toBe(5)
    expect(clamp(-1, 0, 10)).toBe(0)
    expect(clamp(11, 0, 10)).toBe(10)
  })

  it('snapAngle snaps within threshold', () => {
    expect(snapAngle(2)).toBe(0)
    expect(snapAngle(46)).toBe(45)
    expect(snapAngle(50)).toBe(50)
    expect(snapAngle(-2)).toBe(0)
  })

  it('aabb of unrotated box', () => {
    const b = aabb({ x: 10, y: 20, width: 100, height: 50, rotate: 0 })
    expect(b.minX).toBeCloseTo(10)
    expect(b.minY).toBeCloseTo(20)
    expect(b.maxX).toBeCloseTo(110)
    expect(b.maxY).toBeCloseTo(70)
  })

  it('resizeBox: SE corner grows', () => {
    const start = { x: 0, y: 0, width: 100, height: 100, rotate: 0 }
    const next = resizeBox(start, 'se', 20, 30)
    expect(next.width).toBe(120)
    expect(next.height).toBe(130)
    expect(next.x).toBe(0)
    expect(next.y).toBe(0)
  })

  it('resizeBox: NW corner shifts origin', () => {
    const start = { x: 50, y: 50, width: 100, height: 100, rotate: 0 }
    const next = resizeBox(start, 'nw', 30, 30)
    expect(next.width).toBe(70)
    expect(next.height).toBe(70)
    expect(next.x).toBe(80)
    expect(next.y).toBe(80)
  })

  it('resizeBox enforces MIN_DIM', () => {
    const start = { x: 0, y: 0, width: 20, height: 20, rotate: 0 }
    const next = resizeBox(start, 'se', -100, -100)
    expect(next.width).toBe(MIN_DIM)
    expect(next.height).toBe(MIN_DIM)
  })

  it('resizeBox preserves ratio when requested', () => {
    const start = { x: 0, y: 0, width: 100, height: 50, rotate: 0 }
    const next = resizeBox(start, 'se', 200, 0, true)
    expect(next.width).toBe(300)
    expect(next.height).toBe(150)
  })
})
