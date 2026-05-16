import { describe, expect, it } from 'vitest'
import { contrastRatio, validate } from '@/generator/layout'
import { aSchema, aText, anImage } from '../../factories'

describe('contrastRatio', () => {
  it('matches WCAG examples', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 1)
    expect(contrastRatio('#777777', '#ffffff')).toBeGreaterThan(4)
    expect(contrastRatio('#aaaaaa', '#bbbbbb')).toBeLessThan(2)
  })
})

describe('validate — contrast', () => {
  it('flags low-contrast text as error', () => {
    const schema = aSchema({
      background: { type: 'plain', color: '#f5efe2' },
      elements: [
        aText({ id: 't1', content: 'A', color: '#e0d8c0', fontSize: 18, width: 200 }),
      ],
    })
    const out = validate(schema, { autoCorrect: false })
    expect(out.ok).toBe(false)
    expect(out.issues.some((i) => i.code === 'contrast-low')).toBe(true)
  })

  it('passes when contrast is high', () => {
    const schema = aSchema({
      background: { type: 'plain', color: '#ffffff' },
      elements: [aText({ id: 't', content: 'A', color: '#000000', fontSize: 18, width: 200 })],
    })
    const out = validate(schema, { autoCorrect: false })
    expect(out.issues.filter((i) => i.code === 'contrast-low')).toHaveLength(0)
  })
})

describe('validate — measure auto-correct', () => {
  it('shrinks font when measure exceeds 90ch and emits autoFixed', () => {
    const schema = aSchema({
      elements: [
        aText({ id: 't', content: 'x'.repeat(200), fontSize: 12, width: 2000, autoWidth: false }),
      ],
    })
    const out = validate(schema, { autoCorrect: true })
    const fixed = out.issues.find((i) => i.code === 'measure-too-long')
    expect(fixed?.autoFixed).toBe(true)
    const el = out.schema.elements[0]
    if (el.type === 'text') expect(el.fontSize).toBeLessThan(12)
  })
})

describe('validate — overflow', () => {
  it('flags elements past the spread edge', () => {
    const schema = aSchema()
    schema.elements = [
      anImage({
        id: 'i',
        x: 5000,
        y: 0,
        width: 100,
        height: 100,
        naturalWidth: 100,
        naturalHeight: 100,
      }),
    ]
    const out = validate(schema)
    expect(out.ok).toBe(false)
    expect(out.issues.some((i) => i.code === 'overflow')).toBe(true)
  })
})

describe('validate — overlap budget', () => {
  it('flags overlap above 15%', () => {
    const schema = aSchema()
    schema.elements = [
      anImage({ id: 'a', x: 0, y: 0, width: 200, height: 200, naturalWidth: 100, naturalHeight: 100 }),
      anImage({ id: 'b', x: 50, y: 50, width: 200, height: 200, naturalWidth: 100, naturalHeight: 100 }),
    ]
    const out = validate(schema)
    expect(out.issues.some((i) => i.code === 'overlap-excess')).toBe(true)
  })
})

describe('validate — DPI', () => {
  it('warns on low-DPI images', () => {
    const schema = aSchema()
    schema.elements = [
      anImage({ id: 'i', x: 0, y: 0, width: 800, height: 600, naturalWidth: 200, naturalHeight: 150 }),
    ]
    const out = validate(schema)
    expect(out.issues.some((i) => i.code === 'dpi-low')).toBe(true)
  })

  it('does not warn when showDpiWarnings is false', () => {
    const schema = aSchema({ showDpiWarnings: false })
    schema.elements = [
      anImage({ id: 'i', x: 0, y: 0, width: 800, height: 600, naturalWidth: 200, naturalHeight: 150 }),
    ]
    const out = validate(schema)
    expect(out.issues.some((i) => i.code === 'dpi-low')).toBe(false)
  })
})

describe('validate — hierarchy', () => {
  it('flags caption being larger than body', () => {
    const schema = aSchema({
      elements: [
        aText({ name: 'title', content: 'T', fontSize: 24, width: 400, autoWidth: false }),
        aText({ name: 'body', content: 'B', fontSize: 10, width: 400, autoWidth: false }),
        aText({ name: 'caption', content: 'C', fontSize: 16, width: 400, autoWidth: false }),
      ],
    })
    const out = validate(schema)
    expect(out.issues.some((i) => i.code === 'hierarchy-non-monotonic')).toBe(true)
  })
})
