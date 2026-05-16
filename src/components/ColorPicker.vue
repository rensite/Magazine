<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

const props = defineProps<{ modelValue: string }>()
const emit = defineEmits<{ (e: 'update:modelValue', value: string): void }>()

const open = ref(false)
const rootRef = ref<HTMLDivElement | null>(null)

const STORAGE_KEY = 'stan:recentColors'
const loadRecent = (): string[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as string[]).slice(0, 12) : []
  } catch {
    return []
  }
}
const recent = ref<string[]>(loadRecent())
const rememberColor = (hex: string) => {
  const next = [hex, ...recent.value.filter((c) => c.toLowerCase() !== hex.toLowerCase())].slice(0, 12)
  recent.value = next
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)) } catch { /* ignore */ }
}

const swatches = [
  '#000000', '#1a1410', '#3a3f49', '#6b7280', '#9ca3af', '#e5e7eb', '#ffffff',
  '#dc2626', '#ea580c', '#d4a85f', '#f59e0b', '#16a34a', '#0ea5e9', '#7c3aed', '#db2777',
]

const hex = ref(props.modelValue || '#000000')
watch(() => props.modelValue, (v) => { if (v && v !== hex.value) hex.value = v })

const hsv = ref(hexToHsv(hex.value))

function hexToRgb(h: string): { r: number; g: number; b: number } | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(h.trim())
  if (!m) return null
  const n = parseInt(m[1], 16)
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
}
function rgbToHex(r: number, g: number, b: number): string {
  const to = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0')
  return `#${to(r)}${to(g)}${to(b)}`
}
function rgbToHsv(r: number, g: number, b: number) {
  r /= 255; g /= 255; b /= 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  const d = max - min
  let h = 0
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6
    else if (max === g) h = (b - r) / d + 2
    else h = (r - g) / d + 4
    h *= 60
    if (h < 0) h += 360
  }
  const s = max === 0 ? 0 : d / max
  const v = max
  return { h, s, v }
}
function hsvToRgb(h: number, s: number, v: number) {
  const c = v * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = v - c
  let r = 0, g = 0, b = 0
  if (h < 60) { r = c; g = x }
  else if (h < 120) { r = x; g = c }
  else if (h < 180) { g = c; b = x }
  else if (h < 240) { g = x; b = c }
  else if (h < 300) { r = x; b = c }
  else { r = c; b = x }
  return { r: (r + m) * 255, g: (g + m) * 255, b: (b + m) * 255 }
}
function hexToHsv(h: string) {
  const rgb = hexToRgb(h)
  if (!rgb) return { h: 0, s: 0, v: 0 }
  return rgbToHsv(rgb.r, rgb.g, rgb.b)
}

const hueBgColor = computed(() => {
  const { r, g, b } = hsvToRgb(hsv.value.h, 1, 1)
  return rgbToHex(r, g, b)
})

const emitFromHsv = () => {
  const { r, g, b } = hsvToRgb(hsv.value.h, hsv.value.s, hsv.value.v)
  const h = rgbToHex(r, g, b)
  hex.value = h
  emit('update:modelValue', h)
}

const svRef = ref<HTMLDivElement | null>(null)
const isPickingSV = ref(false)
const pickSV = (e: PointerEvent) => {
  const el = svRef.value
  if (!el) return
  const rect = el.getBoundingClientRect()
  const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left))
  const y = Math.max(0, Math.min(rect.height, e.clientY - rect.top))
  hsv.value = { h: hsv.value.h, s: x / rect.width, v: 1 - y / rect.height }
  emitFromHsv()
}
const onSVPointerDown = (e: PointerEvent) => {
  isPickingSV.value = true
  pickSV(e)
  ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
}
const onSVPointerMove = (e: PointerEvent) => {
  if (!isPickingSV.value) return
  pickSV(e)
}
const onSVPointerUp = () => { isPickingSV.value = false }

const onHueInput = (e: Event) => {
  hsv.value = { ...hsv.value, h: parseFloat((e.target as HTMLInputElement).value) }
  emitFromHsv()
}

