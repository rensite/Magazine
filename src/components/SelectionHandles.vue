<script setup lang="ts">
import { computed, ref } from 'vue'
import type { SpreadElement } from '@/types/element'
import { useSpreadStore } from '@/stores/spreadStore'
import { useDragResize } from '@/composables/useDragResize'
import { toSvgTransform, ensureBox, type Vec2 } from '@/utils/transform'
import type { HandleKey } from '@/utils/geometry'

const props = defineProps<{ element: SpreadElement }>()
const store = useSpreadStore()
const drag = useDragResize()
const isText = computed(() => props.element.type === 'text')

const transform = computed(() => toSvgTransform(ensureBox(props.element)))
const handleSize = computed(() => 10 / store.zoom)
const stroke = computed(() => 1.5 / store.zoom)

const hoveringHandle = ref(false)
const interacting = ref(false)
const showFrame = computed(() => hoveringHandle.value || interacting.value)

interface Handle { x: number; y: number; key: HandleKey; cursor: string }

const handles = computed<Handle[]>(() => {
  const w = props.element.width
  const h = props.element.height
  if (isText.value) {
    return [
      { x: 0, y: h / 2, key: 'w', cursor: 'ew-resize' },
      { x: w, y: h / 2, key: 'e', cursor: 'ew-resize' },
    ]
  }
  return [
    { x: 0, y: 0, key: 'nw', cursor: 'nwse-resize' },
    { x: w, y: 0, key: 'ne', cursor: 'nesw-resize' },
    { x: 0, y: h, key: 'sw', cursor: 'nesw-resize' },
    { x: w, y: h, key: 'se', cursor: 'nwse-resize' },
  ]
})

const rotateHandle = computed(() => ({
  x: props.element.width / 2,
  y: -28 / store.zoom,
}))

const pointerPos = (e: PointerEvent): Vec2 => {
  const svg = (e.currentTarget as SVGElement).ownerSVGElement!
  const pt = svg.createSVGPoint()
  pt.x = e.clientX
  pt.y = e.clientY
  const ctm = svg.getScreenCTM()
  if (!ctm) return { x: e.clientX, y: e.clientY }
  const local = pt.matrixTransform(ctm.inverse())
  return { x: local.x, y: local.y }
}

const startResize = (e: PointerEvent, key: HandleKey) => {
  e.stopPropagation()
  ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
  interacting.value = true
  drag.beginResize(
    { id: props.element.id, pointer: pointerPos(e), zoom: store.zoom, shift: e.shiftKey },
    key,
  )
}

const startRotate = (e: PointerEvent) => {
  e.stopPropagation()
  ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
  interacting.value = true
  drag.beginRotate({ id: props.element.id, pointer: pointerPos(e), zoom: store.zoom, shift: e.shiftKey })
}

const onMove = (e: PointerEvent) => {
  if (e.buttons === 0) return
  drag.move(pointerPos(e), store.zoom, e.shiftKey)
}

const onUp = (e: PointerEvent) => {
  ;(e.currentTarget as Element).releasePointerCapture?.(e.pointerId)
  drag.end()
  interacting.value = false
}

const onRotateDoubleClick = (e: PointerEvent) => {
  e.stopPropagation()
  store.resetRotation(props.element.id)
}

const onSideHandleDoubleClick = (e: PointerEvent) => {
  if (!isText.value) return
  e.stopPropagation()
  store.updateElement(props.element.id, { autoWidth: true })
}
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
    <line
      v-if="showFrame"
      :x1="props.element.width / 2"
      :y1="0"
      :x2="rotateHandle.x"
      :y2="rotateHandle.y"
      stroke="#d4a85f"
      :stroke-width="stroke"
      vector-effect="non-scaling-stroke"
    />
    <circle
      class="handle"
      :cx="rotateHandle.x"
      :cy="rotateHandle.y"
      :r="handleSize / 1.4"
      style="cursor: grab"
      @pointerenter="hoveringHandle = true"
      @pointerleave="hoveringHandle = false"
      @pointerdown="startRotate"
      @pointermove="onMove"
      @pointerup="onUp"
      @dblclick="onRotateDoubleClick"
    />
    <rect
      v-for="hd in handles"
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
      @pointermove="onMove"
      @pointerup="onUp"
      @dblclick="onSideHandleDoubleClick"
    />
  </g>
</template>
