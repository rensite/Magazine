<script setup lang="ts">
import { computed } from 'vue'
import { useSpreadStore } from '@/stores/spreadStore'
import { spreadCanvasSize } from '@/utils/elementFactory'
import { smartGuides } from '@/composables/useSmartGuides'

const GUIDE = '#f43f5e'

const store = useSpreadStore()
const canvas = computed(() => spreadCanvasSize(store.schema))
const stroke = computed(() => 1 / store.zoom)
const fontSize = computed(() => 10 / store.zoom)
const labelPad = computed(() => 3 / store.zoom)
const labelHeight = computed(() => 14 / store.zoom)
</script>

<template>
  <g class="pointer-events-none">
    <line
      v-for="(x, i) in smartGuides.vertical"
      :key="`v-${i}-${x}`"
      :x1="x"
      :y1="0"
      :x2="x"
      :y2="canvas.height"
      :stroke="GUIDE"
      :stroke-width="stroke"
      vector-effect="non-scaling-stroke"
    />
    <line
      v-for="(y, i) in smartGuides.horizontal"
      :key="`h-${i}-${y}`"
      :x1="0"
      :y1="y"
      :x2="canvas.width"
      :y2="y"
      :stroke="GUIDE"
      :stroke-width="stroke"
      vector-effect="non-scaling-stroke"
    />
    <g
      v-for="(label, i) in smartGuides.labels"
      :key="`l-${i}-${label.x}-${label.y}-${label.text}`"
    >
      <rect
        :x="label.x - (label.text.length * fontSize * 0.32) - labelPad"
        :y="label.y - labelHeight / 2"
        :width="label.text.length * fontSize * 0.64 + labelPad * 2"
        :height="labelHeight"
        :fill="GUIDE"
        :rx="2 / store.zoom"
      />
      <text
        :x="label.x"
        :y="label.y + fontSize * 0.35"
        :fill="'#ffffff'"
        :font-size="fontSize"
        font-family="ui-sans-serif, system-ui, sans-serif"
        text-anchor="middle"
        style="user-select: none"
      >{{ label.text }}</text>
    </g>
  </g>
</template>
