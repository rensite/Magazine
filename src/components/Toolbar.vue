<script setup lang="ts">
import { computed, ref } from 'vue'
import { useSpreadStore } from '@/stores/spreadStore'
import { makeTextElement } from '@/utils/elementFactory'
import { textDefaults } from '@/composables/useTextDefaults'
import { useImageImport } from '@/composables/useImageImport'
import VoiceMic from './VoiceMic.vue'
import UiTooltip from './UiTooltip.vue'

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

    <UiTooltip text="Отменить" hotkey="⌘Z">
      <button
        class="rounded px-2 py-1 text-ink-200 hover:bg-ink-700 disabled:opacity-30"
        :disabled="!store.canUndo"
        @click="store.undo()"
      >↶</button>
    </UiTooltip>
    <UiTooltip text="Повторить" hotkey="⌘⇧Z">
      <button
        class="rounded px-2 py-1 text-ink-200 hover:bg-ink-700 disabled:opacity-30"
        :disabled="!store.canRedo"
        @click="store.redo()"
      >↷</button>
    </UiTooltip>

    <div class="mx-2 h-5 w-px bg-divider" />

    <template v-if="selected">
      <UiTooltip text="На передний план">
        <button class="rounded bg-ink-700 px-2 py-1 text-xs text-ink-200 hover:bg-ink-600" @click="store.bringToFront(selected.id)">Front</button>
      </UiTooltip>
      <UiTooltip text="На задний план">
        <button class="rounded bg-ink-700 px-2 py-1 text-xs text-ink-200 hover:bg-ink-600" @click="store.sendToBack(selected.id)">Back</button>
      </UiTooltip>
      <UiTooltip text="Дублировать" hotkey="⌘D">
        <button class="rounded bg-ink-700 px-2 py-1 text-xs text-ink-200 hover:bg-ink-600" @click="store.duplicateSelected()">Dup</button>
      </UiTooltip>
      <UiTooltip text="Удалить" hotkey="⌫">
        <button class="rounded bg-ink-700 px-2 py-1 text-xs text-ink-200 hover:bg-ink-600" @click="store.removeElement(selected.id)">Del</button>
      </UiTooltip>
    </template>

    <div class="ml-auto flex items-center gap-2">
      <VoiceMic />
      <UiTooltip text="Inspector" hotkey="I">
        <button
          class="rounded px-2 py-1 text-xs"
          :class="props.inspectorOpen ? 'bg-accent text-white' : 'bg-ink-700 text-ink-200 hover:bg-ink-600'"
          @click="emit('toggle-inspector')"
        >Inspector</button>
      </UiTooltip>
      <UiTooltip text="Параметры страницы" hotkey="P">
        <button
          class="rounded px-2 py-1 text-xs"
          :class="props.pageSettingsOpen ? 'bg-accent text-white' : 'bg-ink-700 text-ink-200 hover:bg-ink-600'"
          @click="emit('toggle-page-settings')"
        >Page</button>
      </UiTooltip>
    </div>
  </div>
</template>
