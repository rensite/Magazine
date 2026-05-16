<script setup lang="ts">
import { computed } from 'vue'
import { useSpreadStore } from '@/stores/spreadStore'
import { isText, isImage, type TextElement } from '@/types/element'
import { rememberTextStyle } from '@/composables/useTextDefaults'
import { lookupFont } from '@/utils/fonts'
import { fitTextToFrame } from '@/utils/textFit'
import FontPicker from './FontPicker.vue'
import ColorPicker from './ColorPicker.vue'
import LayersPanel from './LayersPanel.vue'
import NumberField from './NumberField.vue'

const store = useSpreadStore()
const selected = computed(() => store.selected)
const textSelected = computed<TextElement | null>(() => {
  const s = selected.value
  return s && isText(s) ? s : null
})

const setFontFamily = (name: string) => {
  if (!textSelected.value) return
  store.updateElement(textSelected.value.id, { fontFamily: name })
  rememberTextStyle({ fontFamily: name })
}

const setFontSize = (v: number) => {
  if (!textSelected.value || !Number.isFinite(v)) return
  store.updateElement(textSelected.value.id, { fontSize: v })
  rememberTextStyle({ fontSize: v })
}

const setLineHeight = (v: number) => {
  if (!textSelected.value || !Number.isFinite(v)) return
  store.updateElement(textSelected.value.id, { lineHeight: v })
  rememberTextStyle({ lineHeight: v })
}

const setLetterSpacing = (v: number) => {
  if (!textSelected.value) return
  store.updateElement(textSelected.value.id, { letterSpacing: Number.isFinite(v) ? v : 0 })
}

const setWeight = (w: number) => {
  if (!textSelected.value) return
  store.updateElement(textSelected.value.id, { fontWeight: w })
}

const toggleItalic = () => {
  if (!textSelected.value) return
  store.updateElement(textSelected.value.id, { italic: !textSelected.value.italic })
}

const toggleUnderline = () => {
  if (!textSelected.value) return
  store.updateElement(textSelected.value.id, { underline: !textSelected.value.underline })
}

const setAlign = (align: 'left' | 'center' | 'right') => {
  if (!textSelected.value) return
  store.updateElement(textSelected.value.id, { align })
  rememberTextStyle({ align })
}

const setColor = (hex: string) => {
  if (!textSelected.value) return
  store.updateElement(textSelected.value.id, { color: hex })
  rememberTextStyle({ color: hex })
}

const fitFrame = () => {
  if (textSelected.value) store.fitFrameToText(textSelected.value.id)
}

const fitText = () => {
  const t = textSelected.value
  if (!t) return
  const size = fitTextToFrame(t, t.width, t.height)
  store.fitTextToFrame(t.id, size)
}

const setOpacity = (e: Event) => {
  if (!selected.value) return
  store.updateElement(selected.value.id, { opacity: parseFloat((e.target as HTMLInputElement).value) })
}

const setPos = (axis: 'x' | 'y' | 'width' | 'height' | 'rotate', v: number) => {
  if (!selected.value || !Number.isFinite(v)) return
  store.updateElement(selected.value.id, { [axis]: v })
}

const availableWeights = computed(() => {
  if (!textSelected.value) return [400, 700]
  return lookupFont(textSelected.value.fontFamily).weights
})
</script>

