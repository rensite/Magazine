import { describe, it, expect } from 'vitest'
import { parseCommand } from '@/voice/parser'
import { makeTextElement, makeImageElement } from '@/utils/elementFactory'

const txt = makeTextElement({ x: 100, y: 100 })
const img = makeImageElement({
  src: 'x', thumb: 'x', naturalWidth: 800, naturalHeight: 600,
})

describe('parseCommand', () => {
  it('combines size + color + weight + family', () => {
    const r = parseCommand('шрифт 14 цвет красный жирный sans', { selected: txt })
    expect(r.patch).toMatchObject({
      fontSize: 14,
      color: '#dc2626',
      fontWeight: 700,
      fontFamily: 'Inter',
    })
    expect(r.unknown).toEqual([])
  })

  it('accepts spelled-out numbers', () => {
    const r = parseCommand('размер двадцать четыре', { selected: txt })
    expect(r.patch.fontSize).toBe(24)
  })

  it('color case forms via stem prefix', () => {
    const a = parseCommand('красным', { selected: txt })
    const b = parseCommand('цвет тёмно-синий', { selected: txt })
    expect(a.patch.color).toBe('#dc2626')
    expect(b.patch.color).toBe('#1e3a8a')
  })

  it('hex literal', () => {
    const r = parseCommand('#abcdef', { selected: txt })
    expect(r.patch.color).toBe('#abcdef')
  })

  it('italic + underline + align', () => {
    const r = parseCommand('курсив подчёркнутый по центру', { selected: txt })
    expect(r.patch).toMatchObject({ italic: true, underline: true, align: 'center' })
  })

  it('alignment is ignored for non-text', () => {
    const r = parseCommand('по центру', { selected: img })
    expect(r.patch.align).toBeUndefined()
  })

  it('opacity in percent', () => {
    const r = parseCommand('прозрачность 40', { selected: txt })
    expect(r.patch.opacity).toBeCloseTo(0.4)
  })

  it('rotate angle', () => {
    const r = parseCommand('поверни на 15', { selected: txt })
    expect(r.patch.rotate).toBe(15)
  })

  it('shift element', () => {
    const r = parseCommand('сдвинь вправо на 30', { selected: txt })
    expect(r.patch.x).toBe(130)
  })

  it('actions: delete + undo + duplicate', () => {
    const r = parseCommand('продублируй и удали', { selected: txt })
    expect(r.actions).toContain('duplicate')
    expect(r.actions).toContain('delete')
  })

  it('unknown tokens collected', () => {
    const r = parseCommand('шрифт 14 бла-бла-бла', { selected: txt })
    expect(r.patch.fontSize).toBe(14)
    expect(r.unknown.length).toBeGreaterThan(0)
  })

  it('multi-word font name', () => {
    const r = parseCommand('ibm plex sans', { selected: txt })
    expect(r.patch.fontFamily).toBe('IBM Plex Sans')
  })

  it('bare number is fontSize for text', () => {
    const r = parseCommand('14 красный жирный sans', { selected: txt })
    expect(r.patch).toMatchObject({
      fontSize: 14,
      color: '#dc2626',
      fontWeight: 700,
      fontFamily: 'Inter',
    })
  })

  it('spelled-out bare number for text', () => {
    const r = parseCommand('двадцать четыре', { selected: txt })
    expect(r.patch.fontSize).toBe(24)
  })

  it('bare number does NOT apply to image', () => {
    const r = parseCommand('14', { selected: img })
    expect(r.patch.fontSize).toBeUndefined()
    expect(r.unknown).toContain('14')
  })

  it('explicit trigger still wins over bare-number heuristic', () => {
    const r = parseCommand('размер 18 24 красный', { selected: txt })
    // First number consumed by "размер", second left as unknown
    // (we only auto-fill fontSize once).
    expect(r.patch.fontSize).toBe(18)
    expect(r.patch.color).toBe('#dc2626')
  })
})
