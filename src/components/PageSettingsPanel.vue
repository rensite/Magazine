<script setup lang="ts">
import { computed, inject, ref, watch } from 'vue'
import { useSpreadStore } from '@/stores/spreadStore'
import { useAuthStore } from '@/stores/authStore'
import { fromPx, toPx, UNIT_SUFFIX } from '@/utils/units'
import { PAGE_PRESETS, matchPreset, presetById, presetToPx } from '@/utils/pagePresets'
import { prepareLocalImage, uploadImage } from '@/services/imageUpload'
import type { Margins, Orientation, PageSide, Unit } from '@/types/element'
import ColorPicker from './ColorPicker.vue'

const store = useSpreadStore()

const unit = computed(() => store.schema.units)
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
const auth = useAuthStore()
const bgFileInput = ref<HTMLInputElement | null>(null)
const bgUploading = ref(false)
const bgUploadError = ref<string | null>(null)

// Paper-friendly background presets — a curated palette that prints
// well (no oversaturated tones). The "current" swatch wins focus when
// it matches one of these, otherwise hex stays free-form.
const BG_PRESETS: string[] = [
  '#f5efe2', '#faf6ee', '#ffffff', '#f1eee9', '#ece5d3',
  '#1a1410', '#0f1115', '#23272f', '#2e1a16', '#0c2030',
  '#fae3c8', '#fbd1ba', '#f6c6c4', '#d8e6cf', '#cfe2e8',
]

const urlMap = inject<Record<string, string>>('imageUrls', {})
const resolveUrl = (path: string | undefined): string => {
  if (!path) return ''
  if (/^(data:|blob:|https?:\/\/|\/)/.test(path)) return path
  return urlMap[path] ?? ''
}
const bgImagePreview = computed(() => resolveUrl(bg.value.imageSrc))

const onPickBgImage = () => bgFileInput.value?.click()

const onBgFile = async (e: Event) => {
  const target = e.target as HTMLInputElement
  const file = target.files?.[0]
  if (!file) return
  bgUploading.value = true
  bgUploadError.value = null
  try {
    let result
    if (auth.user?.id && store.spreadId) {
      try {
        result = await uploadImage(file, auth.user.id, store.spreadId)
      } catch (err) {
        console.warn('Background upload to storage failed, falling back to local data URL', err)
        result = await prepareLocalImage(file)
      }
    } else {
      result = await prepareLocalImage(file)
    }
    store.setBackground({ type: 'image', imageSrc: result.src })
  } catch (err) {
    bgUploadError.value = (err as Error).message
  } finally {
    bgUploading.value = false
    target.value = ''
  }
}

const clearBgImage = () => {
  store.setBackground({ type: 'plain', imageSrc: undefined })
}

watch(
  () => store.schema.mirrorPages,
  (v) => {
    if (v) editingSide.value = 'left'
  },
)
</script>

