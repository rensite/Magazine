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

const ACCENT = '#0d99ff'
const HANDLE_FILL = '#ffffff'

const transform = computed(() => toSvgTransform(ensureBox(props.element)))
// Scale-invariant sizes: tuned for a softer Figma-like feel.
const handleSize = computed(() => 6 / store.zoom)
const handleRadius = computed(() => 1.5 / store.zoom)
const stroke = computed(() => 1 / store.zoom)
const labelFont = computed(() => 10 / store.zoom)
const labelPad = computed(() => 3 / store.zoom)

const hoveringHandle = ref(false)
const interacting = ref(false)

const dimsLabel = computed(() => {
  const w = Math.round(props.element.width)
  const h = Math.round(props.element.height)
  const r = props.element.rotate
  if (r !== 0) return `${w} × ${h} · ${Math.round(r)}°`
  return `${w} × ${h}`
})

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

const rotateOffset = computed(() => 18 / store.zoom)
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
    <!-- Selection frame: always visible, thin solid accent line with
         a soft glow so it reads against any background. -->
    <rect
      :width="props.element.width"
      :height="props.element.height"
      fill="none"
      :stroke="ACCENT"
      :stroke-width="stroke"
      vector-effect="non-scaling-stroke"
      style="filter: drop-shadow(0 0 1.5px rgba(13,153,255,0.55))"
    />

    <!-- Dimension badge: only during active interaction (drag/resize/
         rotate). Sits just below the bbox so it doesn't crowd content. -->
    <g v-if="interacting" :transform="`translate(${props.element.width / 2}, ${props.element.height + 14 / store.zoom})`">
      <rect
        :x="-(dimsLabel.length * labelFont * 0.32 + labelPad)"
        :y="-labelFont * 0.6 - labelPad / 2"
        :width="dimsLabel.length * labelFont * 0.64 + labelPad * 2"
        :height="labelFont + labelPad"
        :rx="2 / store.zoom"
        :fill="ACCENT"
      />
      <text
        :font-size="labelFont"
        :fill="'#ffffff'"
        font-family="ui-sans-serif, system-ui, sans-serif"
        text-anchor="middle"
        dy="0.32em"
        style="user-select: none"
      >{{ dimsLabel }}</text>
    </g>

    <!-- Resize handles. Larger transparent hit area + small visible square. -->
    <g v-for="hd in resizeHandles" :key="hd.key">
      <!-- visible handle -->
      <rect
        :x="hd.x - handleSize / 2"
        :y="hd.y - handleSize / 2"
        :width="handleSize"
        :height="handleSize"
        :fill="HANDLE_FILL"
        :stroke="ACCENT"
        :stroke-width="stroke"
        vector-effect="non-scaling-stroke"
        :rx="handleRadius"
        pointer-events="none"
        style="filter: drop-shadow(0 1px 1.5px rgba(0,0,0,0.25))"
      />
      <!-- enlarged hit area (~14px) -->
      <rect
        class="handle"
        :x="hd.x - handleSize"
        :y="hd.y - handleSize"
        :width="handleSize * 2"
        :height="handleSize * 2"
        fill="transparent"
        :style="{ cursor: hd.cursor }"
        @pointerenter="hoveringHandle = true"
        @pointerleave="hoveringHandle = false"
        @pointerdown="(e) => startResize(e, hd.key)"
        @dblclick="onResizeDoubleClick"
      />
    </g>

    <!-- Rotation handle: only when not interacting; subtle. -->
    <g v-if="!interacting">
      <line
        :x1="props.element.width / 2"
        :y1="0"
        :x2="rotateHandlePos.x"
        :y2="rotateHandlePos.y + handleSize / 2"
        :stroke="ACCENT"
        :stroke-width="stroke"
        vector-effect="non-scaling-stroke"
        pointer-events="none"
        opacity="0.55"
      />
      <circle
        :cx="rotateHandlePos.x"
        :cy="rotateHandlePos.y"
        :r="handleSize / 2"
        :fill="HANDLE_FILL"
        :stroke="ACCENT"
        :stroke-width="stroke"
        vector-effect="non-scaling-stroke"
        pointer-events="none"
        style="filter: drop-shadow(0 1px 1.5px rgba(0,0,0,0.25))"
      />
      <circle
        class="handle"
        :cx="rotateHandlePos.x"
        :cy="rotateHandlePos.y"
        :r="handleSize"
        fill="transparent"
        :style="{ cursor: rotateCursor }"
        @pointerenter="hoveringHandle = true"
        @pointerleave="hoveringHandle = false"
        @pointerdown="startRotate"
        @dblclick="onRotateDoubleClick"
      />
    </g>
  </g>
</template>
