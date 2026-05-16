<script setup lang="ts">
import { computed } from 'vue'
import { useSpreadStore } from '@/stores/spreadStore'
import { spreadCanvasSize } from '@/utils/elementFactory'
import { smartGuides } from '@/composables/useSmartGuides'

const store = useSpreadStore()
const canvas = computed(() => spreadCanvasSize(store.schema))
const stroke = computed(() => 1 / store.zoom)
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
      stroke="#ff37c8"
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
      stroke="#ff37c8"
      :stroke-width="stroke"
      vector-effect="non-scaling-stroke"
    />
  </g>
</template>
