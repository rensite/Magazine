<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, toRef, watch } from 'vue'
import type { TextElement } from '@/types/element'
import { useSpreadStore } from '@/stores/spreadStore'
import { useElementTransform } from '@/composables/useElementTransform'
import { useDragResize } from '@/composables/useDragResize'
import { useCanvasPointer } from '@/composables/useCanvasPointer'
import { useStaticRender } from '@/composables/useStaticRender'

const props = defineProps<{ element: TextElement }>()
const store = useSpreadStore()
const drag = useDragResize()
const { pointerPos } = useCanvasPointer()
const isStatic = useStaticRender()
const editing = ref(false)
const rootRef = ref<HTMLDivElement | null>(null)

const elRef = toRef(props, 'element')
const { css } = useElementTransform(elRef)

const fontClass = computed(() => {
  switch (props.element.fontFamily) {
    case 'mono': return 'font-mono'
    case 'serif': return 'font-serif'
    case 'hand': return 'font-hand'
  }
})

const maxWidth = computed(() =>
  Math.min(store.schema.pages.left.width, store.schema.pages.right.width),
)

const styleObj = computed(() => {
  const base: Record<string, string | undefined> = {
    transform: css.value,
    transformOrigin: '0 0',
    fontSize: `${props.element.fontSize}px`,
    color: props.element.color,
    textAlign: props.element.align,
    lineHeight: String(props.element.lineHeight),
    opacity: String(props.element.opacity),
    minWidth: '8px',
    minHeight: '8px',
  }
  if (props.element.autoWidth) {
    base.maxWidth = `${maxWidth.value}px`
  } else {
    base.width = `${props.element.width}px`
  }
  return base
})

const measure = () => {
  const node = rootRef.value
  if (!node) return
  const w = Math.ceil(node.scrollWidth)
  const h = Math.ceil(node.scrollHeight)
  if (props.element.autoWidth) {
    store.setLayout(props.element.id, { width: w, height: h })
  } else {
    store.setLayout(props.element.id, { height: h })
  }
}

let ro: ResizeObserver | null = null
onMounted(() => {
  if (isStatic) return
  measure()
  if (typeof ResizeObserver !== 'undefined' && rootRef.value) {
    ro = new ResizeObserver(() => measure())
    ro.observe(rootRef.value)
  }
})
onBeforeUnmount(() => {
  ro?.disconnect()
  ro = null
})

if (!isStatic) {
  watch(
    () => [
      props.element.content,
      props.element.fontFamily,
      props.element.fontSize,
      props.element.lineHeight,
      props.element.autoWidth,
      props.element.width,
      maxWidth.value,
    ],
    () => requestAnimationFrame(measure),
  )
}

const onPointerDown = (e: PointerEvent) => {
  if (isStatic) return
  if (editing.value) return
  e.preventDefault()
  e.stopPropagation()
  store.select(props.element.id)
  drag.beginDrag({
    id: props.element.id,
    pointer: pointerPos(e),
    shift: e.shiftKey,
  })
}

const onDblClick = () => {
  if (isStatic) return
  editing.value = true
  requestAnimationFrame(() => {
    rootRef.value?.focus()
    const sel = window.getSelection()
    if (sel && rootRef.value) {
      const range = document.createRange()
      range.selectNodeContents(rootRef.value)
      sel.removeAllRanges()
      sel.addRange(range)
    }
  })
}

const onInput = () => {
  measure()
}

const onBlur = () => {
  if (!editing.value) return
  const next = rootRef.value?.innerText ?? ''
  editing.value = false
  if (next !== props.element.content) {
    store.updateElement(props.element.id, { content: next })
  }
}
</script>

<template>
  <div
    ref="rootRef"
    class="pointer-events-auto absolute left-0 top-0 inline-block select-none whitespace-pre-wrap break-words"
    :class="[fontClass, isStatic ? '' : (editing ? 'cursor-text' : 'cursor-move')]"
    :style="styleObj"
    :contenteditable="editing"
    @pointerdown="onPointerDown"
    @dblclick="onDblClick"
    @input="onInput"
    @blur="onBlur"
  >{{ props.element.content }}</div>
</template>
