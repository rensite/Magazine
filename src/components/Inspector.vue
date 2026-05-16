<script setup lang="ts">
import { computed } from 'vue'
import { useSpreadStore } from '@/stores/spreadStore'
import { isText, isImage, type TextElement, type SpreadElement, type ElementId } from '@/types/element'
import { rememberTextStyle } from '@/composables/useTextDefaults'
import { lookupFont } from '@/utils/fonts'
import { fitTextToFrame } from '@/utils/textFit'
import FontPicker from './FontPicker.vue'
import ColorPicker from './ColorPicker.vue'
import LayersPanel from './LayersPanel.vue'
import NumberField from './NumberField.vue'

const store = useSpreadStore()
const selected = computed(() => store.selected)
const all = computed<SpreadElement[]>(() => store.selectedAll)
const count = computed(() => store.selectedCount)

// Multi-text awareness: when 2+ text elements are selected, the entire
// Text section becomes a bulk editor that writes to every selected
// text element at once.
const texts = computed<TextElement[]>(() =>
  all.value.filter((e): e is TextElement => isText(e)),
)
const allText = computed(() => count.value > 0 && texts.value.length === count.value)

const textRef = computed<TextElement | null>(() => texts.value[0] ?? null)

const MIXED = Symbol('mixed')
const allSame = <T,>(arr: T[]): T | typeof MIXED => {
  if (arr.length === 0) return MIXED
  const first = arr[0]
  for (let i = 1; i < arr.length; i++) if (arr[i] !== first) return MIXED
  return first
}

const common = computed(() => {
  const arr = texts.value
  return {
    fontFamily: allSame(arr.map((t) => t.fontFamily)),
    fontSize: allSame(arr.map((t) => t.fontSize)),
    fontWeight: allSame(arr.map((t) => t.fontWeight ?? 400)),
    italic: allSame(arr.map((t) => !!t.italic)),
    underline: allSame(arr.map((t) => !!t.underline)),
    align: allSame(arr.map((t) => t.align)),
    lineHeight: allSame(arr.map((t) => t.lineHeight)),
    letterSpacing: allSame(arr.map((t) => t.letterSpacing ?? 0)),
    color: allSame(arr.map((t) => t.color)),
  }
})

const textIds = computed<ElementId[]>(() => texts.value.map((t) => t.id))

const patchTexts = (patch: Partial<TextElement>) => {
  if (textIds.value.length === 0) return
  store.updateMany(textIds.value, patch as Partial<SpreadElement>)
}

const setFontFamily = (name: string) => {
  patchTexts({ fontFamily: name })
  rememberTextStyle({ fontFamily: name })
}
const setFontSize = (v: number) => {
  if (!Number.isFinite(v)) return
  patchTexts({ fontSize: v })
  rememberTextStyle({ fontSize: v })
}
const setLineHeight = (v: number) => {
  if (!Number.isFinite(v)) return
  patchTexts({ lineHeight: v })
  rememberTextStyle({ lineHeight: v })
}
const setLetterSpacing = (v: number) => {
  patchTexts({ letterSpacing: Number.isFinite(v) ? v : 0 })
}
const setWeight = (w: number) => patchTexts({ fontWeight: w })
const toggleItalic = () => {
  // When mixed, force-italic on; otherwise toggle.
  const next = common.value.italic === MIXED ? true : !(common.value.italic as boolean)
  patchTexts({ italic: next })
}
const toggleUnderline = () => {
  const next = common.value.underline === MIXED ? true : !(common.value.underline as boolean)
  patchTexts({ underline: next })
}
const setAlign = (align: 'left' | 'center' | 'right') => {
  patchTexts({ align })
  rememberTextStyle({ align })
}
const setColor = (hex: string) => {
  patchTexts({ color: hex })
  rememberTextStyle({ color: hex })
}

const fitFrame = () => {
  if (textRef.value) store.fitFrameToText(textRef.value.id)
}
const fitText = () => {
  for (const t of texts.value) {
    const size = fitTextToFrame(t, t.width, t.height)
    store.fitTextToFrame(t.id, size)
  }
}

const setOpacity = (e: Event) => {
  const v = parseFloat((e.target as HTMLInputElement).value)
  if (!Number.isFinite(v)) return
  if (count.value === 0) return
  store.updateMany(store.selectedIds, { opacity: v })
}

const setPos = (axis: 'x' | 'y' | 'width' | 'height' | 'rotate', v: number) => {
  if (!selected.value || !Number.isFinite(v)) return
  store.updateElement(selected.value.id, { [axis]: v })
}

const availableWeights = computed(() => {
  const fam = common.value.fontFamily
  return fam !== MIXED ? lookupFont(fam as string).weights : [400, 700]
})

const opacityValue = computed(() => {
  if (count.value === 0) return 0
  const ops = all.value.map((e) => e.opacity)
  const v = allSame(ops)
  return v === MIXED ? all.value[0].opacity : (v as number)
})
const opacityMixed = computed(() => allSame(all.value.map((e) => e.opacity)) === MIXED)

const isMixed = (v: unknown) => v === MIXED
</script>

