<script setup lang="ts">
import { computed, ref } from 'vue'
import { useSpreadStore } from '@/stores/spreadStore'
import { makeTextElement } from '@/utils/elementFactory'
import { textDefaults } from '@/composables/useTextDefaults'
import { useImageImport } from '@/composables/useImageImport'

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

    <template v-if="selected">
      <button class="rounded bg-ink-700 px-2 py-1 text-xs text-ink-200 hover:bg-ink-600" @click="store.bringToFront(selected.id)">Front</button>
      <button class="rounded bg-ink-700 px-2 py-1 text-xs text-ink-200 hover:bg-ink-600" @click="store.sendToBack(selected.id)">Back</button>
      <button class="rounded bg-ink-700 px-2 py-1 text-xs text-ink-200 hover:bg-ink-600" @click="store.duplicateSelected()" title="Duplicate (Cmd+D)">Dup</button>
      <button class="rounded bg-ink-700 px-2 py-1 text-xs text-ink-200 hover:bg-ink-600" @click="store.removeElement(selected.id)">Del</button>
    </template>

    <div class="ml-auto flex items-center gap-2">
      <button
        class="rounded px-2 py-1 text-xs"
        :class="props.inspectorOpen ? 'bg-accent text-ink-900' : 'bg-ink-700 text-ink-200 hover:bg-ink-600'"
        @click="emit('toggle-inspector')"
        title="Inspector (I)"
      >Inspector</button>
      <button
        class="rounded px-2 py-1 text-xs"
        :class="props.pageSettingsOpen ? 'bg-accent text-ink-900' : 'bg-ink-700 text-ink-200 hover:bg-ink-600'"
        @click="emit('toggle-page-settings')"
        title="Page settings (P)"
      >Page</button>
    </div>
  </div>
</template>
