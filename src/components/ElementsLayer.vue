<script setup lang="ts">
import { computed } from 'vue'
import { useSpreadStore } from '@/stores/spreadStore'
import TextElementNode from './elements/TextElementNode.vue'
import ImageElementNode from './elements/ImageElementNode.vue'

const store = useSpreadStore()
const elements = computed(() => store.elements)
</script>

<template>
  <div class="pointer-events-none absolute inset-0">
    <div
      v-for="el in elements"
      :key="el.id"
      class="pointer-events-none absolute inset-0"
    >
      <ImageElementNode v-if="el.type === 'image'" :element="el" />
      <TextElementNode v-else-if="el.type === 'text'" :element="el" />
    </div>
  </div>
</template>
