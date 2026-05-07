<script setup lang="ts">
import { computed } from 'vue'
import { useSpreadStore } from '@/stores/spreadStore'
import { rightPageX, spreadCanvasSize } from '@/utils/elementFactory'
import type { PageSettings } from '@/types/element'

const store = useSpreadStore()

const canvas = computed(() => spreadCanvasSize(store.schema))
const stroke = computed(() => 1 / store.zoom)
const dashShort = computed(() => `${4 / store.zoom} ${4 / store.zoom}`)
const dashLong = computed(() => `${8 / store.zoom} ${4 / store.zoom}`)

interface PageRect {
  side: 'left' | 'right'
  x: number
  page: PageSettings
}

const pages = computed<PageRect[]>(() => [
  { side: 'left', x: 0, page: store.schema.pages.left },
  { side: 'right', x: rightPageX(store.schema), page: store.schema.pages.right },
])

const gutterX = computed(() => store.schema.pages.left.width)
const gutterWidth = computed(() => store.schema.gutter)
</script>

<template>
  <svg
    v-if="store.schema.showGuides"
    class="pointer-events-none absolute left-0 top-0"
    :width="canvas.width"
    :height="canvas.height"
    :viewBox="`0 0 ${canvas.width} ${canvas.height}`"
  >
    <g v-for="p in pages" :key="p.side">
      <rect
        :x="p.x - p.page.bleed"
        :y="-p.page.bleed"
        :width="p.page.width + p.page.bleed * 2"
        :height="p.page.height + p.page.bleed * 2"
        fill="none"
        stroke="#e35353"
        :stroke-width="stroke"
        :stroke-dasharray="dashLong"
        vector-effect="non-scaling-stroke"
      />
      <rect
        :x="p.x"
        :y="0"
        :width="p.page.width"
        :height="p.page.height"
        fill="none"
        stroke="#0e0f12"
        :stroke-width="stroke"
        vector-effect="non-scaling-stroke"
      />
      <rect
        :x="p.x + p.page.margins.left"
        :y="p.page.margins.top"
        :width="p.page.width - p.page.margins.left - p.page.margins.right"
        :height="p.page.height - p.page.margins.top - p.page.margins.bottom"
        fill="none"
        stroke="#5fa8d4"
        :stroke-width="stroke"
        :stroke-dasharray="dashShort"
        vector-effect="non-scaling-stroke"
      />
    </g>
    <rect
      v-if="gutterWidth > 0"
      :x="gutterX"
      :y="0"
      :width="gutterWidth"
      :height="canvas.height"
      fill="rgba(58, 63, 73, 0.18)"
      :stroke-width="0"
    />
    <line
      v-if="gutterWidth > 0"
      :x1="gutterX + gutterWidth / 2"
      :y1="0"
      :x2="gutterX + gutterWidth / 2"
      :y2="canvas.height"
      stroke="#5a606b"
      :stroke-width="stroke"
      :stroke-dasharray="dashShort"
      vector-effect="non-scaling-stroke"
    />
  </svg>
</template>
