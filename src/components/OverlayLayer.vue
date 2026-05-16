<script setup lang="ts">
import { computed } from 'vue'
import { useSpreadStore } from '@/stores/spreadStore'
import { spreadCanvasSize } from '@/utils/elementFactory'
import { aabb } from '@/utils/geometry'
import { ensureBox, toSvgTransform } from '@/utils/transform'
import SelectionHandles from './SelectionHandles.vue'
import SmartGuides from './SmartGuides.vue'

const ACCENT = '#0d99ff'

const store = useSpreadStore()
const canvas = computed(() => spreadCanvasSize(store.schema))
const selected = computed(() => store.selected)
const selectedAll = computed(() => store.selectedAll)
const stroke = computed(() => 1 / store.zoom)

const groupBox = computed(() => {
  const elems = selectedAll.value
  if (elems.length < 2) return null
  const boxes = elems.map((el) => aabb(ensureBox(el)))
  const minX = Math.min(...boxes.map((b) => b.minX))
  const minY = Math.min(...boxes.map((b) => b.minY))
  const maxX = Math.max(...boxes.map((b) => b.maxX))
  const maxY = Math.max(...boxes.map((b) => b.maxY))
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
})
</script>

<template>
  <svg
    class="pointer-events-none absolute left-0 top-0"
    style="overflow: visible"
    :width="canvas.width"
    :height="canvas.height"
    :viewBox="`0 0 ${canvas.width} ${canvas.height}`"
  >
    <SmartGuides />

    <!-- Single selection: full handles. -->
    <SelectionHandles v-if="selected && !selected.locked" :element="selected" />

    <!-- Multi selection: per-element accent outline + group bbox. -->
    <template v-if="selectedAll.length >= 2">
      <g
        v-for="el in selectedAll"
        :key="el.id"
        :transform="toSvgTransform(ensureBox(el))"
      >
        <rect
          :width="el.width"
          :height="el.height"
          fill="none"
          :stroke="ACCENT"
          :stroke-width="stroke"
          vector-effect="non-scaling-stroke"
        />
      </g>
      <rect
        v-if="groupBox"
        :x="groupBox.x"
        :y="groupBox.y"
        :width="groupBox.width"
        :height="groupBox.height"
        fill="none"
        :stroke="ACCENT"
        :stroke-width="stroke"
        stroke-dasharray="4 3"
        vector-effect="non-scaling-stroke"
        opacity="0.7"
      />
    </template>
  </svg>
</template>
