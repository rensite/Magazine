import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useSpreadStore } from '@/stores/spreadStore'
import { aSchema, aText } from '../factories'

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

  it('history is bounded', () => {
    const store = useSpreadStore()
    store.loadSchema('s1', 't', aSchema({ elements: [aText({ id: 'a', x: 0 })] }))
    for (let i = 1; i <= 250; i++) {
      store.updateElement('a', { x: i })
    }
    expect(store.past.length).toBeLessThanOrEqual(200)
  })
})
