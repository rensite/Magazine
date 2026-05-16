<script setup lang="ts">
import { computed, ref } from 'vue'
import { useSpreadStore } from '@/stores/spreadStore'
import { isTextBearing, type SpreadElement } from '@/types/element'

const store = useSpreadStore()
const elements = computed(() => [...store.elements].reverse())

const label = (el: SpreadElement): string => {
  if (isTextBearing(el)) {
    return el.content?.trim().slice(0, 24) || labelForKind(el.type)
  }
  if (el.type === 'image') return `Image · ${el.id.slice(0, 4)}`
  if (el.type === 'shape') return `${el.shape} · ${el.id.slice(0, 4)}`
  if (el.type === 'group') return el.label || `Group · ${el.id.slice(0, 4)}`
  // exhaustive
  const _exhaustive: never = el
  return _exhaustive
}

const labelForKind = (kind: SpreadElement['type']): string => {
  switch (kind) {
    case 'text': return 'Text'
    case 'pullquote': return 'Pullquote'
    case 'caption': return 'Caption'
    case 'sticker': return 'Sticker'
    default: return kind
  }
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
          store.selectedIds.includes(el.id) ? 'bg-ink-700 text-ink-100' : 'text-ink-300 hover:bg-ink-700/50',
          overId === el.id ? 'ring-1 ring-accent' : '',
        ]"
        draggable="true"
        @click="(e) => (e.shiftKey || e.metaKey || e.ctrlKey) ? store.toggleSelection(el.id) : store.select(el.id)"
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
          {{ label(el) }}
        </span>
        <span class="text-[10px] uppercase text-ink-500">{{ el.type }}</span>
      </li>
    </ul>
  </div>
</template>
