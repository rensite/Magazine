<script setup lang="ts">
import { computed, ref } from 'vue'
import { useSpreadStore } from '@/stores/spreadStore'
import { isText } from '@/types/element'

const store = useSpreadStore()
const elements = computed(() => [...store.elements].reverse())

const label = (id: string, type: 'text' | 'image', content?: string) => {
  if (type === 'text') return content?.trim().slice(0, 24) || 'Text'
  return `Image · ${id.slice(0, 4)}`
}

const dragId = ref<string | null>(null)
const overId = ref<string | null>(null)

const onDragStart = (e: DragEvent, id: string) => {
  dragId.value = id
  e.dataTransfer?.setData('text/plain', id)
  if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'
}
const onDragOver = (e: DragEvent, id: string) => {
  if (!dragId.value || dragId.value === id) return
  e.preventDefault()
  overId.value = id
}
const onDrop = (id: string) => {
  if (!dragId.value || dragId.value === id) return
  const reversed = elements.value
  const fromReversed = reversed.findIndex((e) => e.id === dragId.value)
  const toReversed = reversed.findIndex((e) => e.id === id)
  if (fromReversed === -1 || toReversed === -1) return
  const last = store.elements.length - 1
  const toIndex = last - toReversed
  store.reorderElement(dragId.value, toIndex)
  dragId.value = null
  overId.value = null
}
</script>

<template>
  <div class="border-t border-ink-700 bg-ink-800 p-3">
    <h3 class="mb-2 text-[10px] uppercase tracking-wide text-ink-400">Layers</h3>
    <div v-if="elements.length === 0" class="text-xs text-ink-500">Пусто</div>
    <ul class="flex flex-col gap-0.5">
      <li
        v-for="el in elements"
        :key="el.id"
        class="flex items-center gap-1 rounded px-1 py-1 text-xs"
        :class="[
          store.selectedId === el.id ? 'bg-ink-700 text-ink-100' : 'text-ink-300 hover:bg-ink-700/50',
          overId === el.id ? 'ring-1 ring-accent' : '',
        ]"
        draggable="true"
        @click="store.select(el.id)"
        @dragstart="(e) => onDragStart(e, el.id)"
        @dragover="(e) => onDragOver(e, el.id)"
        @drop="onDrop(el.id)"
      >
        <button
          type="button"
          class="w-5 text-ink-400 hover:text-ink-100"
          :title="el.hidden ? 'Show' : 'Hide'"
          @click.stop="store.toggleHidden(el.id)"
        >{{ el.hidden ? '◌' : '●' }}</button>
        <button
          type="button"
          class="w-5 text-ink-400 hover:text-ink-100"
          :title="el.locked ? 'Unlock' : 'Lock'"
          @click.stop="store.toggleLock(el.id)"
        >{{ el.locked ? '🔒' : '🔓' }}</button>
        <span class="flex-1 truncate">
          {{ label(el.id, el.type, isText(el) ? el.content : undefined) }}
        </span>
        <span class="text-[10px] uppercase text-ink-500">{{ el.type }}</span>
      </li>
    </ul>
  </div>
</template>
