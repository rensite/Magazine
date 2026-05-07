import { onBeforeUnmount, onMounted, ref, type Ref } from 'vue'
import { useSpreadStore } from '@/stores/spreadStore'
import { spreadCanvasSize } from '@/utils/elementFactory'

const PADDING = 80
const MIN_ZOOM = 0.05
const MAX_ZOOM = 8

interface PanStart {
  x: number
  y: number
  pan: { x: number; y: number }
}

const isEditableTarget = (t: EventTarget | null): boolean => {
  if (!(t instanceof HTMLElement)) return false
  if (t.isContentEditable) return true
  const tag = t.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
}

export const useViewport = (containerRef: Ref<HTMLElement | null>) => {
  const store = useSpreadStore()
  const isPanning = ref(false)
  const spaceDown = ref(false)
  let panStart: PanStart | null = null

  const containerRect = (): DOMRect | null =>
    containerRef.value?.getBoundingClientRect() ?? null

  const fit = (padding = PADDING) => {
    const rect = containerRect()
    if (!rect) return
    const canvas = spreadCanvasSize(store.schema)
    if (canvas.width <= 0 || canvas.height <= 0) return
    const sx = (rect.width - padding * 2) / canvas.width
    const sy = (rect.height - padding * 2) / canvas.height
    const z = Math.min(sx, sy, 1)
    store.setZoom(z)
    store.setPan(
      (rect.width - canvas.width * z) / 2,
      (rect.height - canvas.height * z) / 2,
    )
  }

  const zoomAt = (newZoom: number, screenX: number, screenY: number) => {
    const rect = containerRect()
    if (!rect) return
    const z = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, newZoom))
    const px = screenX - rect.left
    const py = screenY - rect.top
    const cx = (px - store.pan.x) / store.zoom
    const cy = (py - store.pan.y) / store.zoom
    store.setZoom(z)
    store.setPan(px - cx * z, py - cy * z)
  }

  const zoomToHundred = () => {
    const rect = containerRect()
    if (!rect) return
    zoomAt(1, rect.left + rect.width / 2, rect.top + rect.height / 2)
  }

  const onWheel = (e: WheelEvent) => {
    e.preventDefault()
    if (e.ctrlKey || e.metaKey) {
      const factor = Math.exp(-e.deltaY * 0.01)
      zoomAt(store.zoom * factor, e.clientX, e.clientY)
    } else {
      store.setPan(store.pan.x - e.deltaX, store.pan.y - e.deltaY)
    }
  }

  const beginPan = (e: PointerEvent) => {
    isPanning.value = true
    panStart = { x: e.clientX, y: e.clientY, pan: { ...store.pan } }
    ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
  }

  const onPointerDown = (e: PointerEvent) => {
    const middle = e.button === 1
    const spacePan = spaceDown.value && e.button === 0
    if (middle || spacePan) {
      e.preventDefault()
      e.stopPropagation()
      beginPan(e)
    }
  }

  const onPointerMove = (e: PointerEvent) => {
    if (!isPanning.value || !panStart) return
    store.setPan(
      panStart.pan.x + (e.clientX - panStart.x),
      panStart.pan.y + (e.clientY - panStart.y),
    )
  }

  const onPointerUp = (e: PointerEvent) => {
    if (!isPanning.value) return
    isPanning.value = false
    panStart = null
    ;(e.currentTarget as Element).releasePointerCapture?.(e.pointerId)
  }

  const onKeyDown = (e: KeyboardEvent) => {
    if (isEditableTarget(e.target)) return
    if (e.code === 'Space' && !e.repeat) {
      spaceDown.value = true
      document.body.style.cursor = 'grab'
    }
    const cmd = e.metaKey || e.ctrlKey
    if (cmd && e.key === '0') {
      e.preventDefault()
      fit()
    } else if (cmd && e.key === '1') {
      e.preventDefault()
      zoomToHundred()
    }
  }

  const onKeyUp = (e: KeyboardEvent) => {
    if (e.code === 'Space') {
      spaceDown.value = false
      document.body.style.cursor = ''
    }
  }

  const onWindowBlur = () => {
    // Safety: alt-tab while space is held would leave spaceDown stuck true,
    // turning every subsequent click into a pan and blocking element drags.
    spaceDown.value = false
    document.body.style.cursor = ''
  }

  onMounted(() => {
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', onWindowBlur)
    requestAnimationFrame(() => fit())
  })

  onBeforeUnmount(() => {
    window.removeEventListener('keydown', onKeyDown)
    window.removeEventListener('keyup', onKeyUp)
    window.removeEventListener('blur', onWindowBlur)
    document.body.style.cursor = ''
  })

  return {
    isPanning,
    spaceDown,
    fit,
    zoomAt,
    zoomToHundred,
    onWheel,
    onPointerDown,
    onPointerMove,
    onPointerUp,
  }
}
