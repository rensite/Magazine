import { describe, it, expect } from 'vitest'
import { migrateSchema, spreadCanvasSize, rightPageX } from '@/utils/elementFactory'

describe('migrateSchema', () => {
  it('converts v1 to current (v3) splitting page in half', () => {
    const v1 = {
      version: 1,
      pageWidth: 1000,
      pageHeight: 1414,
      background: { type: 'paper' as const },
      elements: [],
    }
    const out = migrateSchema(v1)
    expect(out.version).toBe(3)
    expect(out.pages.left.width).toBe(500)
    expect(out.pages.right.width).toBe(500)
    expect(out.pages.left.height).toBe(1414)
    expect(out.gutter).toBe(0)
    expect(out.mirrorPages).toBe(true)
    // v1 → v2 → v3 chain must populate grids defensively.
    expect(out.baselineGrid).toBeDefined()
    expect(out.columnGrid).toBeDefined()
    expect(out.showDpiWarnings).toBe(true)
  })

  it('upgrades v2 (without grids) to v3 with grid defaults', () => {
    const v2 = {
      version: 2,
      units: 'mm' as const,
      orientation: 'portrait' as const,
      pages: {
        left: { width: 400, height: 600, margins: { top: 10, right: 10, bottom: 10, left: 10 }, bleed: 3 },
        right: { width: 400, height: 600, margins: { top: 10, right: 10, bottom: 10, left: 10 }, bleed: 3 },
      },
      mirrorPages: true,
      gutter: 20,
      background: { type: 'paper' as const },
      showGuides: true,
      elements: [],
    }
    const out = migrateSchema(v2)
    expect(out.version).toBe(3)
    expect(out.gutter).toBe(20)
    expect(out.baselineGrid).toBeDefined()
    expect(out.columnGrid).toBeDefined()
    expect(out.showDpiWarnings).toBe(true)
  })

  it('preserves elements through v1 → v2 → v3 chain', () => {
    const v1 = {
      version: 1,
      pageWidth: 800,
      pageHeight: 600,
      background: { type: 'paper' as const },
      elements: [
        {
          id: 'e1',
          type: 'text',
          x: 0,
          y: 0,
          width: 100,
          height: 20,
          rotate: 0,
          opacity: 1,
          content: 'hi',
          fontFamily: 'serif',
          fontSize: 12,
          color: '#000',
          align: 'left',
          lineHeight: 1.2,
          autoWidth: false,
        },
      ],
    }
    // intermediate explicit v2 → v3 hop also exercised
    const out = migrateSchema(v1)
    expect(out.version).toBe(3)
    expect(out.elements).toHaveLength(1)
    expect(out.elements[0].id).toBe('e1')
  })

  it('passes v3 schema through, filling missing optional grids', () => {
    const v3In = migrateSchema({
      version: 1,
      pageWidth: 800,
      pageHeight: 600,
      background: { type: 'paper' as const },
      elements: [],
    })
    const v3Again = migrateSchema(v3In)
    expect(v3Again.version).toBe(3)
    expect(v3Again).toStrictEqual(v3In)
  })

  it('falls back to empty v3 schema for garbage input', () => {
    const result = migrateSchema(null)
    expect(result.version).toBe(3)
    expect(result.elements).toEqual([])
  })

  it('falls back to empty for unknown future version', () => {
    const result = migrateSchema({ version: 99, weird: true })
    expect(result.version).toBe(3)
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
