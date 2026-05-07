<script setup lang="ts">
import { computed, inject } from 'vue'
import type { ImageElement } from '@/types/element'
import { useSpreadStore } from '@/stores/spreadStore'
import { useDragResize } from '@/composables/useDragResize'
import { useCanvasPointer } from '@/composables/useCanvasPointer'
import { ensureBox, toCssTransform } from '@/utils/transform'

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

const transform = computed(() => toCssTransform(ensureBox(props.element)))
const href = computed(() => resolve(props.element.thumb) || resolve(props.element.src))

const onPointerDown = (e: PointerEvent) => {
  e.preventDefault()
  e.stopPropagation()
  store.select(props.element.id)
  drag.beginDrag({
    id: props.element.id,
    pointer: pointerPos(e),
    shift: e.shiftKey,
  })
}
</script>

<template>
  <img
    v-if="href"
    :src="href"
    :width="props.element.width"
    :height="props.element.height"
    :style="{
      position: 'absolute',
      left: '0px',
      top: '0px',
      transform,
      transformOrigin: '0 0',
      opacity: String(props.element.opacity),
      cursor: 'move',
      userSelect: 'none',
      pointerEvents: 'auto',
    }"
    draggable="false"
    @pointerdown="onPointerDown"
    @dragstart.prevent
  />
  <div
    v-else
    :style="{
      position: 'absolute',
      left: '0px',
      top: '0px',
      width: `${props.element.width}px`,
      height: `${props.element.height}px`,
      transform,
      transformOrigin: '0 0',
      background: '#1d2026',
      border: '1px dashed #3a3f49',
      pointerEvents: 'auto',
      cursor: 'move',
    }"
    @pointerdown="onPointerDown"
  />
</template>
