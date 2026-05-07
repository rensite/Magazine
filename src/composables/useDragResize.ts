import { onBeforeUnmount } from 'vue'
import type { ElementId, SpreadElement } from '@/types/element'
import { useSpreadStore } from '@/stores/spreadStore'
import { useCanvasPointer } from './useCanvasPointer'
import { resizeBox, snapAngle, type HandleKey } from '@/utils/geometry'
import { ensureBox, type Vec2 } from '@/utils/transform'

type Mode =
  | { kind: 'drag'; startEl: SpreadElement; startPointer: Vec2 }
  | { kind: 'resize'; startEl: SpreadElement; startPointer: Vec2; handle: HandleKey }
  | { kind: 'rotate'; startEl: SpreadElement; center: Vec2; startAngle: number }

interface BeginContext {
  id: ElementId
  pointer: Vec2
  shift: boolean
}

const canvasDelta = (start: Vec2, current: Vec2): Vec2 => ({
  x: current.x - start.x,
  y: current.y - start.y,
})

export const useDragResize = () => {
  const store = useSpreadStore()
  const { screenToCanvas } = useCanvasPointer()

  let mode: Mode | null = null
  let activeId: ElementId | null = null
  let listenersInstalled = false

  const lockSelection = () => {
    document.body.style.userSelect = 'none'
  }
  const unlockSelection = () => {
    document.body.style.userSelect = ''
  }

  const move = (pointer: Vec2, shift: boolean) => {
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
    removeListeners()
  }

  const cancel = () => {
    if (!mode) return
    store.rollbackInteraction()
    mode = null
    activeId = null
    unlockSelection()
    removeListeners()
  }

  const onWinMove = (e: PointerEvent) => {
    if (!mode) return
    const pos = screenToCanvas(e.clientX, e.clientY)
    move(pos, e.shiftKey)
  }
  const onWinUp = () => {
    if (mode) end()
  }
  const onWinKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') cancel()
  }
  const onWinBlur = () => {
    if (mode) cancel()
  }

  const installListeners = () => {
    if (listenersInstalled) return
    window.addEventListener('pointermove', onWinMove)
    window.addEventListener('pointerup', onWinUp)
    window.addEventListener('pointercancel', onWinUp)
    window.addEventListener('keydown', onWinKey)
    window.addEventListener('blur', onWinBlur)
    listenersInstalled = true
  }
  const removeListeners = () => {
    if (!listenersInstalled) return
    window.removeEventListener('pointermove', onWinMove)
    window.removeEventListener('pointerup', onWinUp)
    window.removeEventListener('pointercancel', onWinUp)
    window.removeEventListener('keydown', onWinKey)
    window.removeEventListener('blur', onWinBlur)
    listenersInstalled = false
  }

  const beginDrag = (ctx: BeginContext) => {
    const el = store.elements.find((e) => e.id === ctx.id)
    if (!el) return
    activeId = ctx.id
    mode = { kind: 'drag', startEl: JSON.parse(JSON.stringify(el)), startPointer: ctx.pointer }
    store.beginInteraction('drag')
    lockSelection()
    installListeners()
  }

  const beginResize = (ctx: BeginContext, handle: HandleKey) => {
    const el = store.elements.find((e) => e.id === ctx.id)
    if (!el) return
    activeId = ctx.id
    mode = { kind: 'resize', startEl: JSON.parse(JSON.stringify(el)), startPointer: ctx.pointer, handle }
    store.beginInteraction('resize')
    lockSelection()
    installListeners()
  }

  const beginRotate = (ctx: BeginContext) => {
    const el = store.elements.find((e) => e.id === ctx.id)
    if (!el) return
    activeId = ctx.id
    const center: Vec2 = { x: el.x + el.width / 2, y: el.y + el.height / 2 }
    const startAngle =
      (Math.atan2(ctx.pointer.y - center.y, ctx.pointer.x - center.x) * 180) / Math.PI
    mode = { kind: 'rotate', startEl: JSON.parse(JSON.stringify(el)), center, startAngle }
    store.beginInteraction('rotate')
    lockSelection()
    installListeners()
  }

  onBeforeUnmount(removeListeners)

  return { beginDrag, beginResize, beginRotate, end, cancel }
}