const onHexInput = (e: Event) => {
  const v = (e.target as HTMLInputElement).value.trim()
  const rgb = hexToRgb(v)
  if (!rgb) return
  const norm = rgbToHex(rgb.r, rgb.g, rgb.b)
  hex.value = norm
  hsv.value = rgbToHsv(rgb.r, rgb.g, rgb.b)
  emit('update:modelValue', norm)
}

const supportsEyedropper = typeof window !== 'undefined' && 'EyeDropper' in window
const pickWithEyedropper = async () => {
  type EDR = { open: () => Promise<{ sRGBHex: string }> }
  type EDC = new () => EDR
  const Ctor = (window as unknown as { EyeDropper?: EDC }).EyeDropper
  if (!Ctor) return
  try {
    const res = await new Ctor().open()
    onHexInput({ target: { value: res.sRGBHex } } as unknown as Event)
  } catch { /* user cancelled */ }
}

const apply = (h: string) => {
  hex.value = h
  hsv.value = hexToHsv(h)
  emit('update:modelValue', h)
}

const close = () => {
  if (open.value) {
    rememberColor(hex.value)
    open.value = false
  }
}
const toggle = () => { open.value ? close() : (open.value = true) }

const onDocClick = (e: MouseEvent) => {
  if (!open.value) return
  if (rootRef.value && !rootRef.value.contains(e.target as Node)) close()
}
onMounted(() => window.addEventListener('mousedown', onDocClick))
onBeforeUnmount(() => window.removeEventListener('mousedown', onDocClick))
</script>

<template>
  <div ref="rootRef" class="relative inline-block">
    <button
      type="button"
      class="h-8 w-8 cursor-pointer rounded border border-ink-600"
      :style="{ background: hex }"
      :title="hex"
      @click="toggle"
    />
    <div
      v-if="open"
      class="absolute right-0 top-9 z-50 w-60 rounded border border-ink-600 bg-ink-800 p-3 shadow-lg"
    >
      <div
        ref="svRef"
        class="relative h-32 w-full cursor-crosshair rounded"
        :style="{
          background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, ${hueBgColor})`,
        }"
        @pointerdown="onSVPointerDown"
        @pointermove="onSVPointerMove"
        @pointerup="onSVPointerUp"
        @pointercancel="onSVPointerUp"
      >
        <div
          class="absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow"
          :style="{
            left: `${hsv.s * 100}%`,
            top: `${(1 - hsv.v) * 100}%`,
            background: hex,
          }"
        />
      </div>

      <input
        type="range"
        min="0"
        max="360"
        step="1"
        class="mt-2 w-full"
        :value="hsv.h"
        @input="onHueInput"
        :style="{
          background: 'linear-gradient(to right, #ff0000, #ffff00, #00ff00, #00ffff, #0000ff, #ff00ff, #ff0000)',
        }"
      />

      <div class="mt-2 flex items-center gap-2">
        <input
          type="text"
          class="w-24 rounded bg-ink-700 px-2 py-1 font-mono text-xs text-ink-100"
          :value="hex"
          @change="onHexInput"
        />
        <button
          v-if="supportsEyedropper"
          type="button"
          class="rounded bg-ink-700 px-2 py-1 text-xs text-ink-200 hover:bg-ink-600"
          title="Pick from screen"
          @click="pickWithEyedropper"
        >⌖</button>
      </div>

      <div class="mt-2 grid grid-cols-8 gap-1">
        <button
          v-for="s in swatches"
          :key="s"
          type="button"
          class="h-5 w-5 rounded border border-ink-600"
          :style="{ background: s }"
          @click="apply(s)"
        />
      </div>

      <div v-if="recent.length" class="mt-2">
        <div class="mb-1 text-[10px] uppercase tracking-wide text-ink-400">Recent</div>
        <div class="grid grid-cols-8 gap-1">
          <button
            v-for="c in recent"
            :key="c"
            type="button"
            class="h-5 w-5 rounded border border-ink-600"
            :style="{ background: c }"
            @click="apply(c)"
          />
        </div>
      </div>
    </div>
  </div>
</template>
