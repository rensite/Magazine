<script setup lang="ts">
import { computed, ref } from 'vue'
import { useSpreadStore } from '@/stores/spreadStore'
import { isText, isImage, type FontFamily } from '@/types/element'
import { makeImageElement, makeTextElement } from '@/utils/elementFactory'
import { prepareLocalImage, uploadImage } from '@/services/imageUpload'
import { textDefaults, rememberTextStyle } from '@/composables/useTextDefaults'

const props = defineProps<{
  spreadId: string | null
  userId: string | null
}>()

const store = useSpreadStore()
const fileInput = ref<HTMLInputElement | null>(null)
const importing = ref(false)
const importError = ref<string | null>(null)

const selected = computed(() => store.selected)
const isTextSelected = computed(() => selected.value !== null && isText(selected.value))
const isImageSelected = computed(() => selected.value !== null && isImage(selected.value))

const addText = () => {
  store.addElement(
    makeTextElement({
      x: 200,
      y: 200,
      fontFamily: textDefaults.fontFamily,
      fontSize: textDefaults.fontSize,
      color: textDefaults.color,
      align: textDefaults.align,
      lineHeight: textDefaults.lineHeight,
    }),
  )
}

const onPickImage = () => fileInput.value?.click()

const importOne = async (file: File) => {
  if (props.userId && props.spreadId) {
    try {
      return await uploadImage(file, props.userId, props.spreadId)
    } catch (err) {
      console.warn('Storage upload failed, falling back to local data URL', err)
    }
  }
  return prepareLocalImage(file)
}

const onFiles = async (e: Event) => {
  const target = e.target as HTMLInputElement
  const files = target.files
  if (!files || files.length === 0) return
  importing.value = true
  importError.value = null
  try {
    let offsetX = 200
    for (const file of Array.from(files)) {
      const data = await importOne(file)
      const ratio = data.naturalWidth / data.naturalHeight
      const width = Math.min(400, data.naturalWidth)
      const height = width / ratio
      store.addElement(
        makeImageElement({
          ...data,
          x: offsetX,
          y: 200,
          width,
          height,
        }),
      )
      offsetX += 24
    }
  } catch (err) {
    importError.value = (err as Error).message
    console.error('Image import failed', err)
  } finally {
    importing.value = false
    target.value = ''
  }
}

const setFont = (family: FontFamily) => {
  if (selected.value && isText(selected.value)) {
    store.updateElement(selected.value.id, { fontFamily: family })
    rememberTextStyle({ fontFamily: family })
  }
}

const setColor = (e: Event) => {
  const value = (e.target as HTMLInputElement).value
  if (selected.value && isText(selected.value)) {
    store.updateElement(selected.value.id, { color: value })
    rememberTextStyle({ color: value })
  }
}

const setOpacity = (e: Event) => {
  const value = parseFloat((e.target as HTMLInputElement).value)
  if (selected.value) {
    store.updateElement(selected.value.id, { opacity: value })
  }
}

const setFontSize = (e: Event) => {
  const value = parseInt((e.target as HTMLInputElement).value, 10)
  if (Number.isFinite(value) && selected.value && isText(selected.value)) {
    store.updateElement(selected.value.id, { fontSize: value })
    rememberTextStyle({ fontSize: value })
  }
}

const fonts: { id: FontFamily; label: string }[] = [
  { id: 'mono', label: 'Mono' },
  { id: 'serif', label: 'Serif' },
  { id: 'hand', label: 'Hand' },
]
</script>

<template>
  <div class="flex flex-wrap items-center gap-2 border-b border-ink-700 bg-ink-800 px-3 py-2 text-sm">
    <button
      class="rounded bg-ink-700 px-3 py-1 text-ink-100 hover:bg-ink-600"
      @click="addText"
    >+ Text</button>
    <button
      class="rounded bg-ink-700 px-3 py-1 text-ink-100 hover:bg-ink-600 disabled:opacity-50"
      :disabled="importing"
      @click="onPickImage"
    >{{ importing ? '…' : '+ Image' }}</button>
    <input
      ref="fileInput"
      type="file"
      accept="image/*"
      multiple
      class="hidden"
      @change="onFiles"
    />
    <span v-if="importError" class="text-xs text-red-400">{{ importError }}</span>

    <div class="mx-2 h-5 w-px bg-ink-600" />

    <button
      class="rounded px-2 py-1 text-ink-200 hover:bg-ink-700 disabled:opacity-30"
      :disabled="!store.canUndo"
      @click="store.undo()"
      title="Undo (Cmd+Z)"
    >↶</button>
    <button
      class="rounded px-2 py-1 text-ink-200 hover:bg-ink-700 disabled:opacity-30"
      :disabled="!store.canRedo"
      @click="store.redo()"
      title="Redo (Cmd+Shift+Z)"
    >↷</button>

    <div class="mx-2 h-5 w-px bg-ink-600" />

    <template v-if="isTextSelected">
      <div class="flex items-center gap-1">
        <button
          v-for="f in fonts"
          :key="f.id"
          class="rounded px-2 py-1 text-xs"
          :class="selected && isText(selected) && selected.fontFamily === f.id ? 'bg-accent text-ink-900' : 'bg-ink-700 text-ink-200 hover:bg-ink-600'"
          @click="setFont(f.id)"
        >{{ f.label }}</button>
      </div>
      <input
        type="number"
        class="w-16 rounded bg-ink-700 px-2 py-1 text-ink-100"
        :value="selected && isText(selected) ? selected.fontSize : 16"
        min="8"
        max="200"
        @input="setFontSize"
      />
      <input
        type="color"
        class="h-8 w-8 cursor-pointer rounded border border-ink-600 bg-transparent"
        :value="selected && isText(selected) ? selected.color : '#000000'"
        @input="setColor"
      />
    </template>

    <template v-if="selected">
      <label class="ml-auto flex items-center gap-2 text-xs text-ink-300">
        opacity
        <input
          type="range"
          min="0"
          max="1"
          step="0.05"
          :value="selected.opacity"
          @input="setOpacity"
        />
      </label>
      <button
        class="rounded bg-ink-700 px-2 py-1 text-xs text-ink-200 hover:bg-ink-600"
        @click="store.bringToFront(selected.id)"
      >Front</button>
      <button
        class="rounded bg-ink-700 px-2 py-1 text-xs text-ink-200 hover:bg-ink-600"
        @click="store.sendToBack(selected.id)"
      >Back</button>
      <button
        class="rounded bg-ink-700 px-2 py-1 text-xs text-ink-200 hover:bg-ink-600"
        @click="store.removeElement(selected.id)"
      >Del</button>
    </template>
    <span v-else-if="!isImageSelected" class="ml-auto text-xs text-ink-400">
      выберите элемент
    </span>
  </div>
</template>
