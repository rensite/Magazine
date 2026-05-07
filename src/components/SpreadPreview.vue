<script setup lang="ts">
import { computed } from 'vue'
import type { SpreadSchema, SpreadElement } from '@/types/element'
import { migrateSchema, spreadCanvasSize, rightPageX } from '@/utils/elementFactory'

const props = defineProps<{
  schema: SpreadSchema | unknown
  width?: number
  height?: number
}>()

const w = computed(() => props.width ?? 160)
const h = computed(() => props.height ?? 110)

const safe = computed<SpreadSchema>(() => migrateSchema(props.schema))
const canvas = computed(() => spreadCanvasSize(safe.value))
const rightX = computed(() => rightPageX(safe.value))

const viewBox = computed(() => `0 0 ${canvas.value.width} ${canvas.value.height}`)

const fit = computed(() => {
  const sx = w.value / canvas.value.width
  const sy = h.value / canvas.value.height
  return Math.min(sx, sy)
})

const renderedSize = computed(() => ({
  w: canvas.value.width * fit.value,
  h: canvas.value.height * fit.value,
}))

const pageBg = computed(() => {
  const bg = safe.value.background
  if (bg.type === 'plain') return bg.color ?? '#f5efe2'
  if (bg.type === 'paper') return '#f5efe2'
  return '#f5efe2'
})

const colorFor = (el: SpreadElement): string => {
  if (el.type === 'text') return el.color ?? '#1a1410'
  if (el.type === 'image') return '#3a3f49'
  return '#999'
}

const opacityFor = (el: SpreadElement): number => {
  if (el.type === 'text') return Math.max(0.3, el.opacity ?? 1) * 0.8
  return el.opacity ?? 1
}
</script>

<template>
  <div
    class="relative overflow-hidden rounded bg-ink-900"
    :style="{ width: `${w}px`, height: `${h}px` }"
  >
    <svg
      class="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
      :width="renderedSize.w"
      :height="renderedSize.h"
      :viewBox="viewBox"
      preserveAspectRatio="xMidYMid meet"
    >
      <!-- left page -->
      <rect
        x="0"
        y="0"
        :width="safe.pages.left.width"
        :height="safe.pages.left.height"
        :fill="pageBg"
      />
      <!-- right page -->
      <rect
        :x="rightX"
        y="0"
        :width="safe.pages.right.width"
        :height="safe.pages.right.height"
        :fill="pageBg"
      />
      <!-- gutter shadow hint -->
      <line
        :x1="safe.pages.left.width"
        y1="0"
        :x2="safe.pages.left.width"
        :y2="canvas.height"
        stroke="rgba(0,0,0,0.18)"
        stroke-width="2"
      />
      <line
        :x1="rightX"
        y1="0"
        :x2="rightX"
        :y2="canvas.height"
        stroke="rgba(0,0,0,0.18)"
        stroke-width="2"
      />

      <!-- elements: simplified silhouettes -->
      <g v-for="el in safe.elements" :key="el.id" :opacity="opacityFor(el)">
        <rect
          :x="el.x"
          :y="el.y"
          :width="el.width"
          :height="el.height"
          :fill="colorFor(el)"
          :transform="`rotate(${el.rotate} ${el.x + el.width / 2} ${el.y + el.height / 2})`"
        />
      </g>
    </svg>

    <div
      v-if="!safe.elements.length"
      class="pointer-events-none absolute inset-0 flex items-center justify-center text-[10px] text-ink-500"
    >
      пусто
    </div>
  </div>
</template>