<template>
  <aside class="flex w-64 shrink-0 flex-col gap-4 overflow-y-auto border-l border-ink-700 bg-ink-800 p-3 text-sm">
    <div v-if="!selected" class="text-xs text-ink-400">Выберите элемент</div>

    <template v-if="selected">
      <section>
        <h3 class="mb-2 text-[10px] uppercase tracking-wide text-ink-400">Position</h3>
        <div class="grid grid-cols-2 gap-1.5">
          <NumberField label="X" :model-value="selected.x" @update:model-value="(v) => setPos('x', v)" />
          <NumberField label="Y" :model-value="selected.y" @update:model-value="(v) => setPos('y', v)" />
          <NumberField label="W" :min="1" :model-value="selected.width" @update:model-value="(v) => setPos('width', v)" />
          <NumberField label="H" :min="1" :model-value="selected.height" @update:model-value="(v) => setPos('height', v)" />
          <NumberField class="col-span-2" label="↻" :model-value="selected.rotate" unit="°" @update:model-value="(v) => setPos('rotate', v)" />
        </div>
      </section>

      <section>
        <h3 class="mb-2 text-[10px] uppercase tracking-wide text-ink-400">Appearance</h3>
        <label class="flex items-center gap-2 text-xs text-ink-300">
          Opacity
          <input type="range" min="0" max="1" step="0.05" class="flex-1" :value="selected.opacity" @input="setOpacity" />
          <span class="w-8 text-right">{{ Math.round(selected.opacity * 100) }}%</span>
        </label>
      </section>
    </template>

    <template v-if="textSelected">
      <section>
        <h3 class="mb-2 text-[10px] uppercase tracking-wide text-ink-400">Font</h3>
        <FontPicker :model-value="textSelected.fontFamily" @update:model-value="setFontFamily" />

        <div class="mt-2 flex flex-wrap items-center gap-1">
          <button
            v-for="w in availableWeights"
            :key="w"
            type="button"
            class="rounded px-2 py-1 text-[10px]"
            :class="(textSelected.fontWeight ?? 400) === w ? 'bg-accent text-white' : 'bg-ink-700 text-ink-200 hover:bg-ink-600'"
            @click="setWeight(w)"
          >{{ w }}</button>
          <button
            type="button"
            class="rounded px-2 py-1 text-xs italic"
            :class="textSelected.italic ? 'bg-accent text-white' : 'bg-ink-700 text-ink-200 hover:bg-ink-600'"
            @click="toggleItalic"
          >I</button>
          <button
            type="button"
            class="rounded px-2 py-1 text-xs underline"
            :class="textSelected.underline ? 'bg-accent text-white' : 'bg-ink-700 text-ink-200 hover:bg-ink-600'"
            @click="toggleUnderline"
          >U</button>
        </div>

        <div class="mt-2 grid grid-cols-3 gap-1">
          <button type="button" class="rounded px-2 py-1 text-xs" :class="textSelected.align === 'left' ? 'bg-accent text-white' : 'bg-ink-700 text-ink-200 hover:bg-ink-600'" @click="setAlign('left')">⟵</button>
          <button type="button" class="rounded px-2 py-1 text-xs" :class="textSelected.align === 'center' ? 'bg-accent text-white' : 'bg-ink-700 text-ink-200 hover:bg-ink-600'" @click="setAlign('center')">↔</button>
          <button type="button" class="rounded px-2 py-1 text-xs" :class="textSelected.align === 'right' ? 'bg-accent text-white' : 'bg-ink-700 text-ink-200 hover:bg-ink-600'" @click="setAlign('right')">⟶</button>
        </div>

        <div class="mt-2 grid grid-cols-2 gap-1.5">
          <NumberField label="Size" :min="4" :max="600" :model-value="textSelected.fontSize" @update:model-value="setFontSize" />
          <NumberField label="Line" :min="0.6" :max="3" :step="0.05" :precision="2" :scrub-step="0.01" :model-value="textSelected.lineHeight" @update:model-value="setLineHeight" />
          <NumberField label="Track" :step="0.1" :precision="1" :scrub-step="0.1" :model-value="textSelected.letterSpacing ?? 0" @update:model-value="setLetterSpacing" />
          <div class="flex items-center justify-end">
            <ColorPicker :model-value="textSelected.color" @update:model-value="setColor" />
          </div>
        </div>

        <div class="mt-2 flex gap-1">
          <button type="button" class="flex-1 rounded bg-ink-700 px-2 py-1 text-xs text-ink-200 hover:bg-ink-600" @click="fitFrame" title="Frame ← Text">⤢ Frame</button>
          <button type="button" class="flex-1 rounded bg-ink-700 px-2 py-1 text-xs text-ink-200 hover:bg-ink-600" @click="fitText" title="Text → Frame">⤡ Text</button>
        </div>
      </section>
    </template>

    <template v-if="selected && isImage(selected)">
      <section>
        <h3 class="mb-2 text-[10px] uppercase tracking-wide text-ink-400">Image</h3>
        <button type="button" class="w-full rounded bg-ink-700 px-2 py-1 text-xs text-ink-200 hover:bg-ink-600" @click="store.resetTransform(selected.id)">
          Reset rotation + aspect
        </button>
      </section>
    </template>

    <LayersPanel />
  </aside>
</template>
