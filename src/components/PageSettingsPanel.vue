<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useSpreadStore } from '@/stores/spreadStore'
import { fromPx, toPx, UNIT_SUFFIX } from '@/utils/units'
import { PAGE_PRESETS, matchPreset, presetById, presetToPx } from '@/utils/pagePresets'
import type { Margins, Orientation, PageSide, Unit } from '@/types/element'

const store = useSpreadStore()

const unit = computed(() => store.schema.units)
const left = computed(() => store.schema.pages.left)
const right = computed(() => store.schema.pages.right)
const editingSide = ref<PageSide>('left')

const currentPage = computed(() => store.schema.pages[editingSide.value])

const presetIdInUse = computed(() => {
  const m = matchPreset(currentPage.value.width, currentPage.value.height)
  return m?.id ?? 'custom'
})

const inUnit = (px: number) => Number(fromPx(px, unit.value).toFixed(2))

const widthIn = computed({
  get: () => inUnit(currentPage.value.width),
  set: (v) => store.setPageSize(store.schema.mirrorPages ? 'both' : editingSide.value, toPx(Number(v), unit.value), currentPage.value.height),
})
const heightIn = computed({
  get: () => inUnit(currentPage.value.height),
  set: (v) => store.setPageSize(store.schema.mirrorPages ? 'both' : editingSide.value, currentPage.value.width, toPx(Number(v), unit.value)),
})

const linkedMargins = ref(true)

const setMargin = (key: keyof Margins, valueInUnit: number) => {
  const px = toPx(valueInUnit, unit.value)
  if (linkedMargins.value) {
    store.setMargins(store.schema.mirrorPages ? 'both' : editingSide.value, {
      top: px,
      right: px,
      bottom: px,
      left: px,
    })
  } else {
    store.setMargins(store.schema.mirrorPages ? 'both' : editingSide.value, { [key]: px })
  }
}

const onPreset = (e: Event) => {
  const id = (e.target as HTMLSelectElement).value
  if (id === 'custom') return
  const preset = presetById(id)
  if (!preset) return
  const { width, height } = presetToPx(preset)
  const oriented =
    store.schema.orientation === 'landscape' && height < width
      ? { width: height, height: width }
      : { width, height }
  store.setPageSize(store.schema.mirrorPages ? 'both' : editingSide.value, oriented.width, oriented.height)
}

const setOrientation = (o: Orientation) => store.setOrientation(o)
const setUnit = (u: Unit) => store.setUnits(u)

const bleedIn = computed({
  get: () => inUnit(currentPage.value.bleed),
  set: (v) => store.setBleed(toPx(Number(v), unit.value)),
})
const gutterIn = computed({
  get: () => inUnit(store.schema.gutter),
  set: (v) => store.setGutter(toPx(Number(v), unit.value)),
})

const bg = computed(() => store.schema.background)

watch(
  () => store.schema.mirrorPages,
  (v) => {
    if (v) editingSide.value = 'left'
  },
)
</script>

