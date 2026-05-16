<script setup lang="ts">
import { computed } from 'vue'
import { useSpreadStore } from '@/stores/spreadStore'
import { spreadCanvasSize } from '@/utils/elementFactory'
import SelectionHandles from './SelectionHandles.vue'
import SmartGuides from './SmartGuides.vue'

const store = useSpreadStore()
const canvas = computed(() => spreadCanvasSize(store.schema))
const selected = computed(() => store.selected)
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
    <SelectionHandles v-if="selected && !selected.locked" :element="selected" />
  </svg>
</template>
