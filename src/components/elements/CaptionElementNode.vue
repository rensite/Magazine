<script setup lang="ts">
import { computed, toRef } from 'vue'
import type { CaptionElement } from '@/types/element'
import { useElementTransform } from '@/composables/useElementTransform'
import { lookupFont } from '@/utils/fonts'

const props = defineProps<{ element: CaptionElement }>()
const elRef = toRef(props, 'element')
const { css } = useElementTransform(elRef)
const fontDef = computed(() => lookupFont(props.element.fontFamily))

const styleObj = computed(() => ({
  transform: css.value,
  transformOrigin: '0 0',
  width: `${props.element.width}px`,
  fontFamily: fontDef.value.cssStack,
  fontSize: `${props.element.fontSize}px`,
  fontStyle: props.element.italic ? 'italic' : 'normal',
  letterSpacing:
    props.element.letterSpacing != null ? `${props.element.letterSpacing}px` : '0',
  color: props.element.color,
  textAlign: props.element.align,
  lineHeight: String(props.element.lineHeight),
  opacity: String(props.element.opacity),
}))
</script>

<template>
  <div
    class="pointer-events-auto absolute left-0 top-0 select-none whitespace-pre-wrap break-words"
    :style="styleObj"
  >{{ props.element.content }}</div>
</template>
