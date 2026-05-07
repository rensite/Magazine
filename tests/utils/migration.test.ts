import { describe, it, expect } from 'vitest'
import { migrateSchema, spreadCanvasSize, rightPageX } from '@/utils/elementFactory'

describe('migrateSchema', () => {
  it('converts v1 to v2 splitting page in half', () => {
    const v1 = {
      version: 1,
      pageWidth: 1000,
      pageHeight: 1414,
      background: { type: 'paper' as const },
      elements: [],
    }
    const v2 = migrateSchema(v1)
    expect(v2.version).toBe(2)
    expect(v2.pages.left.width).toBe(500)
    expect(v2.pages.right.width).toBe(500)
    expect(v2.pages.left.height).toBe(1414)
    expect(v2.gutter).toBe(0)
    expect(v2.mirrorPages).toBe(true)
  })

  it('passes v2 schema through unchanged', () => {
    const v2In = migrateSchema({
      version: 1,
      pageWidth: 800,
      pageHeight: 600,
      background: { type: 'paper' as const },
      elements: [],
    })
    const v2Again = migrateSchema(v2In)
    expect(v2Again).toBe(v2In)
  })

  it('falls back to empty schema for garbage input', () => {
    const result = migrateSchema(null)
    expect(result.version).toBe(2)
    expect(result.elements).toEqual([])
  })
})

describe('spreadCanvasSize / rightPageX', () => {
  it('canvas width = left + gutter + right', () => {
    const schema = migrateSchema({
      version: 1,
      pageWidth: 200,
      pageHeight: 300,
      background: { type: 'paper' as const },
      elements: [],
    })
    schema.gutter = 20
    schema.pages.left.width = 100
    schema.pages.right.width = 110
    expect(spreadCanvasSize(schema).width).toBe(230)
    expect(rightPageX(schema)).toBe(120)
  })
})
