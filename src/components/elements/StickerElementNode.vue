<script setup lang="ts">
import { computed, toRef } from 'vue'
import type { StickerElement } from '@/types/element'
import { useElementTransform } from '@/composables/useElementTransform'
import { lookupFont } from '@/utils/fonts'

const props = defineProps<{ element: StickerElement }>()
const elRef = toRef(props, 'element')
const { css } = useElementTransform(elRef)
const fontDef = computed(() => lookupFont(props.element.fontFamily))

const styleObj = computed(() => ({
  transform: css.value,
  transformOrigin: '0 0',
  fontFamily: fontDef.value.cssStack,
  fontSize: `${props.element.fontSize}px`,
  fontWeight: String(props.element.fontWeight ?? 700),
  fontStyle: props.element.italic ? 'italic' : 'normal',
  letterSpacing:
    props.element.letterSpacing != null ? `${props.element.letterSpacing}px` : '0',
  color: props.element.color,
  background: props.element.backgroundColor,
  borderRadius: `${props.element.borderRadius}px`,
  padding: `${props.element.paddingY}px ${props.element.paddingX}px`,
  border:
    props.element.borderColor && props.element.borderWidth
      ? `${props.element.borderWidth}px solid ${props.element.borderColor}`
      : 'none',
  opacity: String(props.element.opacity),
}))
</script>

<template>
  <div
    class="pointer-events-auto absolute left-0 top-0 inline-block select-none whitespace-nowrap"
    :style="styleObj"
  >{{ props.element.content }}</div>
</template>