<template>
  <aside class="flex h-full w-72 shrink-0 flex-col gap-4 overflow-y-auto border-l border-ink-700 bg-ink-800 p-4 text-sm text-ink-100">
    <h2 class="font-serif italic text-accent">Page</h2>

    <section class="flex flex-col gap-2">
      <label class="text-xs text-ink-300">Preset</label>
      <select
        class="rounded bg-ink-700 px-2 py-1"
        :value="presetIdInUse"
        @change="onPreset"
      >
        <option v-for="p in PAGE_PRESETS" :key="p.id" :value="p.id">{{ p.label }}</option>
        <option value="custom">Custom</option>
      </select>
    </section>

    <section class="flex flex-col gap-2">
      <label class="text-xs text-ink-300">Units</label>
      <div class="flex gap-1">
        <button
          v-for="u in (['mm', 'px', 'in'] as Unit[])"
          :key="u"
          class="flex-1 rounded px-2 py-1 text-xs"
          :class="unit === u ? 'bg-accent text-ink-900' : 'bg-ink-700 hover:bg-ink-600'"
          @click="setUnit(u)"
        >{{ u }}</button>
      </div>
    </section>

    <section class="flex flex-col gap-2">
      <label class="text-xs text-ink-300">Orientation</label>
      <div class="flex gap-1">
        <button
          class="flex-1 rounded px-2 py-1 text-xs"
          :class="store.schema.orientation === 'portrait' ? 'bg-accent text-ink-900' : 'bg-ink-700 hover:bg-ink-600'"
          @click="setOrientation('portrait')"
        >Portrait</button>
        <button
          class="flex-1 rounded px-2 py-1 text-xs"
          :class="store.schema.orientation === 'landscape' ? 'bg-accent text-ink-900' : 'bg-ink-700 hover:bg-ink-600'"
          @click="setOrientation('landscape')"
        >Landscape</button>
      </div>
    </section>

    <section class="flex flex-col gap-2">
      <div class="flex items-center justify-between">
        <label class="text-xs text-ink-300">Editing</label>
        <label class="flex items-center gap-1 text-xs text-ink-300">
          <input type="checkbox" :checked="store.schema.mirrorPages" @change="store.setMirrorPages(($event.target as HTMLInputElement).checked)" />
          mirror
        </label>
      </div>
      <div class="flex gap-1">
        <button
          class="flex-1 rounded px-2 py-1 text-xs"
          :class="editingSide === 'left' ? 'bg-accent text-ink-900' : 'bg-ink-700 hover:bg-ink-600'"
          :disabled="store.schema.mirrorPages"
          @click="editingSide = 'left'"
        >Left</button>
        <button
          class="flex-1 rounded px-2 py-1 text-xs"
          :class="editingSide === 'right' ? 'bg-accent text-ink-900' : 'bg-ink-700 hover:bg-ink-600'"
          :disabled="store.schema.mirrorPages"
          @click="editingSide = 'right'"
        >Right</button>
      </div>
    </section>

    <section class="grid grid-cols-2 gap-2">
      <label class="flex flex-col gap-1 text-xs text-ink-300">
        Width ({{ UNIT_SUFFIX[unit] }})
        <input class="rounded bg-ink-700 px-2 py-1 text-ink-100" type="number" step="0.1" v-model.number="widthIn" />
      </label>
      <label class="flex flex-col gap-1 text-xs text-ink-300">
        Height ({{ UNIT_SUFFIX[unit] }})
        <input class="rounded bg-ink-700 px-2 py-1 text-ink-100" type="number" step="0.1" v-model.number="heightIn" />
      </label>
    </section>

    <section class="flex flex-col gap-2">
      <div class="flex items-center justify-between">
        <span class="text-xs text-ink-300">Margins ({{ UNIT_SUFFIX[unit] }})</span>
        <label class="flex items-center gap-1 text-xs text-ink-300">
          <input type="checkbox" v-model="linkedMargins" />
          linked
        </label>
      </div>
      <div class="grid grid-cols-2 gap-2">
        <label class="flex flex-col gap-1 text-xs text-ink-400">
          Top
          <input class="rounded bg-ink-700 px-2 py-1 text-ink-100" type="number" step="0.5"
            :value="inUnit(currentPage.margins.top)"
            @change="setMargin('top', Number(($event.target as HTMLInputElement).value))" />
        </label>
        <label class="flex flex-col gap-1 text-xs text-ink-400">
          Right
          <input class="rounded bg-ink-700 px-2 py-1 text-ink-100" type="number" step="0.5"
            :disabled="linkedMargins"
            :value="inUnit(currentPage.margins.right)"
            @change="setMargin('right', Number(($event.target as HTMLInputElement).value))" />
        </label>
        <label class="flex flex-col gap-1 text-xs text-ink-400">
          Bottom
          <input class="rounded bg-ink-700 px-2 py-1 text-ink-100" type="number" step="0.5"
            :disabled="linkedMargins"
            :value="inUnit(currentPage.margins.bottom)"
            @change="setMargin('bottom', Number(($event.target as HTMLInputElement).value))" />
        </label>
        <label class="flex flex-col gap-1 text-xs text-ink-400">
          Left
          <input class="rounded bg-ink-700 px-2 py-1 text-ink-100" type="number" step="0.5"
            :disabled="linkedMargins"
            :value="inUnit(currentPage.margins.left)"
            @change="setMargin('left', Number(($event.target as HTMLInputElement).value))" />
        </label>
      </div>
    </section>

    <section class="grid grid-cols-2 gap-2">
      <label class="flex flex-col gap-1 text-xs text-ink-300">
        Bleed ({{ UNIT_SUFFIX[unit] }})
        <input class="rounded bg-ink-700 px-2 py-1 text-ink-100" type="number" step="0.5" v-model.number="bleedIn" />
      </label>
      <label class="flex flex-col gap-1 text-xs text-ink-300">
        Gutter ({{ UNIT_SUFFIX[unit] }})
        <input class="rounded bg-ink-700 px-2 py-1 text-ink-100" type="number" step="0.5" v-model.number="gutterIn" />
      </label>
    </section>

    <section class="flex flex-col gap-2">
      <span class="text-xs text-ink-300">Background</span>
      <div class="flex gap-1">
        <button v-for="t in (['paper', 'plain', 'image'] as const)" :key="t"
          class="flex-1 rounded px-2 py-1 text-xs"
          :class="bg.type === t ? 'bg-accent text-ink-900' : 'bg-ink-700 hover:bg-ink-600'"
          @click="store.setBackground({ type: t })"
        >{{ t }}</button>
      </div>
      <input
        v-if="bg.type === 'plain'"
        type="color"
        class="h-9 w-full cursor-pointer rounded border border-ink-600 bg-transparent"
        :value="bg.color ?? '#f5efe2'"
        @input="store.setBackground({ color: ($event.target as HTMLInputElement).value })"
      />
    </section>

    <section>
      <label class="flex items-center gap-2 text-xs text-ink-300">
        <input type="checkbox" :checked="store.schema.showGuides" @change="store.toggleGuides()" />
        Show guides
      </label>
    </section>
  </aside>
</template>
