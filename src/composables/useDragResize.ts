import { onBeforeUnmount } from 'vue'
import type { ElementId, SpreadElement } from '@/types/element'
import { useSpreadStore } from '@/stores/spreadStore'
import { useCanvasPointer } from './useCanvasPointer'
import { resizeBox, snapAngle, type HandleKey } from '@/utils/geometry'
import { ensureBox, type Vec2 } from '@/utils/transform'
import {
  buildElementSnapLines,
  buildSnapLines,
  siblingBoxes,
  snapDrag,
  snapResize,
  type SiblingBox,
  type SnapLines,
} from '@/utils/snap'
import { clearSmartGuides, setSmartGuides, type GuideLabel } from './useSmartGuides'

const SNAP_PX = 6

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

  const combinedLines = (excludeId: string | null): SnapLines => {
    const base = buildSnapLines(store.schema)
    const elems = buildElementSnapLines(store.schema, excludeId)
    return { x: [...base.x, ...elems.x], y: [...base.y, ...elems.y] }
  }

  const detectMatches = (
    box: { x: number; y: number; width: number; height: number },
    lines: SnapLines,
    tol: number,
  ): { v: number[]; h: number[] } => {
    const v: number[] = []
    const h: number[] = []
    const xs = [box.x, box.x + box.width / 2, box.x + box.width]
    const ys = [box.y, box.y + box.height / 2, box.y + box.height]
    for (const c of xs) for (const t of lines.x) if (Math.abs(c - t) <= tol) v.push(t)
    for (const c of ys) for (const t of lines.y) if (Math.abs(c - t) <= tol) h.push(t)
    return { v, h }
  }

  // For each matched vertical line X, find the nearest sibling whose
  // bbox touches X (left/center/right edge) and emit a label that
  // shows the vertical pixel gap between the moving box and that
  // sibling. Same idea for horizontal matches.
  const buildLabels = (
    box: { x: number; y: number; width: number; height: number },
    matchesV: number[],
    matchesH: number[],
    sibs: SiblingBox[],
    tol: number,
  ): GuideLabel[] => {
    const labels: GuideLabel[] = []
    const seen = new Set<string>()
    const push = (l: GuideLabel) => {
      const key = `${Math.round(l.x)}|${Math.round(l.y)}|${l.text}`
      if (seen.has(key)) return
      seen.add(key)
      labels.push(l)
    }

    const movingBottom = box.y + box.height
    const movingRight = box.x + box.width

    for (const x of matchesV) {
      for (const s of sibs) {
        const xs = [s.x, s.x + s.width / 2, s.x + s.width]
        if (!xs.some((v) => Math.abs(v - x) <= tol)) continue
        const sb = s.y + s.height
        let gap: number | null = null
        let labelY = 0
        if (sb <= box.y) {
          gap = box.y - sb
          labelY = (sb + box.y) / 2
        } else if (movingBottom <= s.y) {
          gap = s.y - movingBottom
          labelY = (movingBottom + s.y) / 2
        }
        if (gap !== null && gap > 0.5) push({ x: x + 4, y: labelY, text: `${Math.round(gap)}` })
      }
    }

    for (const y of matchesH) {
      for (const s of sibs) {
        const ys = [s.y, s.y + s.height / 2, s.y + s.height]
        if (!ys.some((v) => Math.abs(v - y) <= tol)) continue
        const sr = s.x + s.width
        let gap: number | null = null
        let labelX = 0
        if (sr <= box.x) {
          gap = box.x - sr
          labelX = (sr + box.x) / 2
        } else if (movingRight <= s.x) {
          gap = s.x - movingRight
          labelX = (movingRight + s.x) / 2
        }
        if (gap !== null && gap > 0.5) push({ x: labelX, y: y - 6, text: `${Math.round(gap)}` })
      }
    }

    return labels
  }

  const move = (pointer: Vec2, shift: boolean, alt: boolean) => {
    if (!mode || !activeId) return
    const id = activeId
    const snapThreshold = alt ? 0 : SNAP_PX / Math.max(0.001, store.zoom)
    if (mode.kind === 'drag') {
      const d = canvasDelta(mode.startPointer, pointer)
      const proposed = {
        ...mode.startEl,
        x: mode.startEl.x + d.x,
        y: mode.startEl.y + d.y,
      }
      const lines = combinedLines(id)
      const snapped =
        mode.startEl.rotate === 0 && snapThreshold > 0
          ? snapDrag(ensureBox(proposed), lines, snapThreshold)
          : { x: proposed.x, y: proposed.y }
      const next = { ...proposed, x: snapped.x, y: snapped.y }
      const movingBox = { x: next.x, y: next.y, width: next.width, height: next.height }
      const m = snapThreshold > 0 ? detectMatches(movingBox, lines, 0.5) : { v: [], h: [] }
      const sibs = snapThreshold > 0 ? siblingBoxes(store.schema, id) : []
      const labels = sibs.length > 0 ? buildLabels(movingBox, m.v, m.h, sibs, 0.5) : []
      setSmartGuides(Array.from(new Set(m.v)), Array.from(new Set(m.h)), labels)
      store.updateInteraction((draft) => {
        const i = draft.elements.findIndex((e) => e.id === id)
        if (i !== -1) draft.elements[i] = next
      })
    } else if (mode.kind === 'resize') {
      const d = canvasDelta(mode.startPointer, pointer)
      let resized = resizeBox(ensureBox(mode.startEl), mode.handle, d.x, d.y, shift)
      const lines = combinedLines(id)
      if (mode.startEl.rotate === 0 && snapThreshold > 0 && !shift) {
        resized = snapResize(resized, mode.handle, lines, snapThreshold)
      }
      const m = snapThreshold > 0 ? detectMatches(resized, lines, 0.5) : { v: [], h: [] }
      const sibs = snapThreshold > 0 ? siblingBoxes(store.schema, id) : []
      const labels = sibs.length > 0 ? buildLabels(resized, m.v, m.h, sibs, 0.5) : []
      setSmartGuides(Array.from(new Set(m.v)), Array.from(new Set(m.h)), labels)
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
    clearSmartGuides()
    removeListeners()
  }

  const cancel = () => {
    if (!mode) return
    store.rollbackInteraction()
    mode = null
    activeId = null
    unlockSelection()
    clearSmartGuides()
    removeListeners()
  }

  const onWinMove = (e: PointerEvent) => {
    if (!mode) return
    const pos = screenToCanvas(e.clientX, e.clientY)
    move(pos, e.shiftKey, e.altKey)
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
