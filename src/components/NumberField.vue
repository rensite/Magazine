<script setup lang="ts">
import { computed, ref, watch } from 'vue'

const props = withDefaults(defineProps<{
  modelValue: number
  label?: string
  min?: number
  max?: number
  step?: number
  precision?: number
  unit?: string
  /** Per-pixel scrub increment. Default = step (or 1). */
  scrubStep?: number
}>(), { step: 1, precision: 0 })

const emit = defineEmits<{ (e: 'update:modelValue', v: number): void }>()

const inputRef = ref<HTMLInputElement | null>(null)
const local = ref(formatNum(props.modelValue))
const scrubbing = ref(false)

watch(() => props.modelValue, (v) => {
  if (document.activeElement !== inputRef.value) local.value = formatNum(v)
})

function formatNum(v: number): string {
  const p = props.precision ?? 0
  return Number.isFinite(v) ? (p > 0 ? v.toFixed(p) : String(Math.round(v))) : ''
}

const clamp = (v: number): number => {
  if (props.min !== undefined && v < props.min) return props.min
  if (props.max !== undefined && v > props.max) return props.max
  return v
}

const commit = (raw: string) => {
  const trimmed = raw.trim()
  if (!trimmed) return
  // math expression with + - * / ( ) digits and optional unit suffix
  const cleaned = trimmed.replace(/(mm|px|in|%)$/i, '').replace(/,/g, '.').trim()
  if (!/^[\d+\-*/().\s]+$/.test(cleaned)) {
    local.value = formatNum(props.modelValue)
    return
  }
  let result: number
  try {
    // eslint-disable-next-line no-new-func
    result = Function(`"use strict";return (${cleaned})`)() as number
  } catch {
    local.value = formatNum(props.modelValue)
    return
  }
  if (!Number.isFinite(result)) {
    local.value = formatNum(props.modelValue)
    return
  }
  const next = clamp(result)
  local.value = formatNum(next)
  if (next !== props.modelValue) emit('update:modelValue', next)
}

const onChange = (e: Event) => commit((e.target as HTMLInputElement).value)

const onKeyDown = (e: KeyboardEvent) => {
  if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
    e.preventDefault()
    const dir = e.key === 'ArrowUp' ? 1 : -1
    const factor = e.shiftKey ? 10 : e.altKey ? 0.1 : 1
    const next = clamp(props.modelValue + dir * props.step * factor)
    local.value = formatNum(next)
    if (next !== props.modelValue) emit('update:modelValue', next)
  } else if (e.key === 'Enter') {
    commit(local.value)
    inputRef.value?.blur()
  } else if (e.key === 'Escape') {
    local.value = formatNum(props.modelValue)
    inputRef.value?.blur()
  }
}

const onLabelPointerDown = (e: PointerEvent) => {
  if (e.button !== 0) return
  e.preventDefault()
  scrubbing.value = true
  const startX = e.clientX
  const startValue = props.modelValue
  const target = e.currentTarget as HTMLElement
  target.setPointerCapture(e.pointerId)
  let moved = 0
  const onMove = (ev: PointerEvent) => {
    const dx = ev.clientX - startX
    moved = Math.max(moved, Math.abs(dx))
    const stepValue = props.scrubStep ?? props.step
    const factor = ev.shiftKey ? 10 : ev.altKey ? 0.1 : 1
    const next = clamp(startValue + dx * stepValue * factor)
    if (next !== props.modelValue) {
      local.value = formatNum(next)
      emit('update:modelValue', next)
    }
  }
  const onUp = (ev: PointerEvent) => {
    scrubbing.value = false
    target.removeEventListener('pointermove', onMove)
    target.removeEventListener('pointerup', onUp)
    target.removeEventListener('pointercancel', onUp)
    try { target.releasePointerCapture(ev.pointerId) } catch { /* ignore */ }
    if (moved < 3) inputRef.value?.focus()
  }
  target.addEventListener('pointermove', onMove)
  target.addEventListener('pointerup', onUp)
  target.addEventListener('pointercancel', onUp)
}

const displayValue = computed(() => formatNum(props.modelValue))
watch(displayValue, (v) => { if (document.activeElement !== inputRef.value) local.value = v })
</script>

<template>
  <label class="flex items-center gap-1.5 rounded bg-ink-600 px-1.5 py-0.5 focus-within:ring-1 focus-within:ring-accent">
    <span
      v-if="label"
      class="select-none text-[10px] uppercase tracking-wide text-ink-400 hover:text-ink-200"
      :style="{ cursor: scrubbing ? 'ew-resize' : 'ew-resize' }"
      @pointerdown="onLabelPointerDown"
    >{{ label }}</span>
    <input
      ref="inputRef"
      type="text"
      inputmode="decimal"
      class="w-full bg-transparent text-right text-[11px] tabular-nums text-ink-100 outline-none placeholder:text-ink-500"
      :value="local"
      @input="(e) => local = (e.target as HTMLInputElement).value"
      @change="onChange"
      @keydown="onKeyDown"
      @focus="(e) => (e.target as HTMLInputElement).select()"
    />
    <span v-if="unit" class="select-none text-[10px] text-ink-400">{{ unit }}</span>
  </label>
</template>
