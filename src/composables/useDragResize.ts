import { onBeforeUnmount, onMounted } from 'vue'
import type { ElementId, SpreadElement } from '@/types/element'
import { useSpreadStore } from '@/stores/spreadStore'
import { resizeBox, snapAngle, type HandleKey } from '@/utils/geometry'
import { ensureBox, type Vec2 } from '@/utils/transform'

type Mode =
  | { kind: 'drag'; startEl: SpreadElement; startPointer: Vec2 }
  | { kind: 'resize'; startEl: SpreadElement; startPointer: Vec2; handle: HandleKey }
  | { kind: 'rotate'; startEl: SpreadElement; center: Vec2; startAngle: number }

interface BeginContext {
  id: ElementId
  pointer: Vec2
  zoom: number
  shift: boolean
}

const canvasDelta = (start: Vec2, current: Vec2): Vec2 => ({
  x: current.x - start.x,
  y: current.y - start.y,
})

export const useDragResize = () => {
  const store = useSpreadStore()
  let mode: Mode | null = null
  let activeId: ElementId | null = null
  let escListener: ((e: KeyboardEvent) => void) | null = null

  const lockSelection = () => {
    document.body.style.userSelect = 'none'
  }
  const unlockSelection = () => {
    document.body.style.userSelect = ''
  }

  const beginDrag = (ctx: BeginContext) => {
    const el = store.elements.find((e) => e.id === ctx.id)
    if (!el) return
    activeId = ctx.id
    mode = { kind: 'drag', startEl: structuredClone(el), startPointer: ctx.pointer }
    store.beginInteraction('drag')
    lockSelection()
    attachEsc()
  }

  const beginResize = (ctx: BeginContext, handle: HandleKey) => {
    const el = store.elements.find((e) => e.id === ctx.id)
    if (!el) return
    activeId = ctx.id
    mode = { kind: 'resize', startEl: structuredClone(el), startPointer: ctx.pointer, handle }
    store.beginInteraction('resize')
    lockSelection()
    attachEsc()
  }

  const beginRotate = (ctx: BeginContext) => {
    const el = store.elements.find((e) => e.id === ctx.id)
    if (!el) return
    activeId = ctx.id
    const center: Vec2 = { x: el.x + el.width / 2, y: el.y + el.height / 2 }
    const startAngle = (Math.atan2(ctx.pointer.y - center.y, ctx.pointer.x - center.x) * 180) / Math.PI
    mode = { kind: 'rotate', startEl: structuredClone(el), center, startAngle }
    store.beginInteraction('rotate')
    lockSelection()
    attachEsc()
  }

  const move = (pointer: Vec2, _zoom: number, shift: boolean) => {
    if (!mode || !activeId) return
    const id = activeId
    if (mode.kind === 'drag') {
      const d = canvasDelta(mode.startPointer, pointer)
      const next = {
        ...mode.startEl,
        x: mode.startEl.x + d.x,
        y: mode.startEl.y + d.y,
      }
      store.updateInteraction((draft) => {
        const i = draft.elements.findIndex((e) => e.id === id)
        if (i !== -1) draft.elements[i] = next
      })
    } else if (mode.kind === 'resize') {
      const d = canvasDelta(mode.startPointer, pointer)
      const resized = resizeBox(ensureBox(mode.startEl), mode.handle, d.x, d.y, shift)
      store.updateInteraction((draft) => {
        const i = draft.elements.findIndex((e) => e.id === id)
        if (i === -1) return
        const start = mode!.startEl
        if (start.type === 'text') {
          // For text, only X dimension is user-controlled — height is auto from content.
          // Resizing also flips the element to manual width mode.
          draft.elements[i] = {
            ...start,
            x: resized.x,
            width: resized.width,
            autoWidth: false,
          }
        } else {
          draft.elements[i] = { ...start, ...resized } as SpreadElement
        }
      })
    } else if (mode.kind === 'rotate') {
      const current =
        (Math.atan2(pointer.y - mode.center.y, pointer.x - mode.center.x) * 180) / Math.PI
      const delta = current - mode.startAngle
      const raw = mode.startEl.rotate + delta
      const final = shift ? raw : snapAngle(raw)
      store.updateInteraction((draft) => {
        const i = draft.elements.findIndex((e) => e.id === id)
        if (i !== -1) draft.elements[i] = { ...mode!.startEl, rotate: final } as SpreadElement
      })
    }
  }

  const end = () => {
    if (!mode) return
    store.commitInteraction()
    mode = null
    activeId = null
    unlockSelection()
    detachEsc()
  }

  const cancel = () => {
    if (!mode) return
    store.rollbackInteraction()
    mode = null
    activeId = null
    unlockSelection()
    detachEsc()
  }

  const attachEsc = () => {
    if (escListener) return
    escListener = (e: KeyboardEvent) => {
      if (e.key === 'Escape') cancel()
    }
    window.addEventListener('keydown', escListener)
  }

  const detachEsc = () => {
    if (!escListener) return
    window.removeEventListener('keydown', escListener)
    escListener = null
  }

  // Safety: if pointer capture is lost (element unmounted mid-drag, devtools
  // opened, alt-tab) the original pointerup may never fire. Watch the window
  // and clean up any in-flight interaction on the next pointerup we observe.
  const onWindowPointerUp = () => {
    if (mode) end()
  }
  const onWindowBlur = () => {
    if (mode) cancel()
  }

  onMounted(() => {
    window.addEventListener('pointerup', onWindowPointerUp)
    window.addEventListener('pointercancel', onWindowPointerUp)
    window.addEventListener('blur', onWindowBlur)
  })

  onBeforeUnmount(() => {
    window.removeEventListener('pointerup', onWindowPointerUp)
    window.removeEventListener('pointercancel', onWindowPointerUp)
    window.removeEventListener('blur', onWindowBlur)
    detachEsc()
  })

  return { beginDrag, beginResize, beginRotate, move, end, cancel }
}
