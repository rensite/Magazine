<script setup lang="ts">
import { computed, inject, toRef } from 'vue'
import type { ImageElement } from '@/types/element'
import { useSpreadStore } from '@/stores/spreadStore'
import { useDragResize } from '@/composables/useDragResize'
import { useCanvasPointer } from '@/composables/useCanvasPointer'
import { ensureBox, toSvgTransform } from '@/utils/transform'

const props = defineProps<{ element: ImageElement }>()
const store = useSpreadStore()
const drag = useDragResize()
const { pointerPos } = useCanvasPointer()

const urlMap = inject<Record<string, string>>('imageUrls', {})

const isDirectUrl = (s: string): boolean =>
  /^(data:|blob:|https?:\/\/|\/)/.test(s)

const resolve = (path: string | undefined): string => {
  if (!path) return ''
  if (isDirectUrl(path)) return path
  return urlMap[path] ?? ''
}

const transform = computed(() => toSvgTransform(ensureBox(toRef(props, 'element').value)))
const href = computed(() => resolve(props.element.thumb) || resolve(props.element.src))

const onPointerDown = (e: PointerEvent) => {
  e.stopPropagation()
  store.select(props.element.id)
  ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
  drag.beginDrag({
    id: props.element.id,
    pointer: pointerPos(e),
    zoom: store.zoom,
    shift: e.shiftKey,
  })
}

const onPointerMove = (e: PointerEvent) => {
  if (e.buttons === 0) return
  drag.move(pointerPos(e), store.zoom, e.shiftKey)
}

const onPointerUp = (e: PointerEvent) => {
  ;(e.currentTarget as Element).releasePointerCapture?.(e.pointerId)
  drag.end()
}
</script>

<template>
  <g
    :transform="transform"
    :opacity="props.element.opacity"
    style="cursor: move"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
  >
    <image
      v-if="href"
      :href="href"
      :width="props.element.width"
      :height="props.element.height"
      preserveAspectRatio="xMidYMid slice"
      :mask="props.element.maskId ? `url(#${props.element.maskId})` : undefined"
    />
    <rect
      v-else
      :width="props.element.width"
      :height="props.element.height"
      fill="#1d2026"
      stroke="#3a3f49"
      stroke-dasharray="4 4"
    />
  </g>
</template>
