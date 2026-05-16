<script setup lang="ts">
import { computed, ref } from 'vue'
import type { SpreadElement } from '@/types/element'
import { useSpreadStore } from '@/stores/spreadStore'
import { useDragResize } from '@/composables/useDragResize'
import { useCanvasPointer } from '@/composables/useCanvasPointer'
import { toSvgTransform, ensureBox } from '@/utils/transform'
import type { HandleKey } from '@/utils/geometry'

const props = defineProps<{ element: SpreadElement }>()
const store = useSpreadStore()
const drag = useDragResize()
const { pointerPos } = useCanvasPointer()
const isText = computed(() => props.element.type === 'text')

const transform = computed(() => toSvgTransform(ensureBox(props.element)))
const handleSize = computed(() => 10 / store.zoom)
const stroke = computed(() => 1.5 / store.zoom)

const hoveringHandle = ref(false)
const interacting = ref(false)
const showFrame = computed(() => hoveringHandle.value || interacting.value)

interface ResizeHandle { x: number; y: number; key: HandleKey; cursor: string }

const resizeHandles = computed<ResizeHandle[]>(() => {
  const w = props.element.width
  const h = props.element.height
  const all: ResizeHandle[] = [
    { x: 0, y: 0, key: 'nw', cursor: 'nwse-resize' },
    { x: w / 2, y: 0, key: 'n', cursor: 'ns-resize' },
    { x: w, y: 0, key: 'ne', cursor: 'nesw-resize' },
    { x: w, y: h / 2, key: 'e', cursor: 'ew-resize' },
    { x: w, y: h, key: 'se', cursor: 'nwse-resize' },
    { x: w / 2, y: h, key: 's', cursor: 'ns-resize' },
    { x: 0, y: h, key: 'sw', cursor: 'nesw-resize' },
    { x: 0, y: h / 2, key: 'w', cursor: 'ew-resize' },
  ]
  if (isText.value) return all.filter((h) => h.key !== 'n' && h.key !== 's')
  return all
})

const rotateOffset = computed(() => 22 / store.zoom)
const rotateHandlePos = computed(() => ({
  x: props.element.width / 2,
  y: -rotateOffset.value,
}))

const startResize = (e: PointerEvent, key: HandleKey) => {
  e.preventDefault()
  e.stopPropagation()
  interacting.value = true
  drag.beginResize(
    { id: props.element.id, pointer: pointerPos(e), shift: e.shiftKey },
    key,
  )
  attachResetOnUp()
}

const startRotate = (e: PointerEvent) => {
  e.preventDefault()
  e.stopPropagation()
  interacting.value = true
  drag.beginRotate({ id: props.element.id, pointer: pointerPos(e), shift: e.shiftKey })
  attachResetOnUp()
}

const attachResetOnUp = () => {
  const reset = () => {
    interacting.value = false
    window.removeEventListener('pointerup', reset)
    window.removeEventListener('pointercancel', reset)
    window.removeEventListener('blur', reset)
  }
  window.addEventListener('pointerup', reset)
  window.addEventListener('pointercancel', reset)
  window.addEventListener('blur', reset)
}

const onRotateDoubleClick = (e: MouseEvent) => {
  e.stopPropagation()
  store.resetRotation(props.element.id)
}

const onResizeDoubleClick = (e: MouseEvent) => {
  if (!isText.value) return
  e.stopPropagation()
  store.updateElement(props.element.id, { autoWidth: true })
}

const rotateCursor =
  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='20' height='20' viewBox='0 0 20 20'><path fill='none' stroke='black' stroke-width='1.5' d='M4 10a6 6 0 1 0 2-4.5'/><path fill='black' d='M3 4l3 1.5L4.5 8z'/></svg>\") 10 10, grab"
</script>

<template>
  <g :transform="transform" class="pointer-events-auto">
    <rect
      v-if="showFrame"
      :width="props.element.width"
      :height="props.element.height"
      fill="none"
      stroke="#d4a85f"
      :stroke-width="stroke"
      stroke-dasharray="4 4"
      vector-effect="non-scaling-stroke"
    />

    <rect
      v-for="hd in resizeHandles"
      :key="hd.key"
      class="handle"
      :x="hd.x - handleSize / 2"
      :y="hd.y - handleSize / 2"
      :width="handleSize"
      :height="handleSize"
      :style="{ cursor: hd.cursor }"
      @pointerenter="hoveringHandle = true"
      @pointerleave="hoveringHandle = false"
      @pointerdown="(e) => startResize(e, hd.key)"
      @dblclick="onResizeDoubleClick"
    />

    <line
      :x1="props.element.width / 2"
      :y1="0"
      :x2="rotateHandlePos.x"
      :y2="rotateHandlePos.y + handleSize / 2"
      stroke="#d4a85f"
      :stroke-width="stroke"
      vector-effect="non-scaling-stroke"
      pointer-events="none"
    />
    <circle
      class="handle"
      :cx="rotateHandlePos.x"
      :cy="rotateHandlePos.y"
      :r="handleSize / 2"
      :style="{ cursor: rotateCursor, fill: '#d4a85f' }"
      @pointerenter="hoveringHandle = true"
      @pointerleave="hoveringHandle = false"
      @pointerdown="startRotate"
      @dblclick="onRotateDoubleClick"
    />
  </g>
</template>
