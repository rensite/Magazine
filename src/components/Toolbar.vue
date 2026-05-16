<script setup lang="ts">
import { computed, ref } from 'vue'
import { useSpreadStore } from '@/stores/spreadStore'
import { makeTextElement } from '@/utils/elementFactory'
import { textDefaults } from '@/composables/useTextDefaults'
import { useImageImport } from '@/composables/useImageImport'
import VoiceMic from './VoiceMic.vue'
import UiTooltip from './UiTooltip.vue'
import Icon from './Icon.vue'

const props = defineProps<{
  spreadId: string | null
  userId: string | null
  inspectorOpen: boolean
  pageSettingsOpen: boolean
}>()
const emit = defineEmits<{
  (e: 'toggle-inspector'): void
  (e: 'toggle-page-settings'): void
}>()

const store = useSpreadStore()
const fileInput = ref<HTMLInputElement | null>(null)
const { importing, importError, importFiles } = useImageImport(() => ({
  spreadId: props.spreadId,
  userId: props.userId,
}))

const selected = computed(() => store.selected)

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

const onFiles = async (e: Event) => {
  const target = e.target as HTMLInputElement
  if (!target.files || target.files.length === 0) return
  await importFiles(target.files)
  target.value = ''
}

// Text-specific controls live in Inspector.
</script>

<template>
  <div class="flex flex-wrap items-center gap-0.5 border-b border-divider bg-ink-800 px-2 py-1.5 text-sm">
    <UiTooltip text="Добавить текст">
      <button class="rounded p-1.5 text-ink-200 hover:bg-ink-700" @click="addText"><Icon name="type" /></button>
    </UiTooltip>
    <UiTooltip text="Добавить картинку">
      <button class="rounded p-1.5 text-ink-200 hover:bg-ink-700 disabled:opacity-50" :disabled="importing" @click="onPickImage">
        <Icon name="image" />
      </button>
    </UiTooltip>
    <input ref="fileInput" type="file" accept="image/*" multiple class="hidden" @change="onFiles" />
    <span v-if="importError" class="ml-1 text-xs text-red-400">{{ importError }}</span>

    <div class="mx-1.5 h-5 w-px bg-divider" />

    <UiTooltip text="Отменить" hotkey="⌘Z">
      <button class="rounded p-1.5 text-ink-200 hover:bg-ink-700 disabled:opacity-30" :disabled="!store.canUndo" @click="store.undo()"><Icon name="undo" /></button>
    </UiTooltip>
    <UiTooltip text="Повторить" hotkey="⌘⇧Z">
      <button class="rounded p-1.5 text-ink-200 hover:bg-ink-700 disabled:opacity-30" :disabled="!store.canRedo" @click="store.redo()"><Icon name="redo" /></button>
    </UiTooltip>

    <div class="mx-1.5 h-5 w-px bg-divider" />

    <template v-if="selected">
      <UiTooltip text="На передний план">
        <button class="rounded p-1.5 text-ink-200 hover:bg-ink-700" @click="store.bringToFront(selected.id)"><Icon name="bringFront" /></button>
      </UiTooltip>
      <UiTooltip text="На задний план">
        <button class="rounded p-1.5 text-ink-200 hover:bg-ink-700" @click="store.sendToBack(selected.id)"><Icon name="sendBack" /></button>
      </UiTooltip>
      <UiTooltip text="Дублировать" hotkey="⌘D">
        <button class="rounded p-1.5 text-ink-200 hover:bg-ink-700" @click="store.duplicateSelected()"><Icon name="duplicate" /></button>
      </UiTooltip>
      <UiTooltip text="Удалить" hotkey="⌫">
        <button class="rounded p-1.5 text-ink-200 hover:bg-ink-700" @click="store.removeElement(selected.id)"><Icon name="trash" /></button>
      </UiTooltip>
    </template>

    <div class="ml-auto flex items-center gap-0.5">
      <VoiceMic />
      <UiTooltip text="Inspector" hotkey="I">
        <button class="rounded p-1.5" :class="props.inspectorOpen ? 'bg-accent text-white' : 'text-ink-200 hover:bg-ink-700'" @click="emit('toggle-inspector')"><Icon name="inspector" /></button>
      </UiTooltip>
      <UiTooltip text="Параметры страницы" hotkey="P">
        <button class="rounded p-1.5" :class="props.pageSettingsOpen ? 'bg-accent text-white' : 'text-ink-200 hover:bg-ink-700'" @click="emit('toggle-page-settings')"><Icon name="page" /></button>
      </UiTooltip>
    </div>
  </div>
</template>
