<script setup lang="ts">
import { computed, inject } from 'vue'
import type { ImageElement } from '@/types/element'
import { useSpreadStore } from '@/stores/spreadStore'
import { useDragResize } from '@/composables/useDragResize'
import { useCanvasPointer } from '@/composables/useCanvasPointer'
import { useStaticRender } from '@/composables/useStaticRender'
import { ensureBox, toCssTransform } from '@/utils/transform'
import { dpiQuality, imageEffectiveDpi } from '@/utils/imageDpi'

const props = defineProps<{ element: ImageElement }>()
const store = useSpreadStore()
const drag = useDragResize()
const { pointerPos } = useCanvasPointer()
const isStatic = useStaticRender()

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

const effectiveDpi = computed(() => imageEffectiveDpi(props.element))
const quality = computed(() => dpiQuality(effectiveDpi.value))
const showWarning = computed(
  () => !isStatic && store.schema.showDpiWarnings && quality.value !== 'ok',
)

const warningColor = computed(() =>
  quality.value === 'critical' ? '#ef4444' : '#f59e0b',
)

const onPointerDown = (e: PointerEvent) => {
  if (isStatic) return
  const additive = e.shiftKey || e.metaKey || e.ctrlKey
  if (props.element.locked) {
    e.stopPropagation()
    if (additive) store.toggleSelection(props.element.id)
    else store.select(props.element.id)
    return
  }
  e.preventDefault()
  e.stopPropagation()
  if (additive) {
    store.toggleSelection(props.element.id)
    return
  }
  // Preserve the existing multi-selection if the user grabs an already
  // selected member — lets them drag the whole group.
  if (!store.selectedIds.includes(props.element.id)) {
    store.select(props.element.id)
  }
  drag.beginDrag({
    id: props.element.id,
    pointer: pointerPos(e),
    shift: e.shiftKey,
  })
}

const onDoubleClick = (e: MouseEvent) => {
  if (isStatic) return
  e.stopPropagation()
  store.resetTransform(props.element.id)
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
      cursor: isStatic ? 'default' : 'move',
      userSelect: 'none',
      pointerEvents: isStatic ? 'none' : 'auto',
    }"
    draggable="false"
    @pointerdown="onPointerDown"
    @dblclick="onDoubleClick"
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
      pointerEvents: isStatic ? 'none' : 'auto',
      cursor: isStatic ? 'default' : 'move',
    }"
    @pointerdown="onPointerDown"
    @dblclick="onDoubleClick"
  />
  <div
    v-if="showWarning"
    :style="{
      position: 'absolute',
      left: '0px',
      top: '0px',
      width: `${props.element.width}px`,
      height: `${props.element.height}px`,
      transform,
      transformOrigin: '0 0',
      border: `2px dashed ${warningColor}`,
      boxSizing: 'border-box',
      pointerEvents: 'none',
    }"
  >
    <span
      :style="{
        position: 'absolute',
        top: '0px',
        left: '0px',
        background: warningColor,
        color: '#1a1410',
        fontSize: '10px',
        lineHeight: '1.2',
        padding: '2px 5px',
        fontFamily: 'system-ui, sans-serif',
        fontWeight: '600',
        whiteSpace: 'nowrap',
      }"
    >{{ Math.round(effectiveDpi) }} DPI · {{ quality === 'critical' ? 'низкое разрешение' : 'на грани' }}</span>
  </div>
</template>