<template>
  <aside class="flex h-full w-72 shrink-0 flex-col gap-4 overflow-y-auto border-l border-ink-700 bg-ink-800 p-4 text-sm text-ink-100">
    <h2 class="font-serif italic text-gold">Page</h2>

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
          :class="unit === u ? 'bg-accent text-white' : 'bg-ink-700 hover:bg-ink-600'"
          @click="setUnit(u)"
        >{{ u }}</button>
      </div>
    </section>

    <section class="flex flex-col gap-2">
      <label class="text-xs text-ink-300">Orientation</label>
      <div class="flex gap-1">
        <button
          class="flex-1 rounded px-2 py-1 text-xs"
          :class="store.schema.orientation === 'portrait' ? 'bg-accent text-white' : 'bg-ink-700 hover:bg-ink-600'"
          @click="setOrientation('portrait')"
        >Portrait</button>
        <button
          class="flex-1 rounded px-2 py-1 text-xs"
          :class="store.schema.orientation === 'landscape' ? 'bg-accent text-white' : 'bg-ink-700 hover:bg-ink-600'"
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
          :class="editingSide === 'left' ? 'bg-accent text-white' : 'bg-ink-700 hover:bg-ink-600'"
          :disabled="store.schema.mirrorPages"
          @click="editingSide = 'left'"
        >Left</button>
        <button
          class="flex-1 rounded px-2 py-1 text-xs"
          :class="editingSide === 'right' ? 'bg-accent text-white' : 'bg-ink-700 hover:bg-ink-600'"
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
          class="flex-1 rounded px-2 py-1 text-xs capitalize"
          :class="bg.type === t ? 'bg-accent text-white' : 'bg-ink-700 hover:bg-ink-600'"
          @click="store.setBackground({ type: t })"
        >{{ t }}</button>
      </div>

      <!-- Plain colour: preset swatches + full picker (hex + recent). -->
      <template v-if="bg.type === 'plain'">
        <div class="mt-1 grid grid-cols-5 gap-1">
          <button
            v-for="c in BG_PRESETS"
            :key="c"
            type="button"
            class="h-6 w-full rounded border"
            :class="(bg.color ?? '#f5efe2').toLowerCase() === c.toLowerCase() ? 'border-accent ring-1 ring-accent' : 'border-ink-600 hover:border-ink-400'"
            :style="{ background: c }"
            :title="c"
            @click="store.setBackground({ color: c })"
          />
        </div>
        <div class="mt-1 flex items-center gap-2">
          <ColorPicker :model-value="bg.color ?? '#f5efe2'" @update:model-value="(v) => store.setBackground({ color: v })" />
          <span class="font-mono text-[11px] text-ink-400">{{ (bg.color ?? '#f5efe2').toLowerCase() }}</span>
        </div>
      </template>

      <!-- Image background: upload, preview, remove, optional tint. -->
      <template v-if="bg.type === 'image'">
        <div class="mt-1 flex flex-col gap-2">
          <div
            v-if="bgImagePreview"
            class="relative h-24 w-full overflow-hidden rounded border border-ink-600"
            :style="{ backgroundImage: `url('${bgImagePreview}')`, backgroundSize: 'cover', backgroundPosition: 'center' }"
          />
          <div v-else class="flex h-24 w-full items-center justify-center rounded border border-dashed border-ink-600 text-[11px] text-ink-400">
            пока без изображения
          </div>
          <div class="flex gap-1">
            <button
              type="button"
              class="flex-1 rounded bg-ink-700 px-2 py-1 text-xs text-ink-100 hover:bg-ink-600 disabled:opacity-50"
              :disabled="bgUploading"
              @click="onPickBgImage"
            >{{ bgUploading ? '…' : bgImagePreview ? 'Заменить' : 'Загрузить' }}</button>
            <button
              v-if="bgImagePreview"
              type="button"
              class="rounded bg-ink-700 px-2 py-1 text-xs text-ink-200 hover:bg-ink-600"
              @click="clearBgImage"
            >Убрать</button>
          </div>
          <input
            ref="bgFileInput"
            type="file"
            accept="image/*"
            class="hidden"
            @change="onBgFile"
          />
          <p v-if="bgUploadError" class="text-[11px] text-red-400">{{ bgUploadError }}</p>
        </div>
      </template>
    </section>

    <section class="flex flex-col gap-2">
      <label class="flex items-center gap-2 text-xs text-ink-300">
        <input type="checkbox" :checked="store.schema.showGuides" @change="store.toggleGuides()" />
        Show guides
      </label>
      <label class="flex items-center gap-2 text-xs text-ink-300">
        <input type="checkbox" :checked="store.schema.showDpiWarnings" @change="store.toggleDpiWarnings()" />
        Show DPI warnings
      </label>
    </section>

    <section class="flex flex-col gap-2 border-t border-ink-700 pt-4">
      <label class="flex items-center gap-2 text-xs text-ink-300">
        <input type="checkbox" :checked="store.schema.baselineGrid.enabled"
          @change="store.setBaselineGrid({ enabled: ($event.target as HTMLInputElement).checked })" />
        Baseline grid
      </label>
      <div v-if="store.schema.baselineGrid.enabled" class="grid grid-cols-2 gap-2">
        <label class="flex flex-col gap-1 text-xs text-ink-400">
          Leading ({{ UNIT_SUFFIX[unit] }})
          <input class="rounded bg-ink-700 px-2 py-1 text-ink-100" type="number" step="0.1" min="0.1"
            :value="inUnit(store.schema.baselineGrid.lineHeight)"
            @change="store.setBaselineGrid({ lineHeight: toPx(Number(($event.target as HTMLInputElement).value), unit) })" />
        </label>
        <label class="flex flex-col gap-1 text-xs text-ink-400">
          Offset ({{ UNIT_SUFFIX[unit] }})
          <input class="rounded bg-ink-700 px-2 py-1 text-ink-100" type="number" step="0.1"
            :value="inUnit(store.schema.baselineGrid.offset)"
            @change="store.setBaselineGrid({ offset: toPx(Number(($event.target as HTMLInputElement).value), unit) })" />
        </label>
        <label class="col-span-2 flex flex-col gap-1 text-xs text-ink-400">
          Color
          <input type="color" class="h-8 w-full cursor-pointer rounded border border-ink-600 bg-transparent"
            :value="store.schema.baselineGrid.color"
            @input="store.setBaselineGrid({ color: ($event.target as HTMLInputElement).value })" />
        </label>
      </div>
    </section>

    <section class="flex flex-col gap-2 border-t border-ink-700 pt-4">
      <label class="flex items-center gap-2 text-xs text-ink-300">
        <input type="checkbox" :checked="store.schema.columnGrid.enabled"
          @change="store.setColumnGrid({ enabled: ($event.target as HTMLInputElement).checked })" />
        Column grid
      </label>
      <div v-if="store.schema.columnGrid.enabled" class="grid grid-cols-2 gap-2">
        <label class="flex flex-col gap-1 text-xs text-ink-400">
          Columns
          <input class="rounded bg-ink-700 px-2 py-1 text-ink-100" type="number" step="1" min="1" max="24"
            :value="store.schema.columnGrid.columns"
            @change="store.setColumnGrid({ columns: Math.max(1, Math.round(Number(($event.target as HTMLInputElement).value))) })" />
        </label>
        <label class="flex flex-col gap-1 text-xs text-ink-400">
          Gutter ({{ UNIT_SUFFIX[unit] }})
          <input class="rounded bg-ink-700 px-2 py-1 text-ink-100" type="number" step="0.1" min="0"
            :value="inUnit(store.schema.columnGrid.gutter)"
            @change="store.setColumnGrid({ gutter: toPx(Number(($event.target as HTMLInputElement).value), unit) })" />
        </label>
        <label class="col-span-2 flex flex-col gap-1 text-xs text-ink-400">
          Color
          <input type="color" class="h-8 w-full cursor-pointer rounded border border-ink-600 bg-transparent"
            :value="store.schema.columnGrid.color"
            @input="store.setColumnGrid({ color: ($event.target as HTMLInputElement).value })" />
        </label>
      </div>
    </section>
  </aside>
</template>
