<script setup lang="ts">
import { computed, toRef } from 'vue'
import type { PullquoteElement } from '@/types/element'
import { useElementTransform } from '@/composables/useElementTransform'
import { lookupFont } from '@/utils/fonts'

const props = defineProps<{ element: PullquoteElement }>()
const elRef = toRef(props, 'element')
const { css } = useElementTransform(elRef)
const fontDef = computed(() => lookupFont(props.element.fontFamily))

const styleObj = computed(() => ({
  transform: css.value,
  transformOrigin: '0 0',
  width: `${props.element.width}px`,
  fontFamily: fontDef.value.cssStack,
  fontSize: `${props.element.fontSize}px`,
  fontWeight: String(props.element.fontWeight ?? 500),
  fontStyle: props.element.italic ? 'italic' : 'normal',
  letterSpacing:
    props.element.letterSpacing != null ? `${props.element.letterSpacing}px` : '0',
  color: props.element.color,
  textAlign: props.element.align,
  lineHeight: String(props.element.lineHeight),
  opacity: String(props.element.opacity),
}))

const showMarks = computed(() => props.element.showQuoteMarks !== false)
const isInline = computed(() => props.element.quoteStyle === 'inline')
</script>

<template>
  <div
    class="pointer-events-auto absolute left-0 top-0 select-none"
    :style="styleObj"
  >
    <div
      v-if="isInline"
      class="mb-2 h-px"
      :style="{ background: props.element.color }"
    />
    <div class="whitespace-pre-wrap break-words">
      <span v-if="showMarks" aria-hidden="true">«</span>{{ props.element.content }}<span v-if="showMarks" aria-hidden="true">»</span>
    </div>
    <div
      v-if="props.element.attribution"
      class="mt-2 text-[0.6em] uppercase tracking-widest opacity-70"
    >— {{ props.element.attribution }}</div>
  </div>
</template>
