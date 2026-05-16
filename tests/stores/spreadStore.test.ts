import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useSpreadStore } from '@/stores/spreadStore'
import { isText, type TextElement } from '@/types/element'
import { aSchema, aText } from '../factories'

const asText = (e: unknown): TextElement => {
  if (!e || !isText(e as never)) throw new Error('expected text element')
  return e as TextElement
}

describe('spreadStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('addElement appends and selects', () => {
    const store = useSpreadStore()
    store.loadSchema('s1', 't', aSchema())
    const el = aText({ id: 'a' })
    store.addElement(el)
    expect(store.elements).toHaveLength(1)
    expect(store.selectedId).toBe('a')
  })

  it('updateElement applies a partial patch', () => {
    const store = useSpreadStore()
    store.loadSchema('s1', 't', aSchema({ elements: [aText({ id: 'a', x: 0 })] }))
    store.updateElement('a', { x: 50 })
    expect(store.elements[0].x).toBe(50)
  })

  it('removeElement clears selection if the element was selected', () => {
    const store = useSpreadStore()
    store.loadSchema('s1', 't', aSchema({ elements: [aText({ id: 'a' })] }))
    store.select('a')
    store.removeElement('a')
    expect(store.elements).toHaveLength(0)
    expect(store.selectedId).toBeNull()
  })

  it('undo reverts a single committed change', () => {
    const store = useSpreadStore()
    store.loadSchema('s1', 't', aSchema())
    store.addElement(aText({ id: 'a' }))
    expect(store.elements).toHaveLength(1)
    store.undo()
    expect(store.elements).toHaveLength(0)
    expect(store.canRedo).toBe(true)
  })

  it('redo replays an undone change', () => {
    const store = useSpreadStore()
    store.loadSchema('s1', 't', aSchema())
    store.addElement(aText({ id: 'a' }))
    store.undo()
    store.redo()
    expect(store.elements).toHaveLength(1)
  })

  it('transactions coalesce many updates into one history entry', () => {
    const store = useSpreadStore()
    store.loadSchema('s1', 't', aSchema({ elements: [aText({ id: 'a', x: 0 })] }))
    store.beginInteraction('drag')
    for (let i = 1; i <= 30; i++) {
      store.updateInteraction((d) => {
        const el = d.elements.find((e) => e.id === 'a')!
        el.x = i
      })
    }
    store.commitInteraction()
    expect(store.elements[0].x).toBe(30)
    store.undo()
    expect(store.elements[0].x).toBe(0)
  })

  it('rollbackInteraction restores pre-tx state and adds no history', () => {
    const store = useSpreadStore()
    store.loadSchema('s1', 't', aSchema({ elements: [aText({ id: 'a', x: 0 })] }))
    store.beginInteraction('drag')
    store.updateInteraction((d) => {
      d.elements[0].x = 999
    })
    store.rollbackInteraction()
    expect(store.elements[0].x).toBe(0)
    expect(store.canUndo).toBe(false)
  })

  it('bringToFront moves element to end', () => {
    const store = useSpreadStore()
    const a = aText({ id: 'a' })
    const b = aText({ id: 'b' })
    const c = aText({ id: 'c' })
    store.loadSchema('s1', 't', aSchema({ elements: [a, b, c] }))
    store.bringToFront('a')
    expect(store.elements.map((e) => e.id)).toEqual(['b', 'c', 'a'])
  })

  it('resetRotation sets rotate=0', () => {
    const store = useSpreadStore()
    store.loadSchema('s1', 't', aSchema({ elements: [aText({ id: 'a', rotate: 45 })] }))
    store.resetRotation('a')
    expect(store.elements[0].rotate).toBe(0)
  })

  it('toggleSelection adds and removes', () => {
    const store = useSpreadStore()
    store.loadSchema('s1', 't', aSchema({ elements: [aText({ id: 'a' }), aText({ id: 'b' })] }))
    store.select('a')
    store.toggleSelection('b')
    expect(store.selectedIds).toEqual(['a', 'b'])
    expect(store.selectedCount).toBe(2)
    expect(store.selected).toBeNull() // not exactly one
    store.toggleSelection('a')
    expect(store.selectedIds).toEqual(['b'])
  })

  it('selectAll skips hidden and locked', () => {
    const store = useSpreadStore()
    store.loadSchema('s1', 't', aSchema({ elements: [
      aText({ id: 'a' }),
      aText({ id: 'b', hidden: true }),
      aText({ id: 'c', locked: true }),
      aText({ id: 'd' }),
    ] }))
    store.selectAll()
    expect(store.selectedIds).toEqual(['a', 'd'])
  })

  it('updateMany applies a patch to every id in one history step', () => {
    const store = useSpreadStore()
    store.loadSchema('s1', 't', aSchema({ elements: [
      aText({ id: 'a', fontSize: 12 }),
      aText({ id: 'b', fontSize: 18 }),
      aText({ id: 'c', fontSize: 24 }),
    ] }))
    store.updateMany(['a', 'b'], { fontSize: 30 })
    expect(asText(store.elements[0]).fontSize).toBe(30)
    expect(asText(store.elements[1]).fontSize).toBe(30)
    expect(asText(store.elements[2]).fontSize).toBe(24)
    store.undo()
    expect(asText(store.elements[0]).fontSize).toBe(12)
    expect(asText(store.elements[1]).fontSize).toBe(18)
  })

  it('removeMany removes all listed ids and drops them from selection', () => {
    const store = useSpreadStore()
    store.loadSchema('s1', 't', aSchema({ elements: [
      aText({ id: 'a' }),
      aText({ id: 'b' }),
      aText({ id: 'c' }),
    ] }))
    store.selectMany(['a', 'b', 'c'])
    store.removeMany(['a', 'c'])
    expect(store.elements.map((e) => e.id)).toEqual(['b'])
    expect(store.selectedIds).toEqual(['b'])
  })

  it('history is bounded', () => {
    const store = useSpreadStore()
    store.loadSchema('s1', 't', aSchema({ elements: [aText({ id: 'a', x: 0 })] }))
    for (let i = 1; i <= 250; i++) {
      store.updateElement('a', { x: i })
    }
    expect(store.past.length).toBeLessThanOrEqual(200)
  })
})
