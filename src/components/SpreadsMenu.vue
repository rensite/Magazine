<script setup lang="ts">
import { ref } from 'vue'
import type { SpreadRecord, SpreadSchema } from '@/types/element'
import SpreadPreview from './SpreadPreview.vue'

interface SpreadSummary {
  id: string
  title: string
  updated_at: string
  schema?: SpreadSchema | unknown
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
const galleryOpen = ref(false)
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
  galleryOpen.value = false
  if (id !== props.current?.id) emit('open', id)
}

const formatDate = (s: string) => {
  const d = new Date(s)
  const today = new Date()
  const sameDay =
    d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate()
  return sameDay ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : d.toLocaleDateString()
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
      class="absolute left-0 top-full z-50 mt-1 w-72 rounded-md border border-ink-600 bg-ink-800 shadow-2xl"
    >
      <button
        class="block w-full rounded-t-md border-b border-ink-700 px-3 py-2 text-left text-xs text-ink-200 hover:bg-ink-700"
        @click="galleryOpen = true; open = false"
      >🗂 Все развороты ({{ list.length }})</button>

      <div class="max-h-64 overflow-y-auto py-1">
        <button
          v-for="s in list"
          :key="s.id"
          class="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-xs hover:bg-ink-700"
          :class="s.id === current?.id ? 'text-accent' : 'text-ink-200'"
          @click="onPick(s.id)"
        >
          <span class="truncate">{{ s.title }}</span>
          <span class="shrink-0 text-[10px] text-ink-400">{{ formatDate(s.updated_at) }}</span>
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

    <!-- Gallery modal -->
    <div
      v-if="galleryOpen"
      class="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/80 p-6"
      @click.self="galleryOpen = false"
    >
      <div class="flex max-h-[90vh] w-full max-w-5xl flex-col rounded-lg border border-ink-700 bg-ink-800 shadow-2xl">
        <div class="flex items-center justify-between border-b border-ink-700 px-5 py-3">
          <div class="flex items-center gap-3">
            <span class="font-serif text-lg italic text-accent">Развороты</span>
            <span class="text-xs text-ink-400">{{ list.length }}</span>
          </div>
          <div class="flex items-center gap-2">
            <button
              class="rounded bg-accent px-3 py-1 text-xs text-ink-900 hover:bg-accent/90"
              @click="emit('create'); galleryOpen = false"
            >+ Новый</button>
            <button
              class="rounded px-2 py-1 text-xs text-ink-300 hover:bg-ink-700"
              @click="galleryOpen = false"
            >✕</button>
          </div>
        </div>

        <div class="overflow-y-auto p-5">
          <div v-if="loading && !list.length" class="py-12 text-center text-sm text-ink-400">Загрузка…</div>
          <div v-else-if="!list.length" class="py-12 text-center text-sm text-ink-400">Пока ничего нет — создайте первый разворот.</div>
          <div v-else class="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-4">
            <button
              v-for="s in list"
              :key="s.id"
              class="group flex flex-col gap-2 rounded-md border p-2 text-left transition"
              :class="s.id === current?.id ? 'border-accent bg-ink-700' : 'border-ink-700 hover:border-ink-500 hover:bg-ink-700/60'"
              @click="onPick(s.id)"
            >
              <SpreadPreview
                :schema="s.schema"
                :width="184"
                :height="120"
              />
              <div class="flex items-center justify-between gap-2 px-1">
                <span
                  class="truncate text-xs"
                  :class="s.id === current?.id ? 'text-accent' : 'text-ink-100'"
                >{{ s.title }}</span>
                <span class="shrink-0 text-[10px] text-ink-400">{{ formatDate(s.updated_at) }}</span>
              </div>
            </button>
          </div>
        </div>
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
