<script setup lang="ts">
import { ref } from 'vue'
import type { SpreadRecord } from '@/types/element'

interface SpreadSummary {
  id: string
  title: string
  updated_at: string
}

const props = defineProps<{
  current: SpreadRecord | null
  list: SpreadSummary[]
  loading: boolean
}>()

const emit = defineEmits<{
  open: [id: string]
  create: []
  rename: [id: string, title: string]
  remove: [id: string]
  signOut: []
}>()

const open = ref(false)
const renaming = ref(false)
const titleDraft = ref('')

const startRename = () => {
  if (!props.current) return
  titleDraft.value = props.current.title
  renaming.value = true
}

const commitRename = () => {
  if (!props.current) return
  const next = titleDraft.value.trim()
  if (next && next !== props.current.title) {
    emit('rename', props.current.id, next)
  }
  renaming.value = false
}

const onPick = (id: string) => {
  open.value = false
  if (id !== props.current?.id) emit('open', id)
}
</script>

<template>
  <div class="relative">
    <button
      class="flex items-center gap-2 rounded px-2 py-1 text-xs text-ink-200 hover:bg-ink-700"
      @click="open = !open"
    >
      <span class="font-serif italic">{{ current?.title ?? 'No spread' }}</span>
      <span class="text-ink-400">▾</span>
    </button>
    <div
      v-if="open"
      class="absolute left-0 top-full z-50 mt-1 w-64 rounded-md border border-ink-600 bg-ink-800 shadow-2xl"
    >
      <div class="max-h-64 overflow-y-auto py-1">
        <button
          v-for="s in list"
          :key="s.id"
          class="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-xs hover:bg-ink-700"
          :class="s.id === current?.id ? 'text-accent' : 'text-ink-200'"
          @click="onPick(s.id)"
        >
          <span class="truncate">{{ s.title }}</span>
          <span class="shrink-0 text-[10px] text-ink-400">{{ new Date(s.updated_at).toLocaleDateString() }}</span>
        </button>
        <p v-if="!list.length && !loading" class="px-3 py-2 text-xs text-ink-400">пусто</p>
      </div>
      <div class="border-t border-ink-700 p-1">
        <button
          class="block w-full rounded px-3 py-1.5 text-left text-xs text-ink-200 hover:bg-ink-700"
          @click="emit('create'); open = false"
        >+ Новый разворот</button>
        <button
          v-if="current"
          class="block w-full rounded px-3 py-1.5 text-left text-xs text-ink-200 hover:bg-ink-700"
          @click="startRename"
        >Переименовать</button>
        <button
          v-if="current"
          class="block w-full rounded px-3 py-1.5 text-left text-xs text-red-400 hover:bg-red-500/10"
          @click="emit('remove', current.id); open = false"
        >Удалить</button>
        <hr class="my-1 border-ink-700" />
        <button
          class="block w-full rounded px-3 py-1.5 text-left text-xs text-ink-300 hover:bg-ink-700"
          @click="emit('signOut'); open = false"
        >Выйти</button>
      </div>
    </div>

    <div
      v-if="renaming"
      class="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/70"
      @click.self="renaming = false"
    >
      <form
        class="w-full max-w-sm rounded-lg border border-ink-700 bg-ink-800 p-4"
        @submit.prevent="commitRename"
      >
        <label class="text-xs text-ink-300">Название</label>
        <input
          v-model="titleDraft"
          autofocus
          class="mt-1 w-full rounded bg-ink-700 px-2 py-1.5 text-sm text-ink-100 outline-none focus:ring-1 focus:ring-accent"
        />
        <div class="mt-3 flex justify-end gap-2">
          <button type="button" class="rounded px-3 py-1 text-xs text-ink-300 hover:bg-ink-700" @click="renaming = false">Отмена</button>
          <button type="submit" class="rounded bg-accent px-3 py-1 text-xs text-ink-900 hover:bg-accent/90">OK</button>
        </div>
      </form>
    </div>
  </div>
</template>
