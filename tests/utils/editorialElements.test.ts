import { describe, it, expect } from 'vitest'
import {
  makeCaptionElement,
  makeGroupElement,
  makePullquoteElement,
  makeShapeElement,
  makeStickerElement,
  makeTextElement,
  emptySchema,
} from '@/utils/elementFactory'
import {
  isCaption,
  isGroup,
  isPullquote,
  isShape,
  isSticker,
  isText,
  isTextBearing,
  type SpreadElement,
} from '@/types/element'

describe('emptySchema', () => {
  it('is v3 with grids and empty elements', () => {
    const s = emptySchema()
    expect(s.version).toBe(3)
    expect(s.elements).toEqual([])
    expect(s.baselineGrid).toBeDefined()
    expect(s.columnGrid).toBeDefined()
  })
})

describe('editorial element factories', () => {
  it('makePullquoteElement returns a valid pullquote and is type-guarded', () => {
    const q = makePullquoteElement()
    expect(q.type).toBe('pullquote')
    expect(q.content.length).toBeGreaterThan(0)
    expect(q.quoteStyle).toBe('block')
    expect(isPullquote(q)).toBe(true)
    expect(isText(q as unknown as SpreadElement)).toBe(false)
  })

  it('makePullquoteElement honors overrides', () => {
    const q = makePullquoteElement({
      content: 'Override',
      quoteStyle: 'inline',
      attribution: 'Anon',
      showQuoteMarks: false,
    })
    expect(q.content).toBe('Override')
    expect(q.quoteStyle).toBe('inline')
    expect(q.attribution).toBe('Anon')
    expect(q.showQuoteMarks).toBe(false)
  })

  it('makeCaptionElement returns a caption optionally linked to image', () => {
    const c = makeCaptionElement({ imageId: 'img-1' })
    expect(c.type).toBe('caption')
    expect(c.imageId).toBe('img-1')
    expect(isCaption(c)).toBe(true)
  })

  it('makeStickerElement has padding and background', () => {
    const s = makeStickerElement({ content: 'SALE', rotate: 12 })
    expect(s.type).toBe('sticker')
    expect(s.content).toBe('SALE')
    expect(s.backgroundColor).toBeTruthy()
    expect(s.paddingX).toBeGreaterThan(0)
    expect(s.paddingY).toBeGreaterThan(0)
    expect(s.rotate).toBe(12)
    expect(isSticker(s)).toBe(true)
  })

  it('makeShapeElement defaults height for line/divider', () => {
    const line = makeShapeElement({ shape: 'line' })
    expect(line.shape).toBe('line')
    expect(line.height).toBe(2)
    const divider = makeShapeElement({ shape: 'divider' })
    expect(divider.height).toBe(2)
    const rect = makeShapeElement({ shape: 'rect' })
    expect(rect.height).toBeGreaterThan(2)
    expect(isShape(rect)).toBe(true)
  })

  it('makeGroupElement carries child ids', () => {
    const g = makeGroupElement({ childIds: ['a', 'b', 'c'], label: 'Figure 1' })
    expect(g.type).toBe('group')
    expect(g.childIds).toEqual(['a', 'b', 'c'])
    expect(g.label).toBe('Figure 1')
    expect(isGroup(g)).toBe(true)
  })

  it('factories produce stable unique ids', () => {
    const a = makePullquoteElement()
    const b = makePullquoteElement()
    expect(a.id).not.toBe(b.id)
  })
})

describe('isTextBearing guard', () => {
  it('matches every text-carrying kind', () => {
    expect(isTextBearing(makeTextElement())).toBe(true)
    expect(isTextBearing(makePullquoteElement())).toBe(true)
    expect(isTextBearing(makeCaptionElement())).toBe(true)
    expect(isTextBearing(makeStickerElement())).toBe(true)
  })

  it('rejects non-text-bearing kinds', () => {
    expect(isTextBearing(makeShapeElement({ shape: 'line' }))).toBe(false)
    expect(isTextBearing(makeGroupElement({ childIds: [] }))).toBe(false)
  })
})

describe('wrapAroundImageId on TextElement', () => {
  it('is undefined by default and round-trips when set', () => {
    const t = makeTextElement()
    expect(t.wrapAroundImageId).toBeUndefined()
    const wrapped = makeTextElement({ wrapAroundImageId: 'img-42' })
    expect(wrapped.wrapAroundImageId).toBe('img-42')
  })
})

describe('groupId on BaseElement', () => {
  it('any element can declare a parent group id', () => {
    const t = makeTextElement({ groupId: 'g1' })
    const s = makeShapeElement({ shape: 'rect', groupId: 'g1' })
    expect(t.groupId).toBe('g1')
    expect(s.groupId).toBe('g1')
  })
})
