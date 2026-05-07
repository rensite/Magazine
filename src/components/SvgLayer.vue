<script setup lang="ts">
import { computed } from 'vue'
import { useSpreadStore } from '@/stores/spreadStore'
import { isImage } from '@/types/element'
import { spreadCanvasSize } from '@/utils/elementFactory'
import ImageElementNode from './elements/ImageElementNode.vue'

const store = useSpreadStore()
const canvas = computed(() => spreadCanvasSize(store.schema))
const imageElements = computed(() => store.elements.filter(isImage))
</script>

<template>
  <svg
    class="absolute left-0 top-0"
    style="overflow: visible"
    :width="canvas.width"
    :height="canvas.height"
    :viewBox="`0 0 ${canvas.width} ${canvas.height}`"
  >
    <defs>
      <filter id="paper-grain" x="0" y="0" width="100%" height="100%">
        <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" />
        <feColorMatrix values="0 0 0 0 0.4  0 0 0 0 0.3  0 0 0 0 0.2  0 0 0 0.05 0" />
      </filter>
      <mask id="torn-edge">
        <rect width="100%" height="100%" fill="white" />
      </mask>
    </defs>
    <ImageElementNode v-for="el in imageElements" :key="el.id" :element="el" />
  </svg>
</template>
