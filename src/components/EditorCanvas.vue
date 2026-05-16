<script setup lang="ts">
import { computed, provide, ref } from 'vue'
import { useSpreadStore } from '@/stores/spreadStore'
import { useAuthStore } from '@/stores/authStore'
import { useViewport } from '@/composables/useViewport'
import { EDITOR_CONTAINER_KEY } from '@/composables/useCanvasPointer'
import { useImageImport } from '@/composables/useImageImport'
import { rightPageX, spreadCanvasSize } from '@/utils/elementFactory'
import ElementsLayer from './ElementsLayer.vue'
import OverlayLayer from './OverlayLayer.vue'
import Guides from './Guides.vue'

const store = useSpreadStore()
const auth = useAuthStore()
const containerRef = ref<HTMLDivElement | null>(null)
provide(EDITOR_CONTAINER_KEY, containerRef)
const vp = useViewport(containerRef)
const { importFiles } = useImageImport(() => ({
  spreadId: store.spreadId,
  userId: auth.user?.id ?? null,
}))
const dragging = ref(false)

const canvasFromClient = (clientX: number, clientY: number) => {
  const el = containerRef.value
  if (!el) return { x: 200, y: 200 }
  const rect = el.getBoundingClientRect()
  return {
    x: (clientX - rect.left - store.pan.x) / store.zoom,
    y: (clientY - rect.top - store.pan.y) / store.zoom,
  }
}

const hasFiles = (e: DragEvent): boolean => {
  const types = e.dataTransfer?.types
  if (!types) return false
  for (let i = 0; i < types.length; i++) if (types[i] === 'Files') return true
  return false
}

const onDragOver = (e: DragEvent) => {
  if (!hasFiles(e)) return
  e.preventDefault()
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
  dragging.value = true
}
const onDragLeave = (e: DragEvent) => {
  if (e.relatedTarget && containerRef.value?.contains(e.relatedTarget as Node)) return
  dragging.value = false
}
const onDrop = async (e: DragEvent) => {
  dragging.value = false
  if (!e.dataTransfer?.files?.length) return
  e.preventDefault()
  const anchor = canvasFromClient(e.clientX, e.clientY)
  await importFiles(e.dataTransfer.files, anchor)
}

const canvas = computed(() => spreadCanvasSize(store.schema))
const rightX = computed(() => rightPageX(store.schema))

const buildSha = __BUILD_SHA__
const buildTime = __BUILD_TIME__

const stageStyle = computed(() => ({
  width: `${canvas.value.width}px`,
  height: `${canvas.value.height}px`,
  transform: `translate(${store.pan.x}px, ${store.pan.y}px) scale(${store.zoom})`,
  transformOrigin: '0 0',
}))

const gridStyle = computed(() => {
  const baseSize = 24
  const size = Math.max(8, baseSize * store.zoom)
  const offsetX = ((store.pan.x % size) + size) % size
  const offsetY = ((store.pan.y % size) + size) % size
  return {
    backgroundSize: `${size}px ${size}px`,
    backgroundPosition: `${offsetX}px ${offsetY}px`,
  }
})

const bgStyle = computed(() => {
  const bg = store.schema.background
  if (bg.type === 'plain') {
    return { backgroundColor: bg.color ?? '#f5efe2' }
  }
  return {}
})

const cursorClass = computed(() => {
  if (vp.isPanning.value) return 'cursor-grabbing'
  if (vp.spaceDown.value) return 'cursor-grab'
  return ''
})

const onCanvasPointerDown = (e: PointerEvent) => {
  vp.onPointerDown(e)
  if (e.defaultPrevented) return
  if (e.target === e.currentTarget && e.button === 0) {
    store.select(null)
  }
}
</script>

<template>
  <div
    ref="containerRef"
    class="scratch-bg relative h-full w-full overflow-hidden"
    :class="cursorClass"
    :style="gridStyle"
    @wheel="vp.onWheel"
    @pointerdown.capture="onCanvasPointerDown"
    @pointermove="vp.onPointerMove"
    @pointerup="vp.onPointerUp"
    @pointercancel="vp.onPointerUp"
    @dragover="onDragOver"
    @dragleave="onDragLeave"
    @drop="onDrop"
  >
    <div class="absolute left-0 top-0 origin-top-left" :style="stageStyle">
      <div
        class="absolute shadow-[0_30px_60px_rgba(0,0,0,0.5)]"
        :class="store.schema.background.type === 'paper' ? 'paper-texture' : ''"
        :style="{ left: '0px', top: '0px', width: `${store.schema.pages.left.width}px`, height: `${store.schema.pages.left.height}px`, ...bgStyle }"
      />
      <div
        class="absolute shadow-[0_30px_60px_rgba(0,0,0,0.5)]"
        :class="store.schema.background.type === 'paper' ? 'paper-texture' : ''"
        :style="{ left: `${rightX}px`, top: '0px', width: `${store.schema.pages.right.width}px`, height: `${store.schema.pages.right.height}px`, ...bgStyle }"
      />
      <ElementsLayer />
      <Guides />
      <OverlayLayer />
    </div>

    <div class="pointer-events-none absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded bg-ink-800/80 px-3 py-1 text-xs text-ink-300">
      <button class="pointer-events-auto rounded px-2 py-0.5 hover:bg-ink-700" @click="vp.fit()">Fit ⌘0</button>
      <button class="pointer-events-auto rounded px-2 py-0.5 hover:bg-ink-700" @click="vp.zoomToHundred()">100% ⌘1</button>
      <span>{{ Math.round(store.zoom * 100) }}%</span>
    </div>

    <div
      v-if="dragging"
      class="pointer-events-none absolute inset-2 rounded-lg border-2 border-dashed border-accent bg-accent/5"
    >
      <div class="flex h-full items-center justify-center text-sm text-accent">
        Drop image to import
      </div>
    </div>

    <div
      class="pointer-events-none absolute bottom-2 right-3 select-text font-mono text-[10px] text-ink-500"
      :title="`built ${buildTime}`"
    >{{ buildSha }}</div>
  </div>
</template>

<style scoped>
.scratch-bg {
  background-color: #0e0f12;
  background-image: radial-gradient(circle, rgba(138, 144, 154, 0.18) 1px, transparent 1px);
}
</style>
