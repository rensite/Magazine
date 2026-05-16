<script setup lang="ts">
import { computed, toRef } from 'vue'
import type { ShapeElement } from '@/types/element'
import { useElementTransform } from '@/composables/useElementTransform'

const props = defineProps<{ element: ShapeElement }>()
const elRef = toRef(props, 'element')
const { css } = useElementTransform(elRef)

const wrapStyle = computed(() => ({
  transform: css.value,
  transformOrigin: '0 0',
  width: `${props.element.width}px`,
  height: `${props.element.height}px`,
  opacity: String(props.element.opacity),
}))

// Render each shape as inline SVG sized to width/height, scaled coords.
const dasharray = computed(() => (props.element.dashed ? '4 4' : undefined))
</script>

<template>
  <div
    class="pointer-events-auto absolute left-0 top-0"
    :style="wrapStyle"
  >
    <svg
      :width="props.element.width"
      :height="props.element.height"
      :viewBox="`0 0 ${props.element.width} ${props.element.height}`"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <line
        v-if="props.element.shape === 'line' || props.element.shape === 'divider'"
        :x1="0"
        :y1="props.element.height / 2"
        :x2="props.element.width"
        :y2="props.element.height / 2"
        :stroke="props.element.stroke"
        :stroke-width="props.element.strokeWidth"
        :stroke-dasharray="dasharray"
      />
      <rect
        v-else-if="props.element.shape === 'rect'"
        :x="props.element.strokeWidth / 2"
        :y="props.element.strokeWidth / 2"
        :width="Math.max(0, props.element.width - props.element.strokeWidth)"
        :height="Math.max(0, props.element.height - props.element.strokeWidth)"
        :stroke="props.element.stroke"
        :stroke-width="props.element.strokeWidth"
        :stroke-dasharray="dasharray"
        :fill="props.element.fill ?? 'none'"
      />
      <g v-else-if="props.element.shape === 'arrow'">
        <line
          :x1="0"
          :y1="props.element.height / 2"
          :x2="props.element.width - 10"
          :y2="props.element.height / 2"
          :stroke="props.element.stroke"
          :stroke-width="props.element.strokeWidth"
          :stroke-dasharray="dasharray"
        />
        <polygon
          :points="`${props.element.width},${props.element.height / 2} ${props.element.width - 12},${props.element.height / 2 - 6} ${props.element.width - 12},${props.element.height / 2 + 6}`"
          :fill="props.element.stroke"
        />
      </g>
    </svg>
  </div>
</template>
