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

const baseline = computed(() => store.schema.baselineGrid)
const columnGrid = computed(() => store.schema.columnGrid)

interface BaselineLine {
  x1: number
  x2: number
  y: number
}

interface ColumnLine {
  x: number
  y1: number
  y2: number
}

const baselineLines = computed<BaselineLine[]>(() => {
  const g = baseline.value
  if (!g.enabled || g.lineHeight <= 0) return []
  const lines: BaselineLine[] = []
  for (const p of pages.value) {
    const top = p.page.margins.top
    const bottom = p.page.height - p.page.margins.bottom
    const x1 = p.x + p.page.margins.left
    const x2 = p.x + p.page.width - p.page.margins.right
    const start = top + ((g.offset % g.lineHeight) + g.lineHeight) % g.lineHeight
    for (let y = start; y <= bottom + 0.001; y += g.lineHeight) {
      lines.push({ x1, x2, y })
    }
  }
  return lines
})

const columnLines = computed<ColumnLine[]>(() => {
  const g = columnGrid.value
  if (!g.enabled || g.columns < 1) return []
  const lines: ColumnLine[] = []
  for (const p of pages.value) {
    const left = p.x + p.page.margins.left
    const right = p.x + p.page.width - p.page.margins.right
    const y1 = p.page.margins.top
    const y2 = p.page.height - p.page.margins.bottom
    const inner = right - left
    if (inner <= 0) continue
    const colWidth = (inner - g.gutter * (g.columns - 1)) / g.columns
    if (colWidth <= 0) continue
    for (let i = 0; i < g.columns; i++) {
      const colLeft = left + i * (colWidth + g.gutter)
      const colRight = colLeft + colWidth
      lines.push({ x: colLeft, y1, y2 })
      if (i < g.columns - 1 || colRight <= right + 0.001) {
        lines.push({ x: colRight, y1, y2 })
      }
    }
  }
  return lines
})
</script>

<template>
  <svg
    class="pointer-events-none absolute left-0 top-0"
    :width="canvas.width"
    :height="canvas.height"
    :viewBox="`0 0 ${canvas.width} ${canvas.height}`"
  >
    <g v-for="p in pages" :key="`m${p.side}`">
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
    <template v-if="store.schema.showGuides">
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
    </template>
    <g v-if="baseline.enabled" :opacity="0.5">
      <line
        v-for="(l, i) in baselineLines"
        :key="`b${i}`"
        :x1="l.x1"
        :x2="l.x2"
        :y1="l.y"
        :y2="l.y"
        :stroke="baseline.color"
        :stroke-width="stroke"
        vector-effect="non-scaling-stroke"
      />
    </g>
    <g v-if="columnGrid.enabled" :opacity="0.45">
      <line
        v-for="(l, i) in columnLines"
        :key="`c${i}`"
        :x1="l.x"
        :x2="l.x"
        :y1="l.y1"
        :y2="l.y2"
        :stroke="columnGrid.color"
        :stroke-width="stroke"
        vector-effect="non-scaling-stroke"
      />
    </g>
  </svg>
</template>