<template>
  <aside class="flex w-64 shrink-0 flex-col gap-4 overflow-y-auto border-l border-divider bg-ink-800 p-3 text-sm">
    <div v-if="count === 0" class="text-xs text-ink-400">Выберите элемент</div>

    <div v-if="count > 1" class="rounded bg-ink-700/60 px-2 py-1 text-[11px] text-ink-300">
      Выделено: <span class="text-ink-100">{{ count }}</span>
      <span v-if="allText" class="ml-2 text-accent">все текстовые</span>
    </div>

    <!-- Position: only when a single element is selected (multi
         resize/move via numeric fields is handled differently). -->
    <template v-if="count === 1 && selected">
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
    </template>

    <template v-if="count > 0">
      <section>
        <h3 class="mb-2 text-[10px] uppercase tracking-wide text-ink-400">Appearance</h3>
        <label class="flex items-center gap-2 text-xs text-ink-300">
          Opacity
          <input type="range" min="0" max="1" step="0.05" class="flex-1" :value="opacityValue" @input="setOpacity" />
          <span class="w-10 text-right tabular-nums" :class="opacityMixed ? 'text-ink-400' : ''">
            {{ opacityMixed ? '—' : `${Math.round(opacityValue * 100)}%` }}
          </span>
        </label>
      </section>
    </template>

    <!-- Text section: shown whenever every selected element is text.
         Bulk-applies to all of them. -->
    <template v-if="allText && textRef">
      <section>
        <h3 class="mb-2 flex items-center gap-2 text-[10px] uppercase tracking-wide text-ink-400">
          Text
          <span v-if="count > 1" class="rounded bg-accent/20 px-1.5 py-0.5 text-accent">x{{ count }}</span>
        </h3>
        <FontPicker :model-value="isMixed(common.fontFamily) ? '' : (common.fontFamily as string)" @update:model-value="setFontFamily" />
        <div v-if="isMixed(common.fontFamily)" class="mt-1 text-[10px] text-ink-500">шрифты разные</div>

        <div class="mt-2 flex flex-wrap items-center gap-1">
          <button
            v-for="w in availableWeights"
            :key="w"
            type="button"
            class="rounded px-2 py-1 text-[10px]"
            :class="!isMixed(common.fontWeight) && common.fontWeight === w ? 'bg-accent text-white' : 'bg-ink-700 text-ink-200 hover:bg-ink-600'"
            @click="setWeight(w)"
          >{{ w }}</button>
          <button
            type="button"
            class="rounded px-2 py-1 text-xs italic"
            :class="common.italic === true ? 'bg-accent text-white' : 'bg-ink-700 text-ink-200 hover:bg-ink-600'"
            @click="toggleItalic"
          >I</button>
          <button
            type="button"
            class="rounded px-2 py-1 text-xs underline"
            :class="common.underline === true ? 'bg-accent text-white' : 'bg-ink-700 text-ink-200 hover:bg-ink-600'"
            @click="toggleUnderline"
          >U</button>
        </div>

        <div class="mt-2 grid grid-cols-3 gap-1">
          <button type="button" class="rounded px-2 py-1 text-xs" :class="common.align === 'left' ? 'bg-accent text-white' : 'bg-ink-700 text-ink-200 hover:bg-ink-600'" @click="setAlign('left')">⟵</button>
          <button type="button" class="rounded px-2 py-1 text-xs" :class="common.align === 'center' ? 'bg-accent text-white' : 'bg-ink-700 text-ink-200 hover:bg-ink-600'" @click="setAlign('center')">↔</button>
          <button type="button" class="rounded px-2 py-1 text-xs" :class="common.align === 'right' ? 'bg-accent text-white' : 'bg-ink-700 text-ink-200 hover:bg-ink-600'" @click="setAlign('right')">⟶</button>
        </div>

        <div class="mt-2 grid grid-cols-2 gap-1.5">
          <NumberField
            label="Size"
            :min="4"
            :max="600"
            :model-value="isMixed(common.fontSize) ? 0 : (common.fontSize as number)"
            @update:model-value="setFontSize"
          />
          <NumberField
            label="Line"
            :min="0.6"
            :max="3"
            :step="0.05"
            :precision="2"
            :scrub-step="0.01"
            :model-value="isMixed(common.lineHeight) ? 0 : (common.lineHeight as number)"
            @update:model-value="setLineHeight"
          />
          <NumberField
            label="Track"
            :step="0.1"
            :precision="1"
            :scrub-step="0.1"
            :model-value="isMixed(common.letterSpacing) ? 0 : (common.letterSpacing as number)"
            @update:model-value="setLetterSpacing"
          />
          <div class="flex items-center justify-end">
            <ColorPicker
              :model-value="isMixed(common.color) ? '#000000' : (common.color as string)"
              @update:model-value="setColor"
            />
          </div>
        </div>

        <div class="mt-2 flex gap-1">
          <button type="button" class="flex-1 rounded bg-ink-700 px-2 py-1 text-xs text-ink-200 hover:bg-ink-600" @click="fitFrame">⤢ Frame</button>
          <button type="button" class="flex-1 rounded bg-ink-700 px-2 py-1 text-xs text-ink-200 hover:bg-ink-600" @click="fitText">⤡ Text</button>
        </div>
      </section>
    </template>

    <template v-if="count === 1 && selected && isImage(selected)">
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
