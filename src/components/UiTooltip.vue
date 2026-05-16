<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue'

const props = withDefaults(defineProps<{
  text: string
  hotkey?: string
  delay?: number
  placement?: 'top' | 'bottom'
}>(), { delay: 400, placement: 'top' })

const wrapperRef = ref<HTMLElement | null>(null)
const visible = ref(false)
const coords = ref({ x: 0, y: 0 })
let timer: number | null = null

const show = () => {
  if (timer !== null) return
  timer = window.setTimeout(() => {
    const el = wrapperRef.value
    if (!el) return
    const rect = el.getBoundingClientRect()
    coords.value = {
      x: rect.left + rect.width / 2,
      y: props.placement === 'top' ? rect.top : rect.bottom,
    }
    visible.value = true
    timer = null
  }, props.delay)
}
const hide = () => {
  if (timer !== null) { clearTimeout(timer); timer = null }
  visible.value = false
}

onBeforeUnmount(hide)
</script>

<template>
  <span
    ref="wrapperRef"
    @mouseenter="show"
    @mouseleave="hide"
    @focusin="show"
    @focusout="hide"
    @pointerdown="hide"
  >
    <slot />
  </span>
  <Teleport to="body">
    <Transition
      enter-active-class="transition duration-100 ease-out"
      leave-active-class="transition duration-75 ease-in"
      enter-from-class="opacity-0 translate-y-1"
      enter-to-class="opacity-100 translate-y-0"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
    >
      <div
        v-if="visible"
        class="pointer-events-none fixed z-[100] -translate-x-1/2 rounded bg-ink-900/95 px-2 py-1 text-[11px] text-ink-100 shadow ring-1 ring-white/5"
        :class="placement === 'top' ? '-translate-y-[calc(100%+6px)]' : 'translate-y-2'"
        :style="{ left: `${coords.x}px`, top: `${coords.y}px` }"
      >
        <span>{{ text }}</span>
        <span v-if="hotkey" class="ml-2 text-[10px] text-ink-400">{{ hotkey }}</span>
      </div>
    </Transition>
  </Teleport>
</template>
