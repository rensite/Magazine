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
const rotateZoneSize = computed(() => 18 / store.zoom)
const rotateZoneOffset = computed(() => 9 / store.zoom)

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

interface RotateZone { x: number; y: number }

const rotateZones = computed<RotateZone[]>(() => {
  const w = props.element.width
  const h = props.element.height
  const o = rotateZoneOffset.value
  return [
    { x: -o, y: -o },
    { x: w - o, y: -o },
    { x: -o, y: h - o },
    { x: w - o, y: h - o },
  ]
})

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
  e.preventDefault()
  e.stopPropagation()
  ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
  interacting.value = true
  drag.beginResize(
    { id: props.element.id, pointer: pointerPos(e), zoom: store.zoom, shift: e.shiftKey },
    key,
  )
}

const startRotate = (e: PointerEvent) => {
  e.preventDefault()
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

const onRotateDoubleClick = (e: MouseEvent) => {
  e.stopPropagation()
  store.resetRotation(props.element.id)
}

const onSideHandleDoubleClick = (e: MouseEvent) => {
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
      v-for="(z, i) in rotateZones"
      :key="`rz-${i}`"
      :x="z.x"
      :y="z.y"
      :width="rotateZoneSize"
      :height="rotateZoneSize"
      fill="transparent"
      :style="{ cursor: rotateCursor }"
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
