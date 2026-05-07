<script setup lang="ts">
import { computed } from 'vue'
import { useSpreadStore } from '@/stores/spreadStore'
import { isText } from '@/types/element'
import TextElementNode from './elements/TextElementNode.vue'

const store = useSpreadStore()
const textElements = computed(() => store.elements.filter(isText))
</script>

<template>
  <div class="pointer-events-none absolute inset-0">
    <TextElementNode v-for="el in textElements" :key="el.id" :element="el" />
  </div>
</template>
