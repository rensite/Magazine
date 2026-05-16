<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { FONT_REGISTRY, ensureFontLoaded, lookupFont, type FontDef } from '@/utils/fonts'

const props = defineProps<{ modelValue: string }>()
const emit = defineEmits<{ (e: 'update:modelValue', value: string): void }>()

const open = ref(false)
const query = ref('')
const rootRef = ref<HTMLDivElement | null>(null)

const current = computed(() => lookupFont(props.modelValue))

const filtered = computed<FontDef[]>(() => {
  const q = query.value.trim().toLowerCase()
  if (!q) return FONT_REGISTRY
  return FONT_REGISTRY.filter((f) => f.name.toLowerCase().includes(q) || f.category.includes(q))
})

watch(filtered, (list) => {
  for (const f of list.slice(0, 30)) ensureFontLoaded(f.name)
})

const pick = (name: string) => {
  ensureFontLoaded(name)
  emit('update:modelValue', name)
  open.value = false
}

const onDocClick = (e: MouseEvent) => {
  if (!open.value) return
  if (rootRef.value && !rootRef.value.contains(e.target as Node)) open.value = false
}
onMounted(() => window.addEventListener('mousedown', onDocClick))
onBeforeUnmount(() => window.removeEventListener('mousedown', onDocClick))
</script>

<template>
  <div ref="rootRef" class="relative inline-block">
    <button
      type="button"
      class="flex w-44 items-center justify-between rounded bg-ink-700 px-2 py-1 text-left text-xs text-ink-100 hover:bg-ink-600"
      :style="{ fontFamily: current.cssStack }"
      @click="open = !open"
    >
      <span class="truncate">{{ current.name }}</span>
      <span class="ml-2 text-ink-400">▾</span>
    </button>
    <div
      v-if="open"
      class="absolute left-0 top-9 z-50 max-h-80 w-64 overflow-y-auto rounded border border-ink-600 bg-ink-800 p-2 shadow-lg"
    >
      <input
        v-model="query"
        type="text"
        placeholder="Search fonts…"
        class="mb-2 w-full rounded bg-ink-700 px-2 py-1 text-xs text-ink-100 placeholder:text-ink-400"
      />
      <button
        v-for="f in filtered"
        :key="f.name"
        type="button"
        class="flex w-full items-center justify-between rounded px-2 py-1 text-left text-sm hover:bg-ink-700"
        :class="props.modelValue === f.name ? 'bg-ink-700' : ''"
        :style="{ fontFamily: f.cssStack }"
        @click="pick(f.name)"
      >
        <span class="truncate">{{ f.name }}</span>
        <span class="ml-2 text-[10px] uppercase text-ink-400">{{ f.category }}</span>
      </button>
      <div v-if="filtered.length === 0" class="px-2 py-1 text-xs text-ink-400">No matches</div>
    </div>
  </div>
</template>
