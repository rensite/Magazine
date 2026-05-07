import { inject, type Ref } from 'vue'
import { useSpreadStore } from '@/stores/spreadStore'
import type { Vec2 } from '@/utils/transform'

export const EDITOR_CONTAINER_KEY = 'editorContainer'

export const useCanvasPointer = () => {
  const store = useSpreadStore()
  const containerRef = inject<Ref<HTMLElement | null>>(EDITOR_CONTAINER_KEY)

  const screenToCanvas = (clientX: number, clientY: number): Vec2 => {
    const el = containerRef?.value
    if (!el) return { x: clientX, y: clientY }
    const rect = el.getBoundingClientRect()
    return {
      x: (clientX - rect.left - store.pan.x) / store.zoom,
      y: (clientY - rect.top - store.pan.y) / store.zoom,
    }
  }

  const pointerPos = (e: PointerEvent): Vec2 => screenToCanvas(e.clientX, e.clientY)

  return { screenToCanvas, pointerPos }
}
