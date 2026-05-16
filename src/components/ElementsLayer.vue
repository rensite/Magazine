<script setup lang="ts">
import { computed } from 'vue'
import { useSpreadStore } from '@/stores/spreadStore'
import TextElementNode from './elements/TextElementNode.vue'
import ImageElementNode from './elements/ImageElementNode.vue'
import PullquoteElementNode from './elements/PullquoteElementNode.vue'
import CaptionElementNode from './elements/CaptionElementNode.vue'
import StickerElementNode from './elements/StickerElementNode.vue'
import ShapeElementNode from './elements/ShapeElementNode.vue'

const store = useSpreadStore()
const elements = computed(() => store.elements)
</script>

<template>
  <div class="pointer-events-none absolute inset-0">
    <div
      v-for="el in elements"
      :key="el.id"
      v-show="!el.hidden"
      class="pointer-events-none absolute inset-0"
    >
      <ImageElementNode v-if="el.type === 'image'" :element="el" />
      <TextElementNode v-else-if="el.type === 'text'" :element="el" />
      <PullquoteElementNode v-else-if="el.type === 'pullquote'" :element="el" />
      <CaptionElementNode v-else-if="el.type === 'caption'" :element="el" />
      <StickerElementNode v-else-if="el.type === 'sticker'" :element="el" />
      <ShapeElementNode v-else-if="el.type === 'shape'" :element="el" />
      <!-- group elements are layout-only metadata; they render no visual -->
    </div>
  </div>
</template>
