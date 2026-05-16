<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useCommands, COMMAND_GROUP_LABEL, type Command } from '@/composables/useCommands'

const open = ref(false)
const query = ref('')
const inputRef = ref<HTMLInputElement | null>(null)
const activeIndex = ref(0)
const listRef = ref<HTMLDivElement | null>(null)

const { list } = useCommands()

interface Scored { cmd: Command; score: number }

const score = (cmd: Command, q: string): number => {
  if (!q) return 1
  const haystack = `${cmd.label} ${cmd.group} ${cmd.keywords ?? ''}`.toLowerCase()
  const needle = q.toLowerCase()
  if (haystack.startsWith(needle)) return 100
  if (haystack.includes(needle)) return 50
  // Subsequence match: every char of needle appears in order.
  let hi = 0
  let matches = 0
  for (const c of needle) {
    const next = haystack.indexOf(c, hi)
    if (next === -1) return 0
    matches++
    hi = next + 1
  }
  return matches / haystack.length
}

const filtered = computed<Command[]>(() => {
  const q = query.value.trim()
  const enabled = list.filter((c) => (c.enabled ? c.enabled() : true))
  if (!q) return enabled
  const ranked: Scored[] = enabled
    .map((c) => ({ cmd: c, score: score(c, q) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
  return ranked.map((r) => r.cmd)
})

// group preserving relative order from filtered
const grouped = computed(() => {
  const map = new Map<Command['group'], Command[]>()
  for (const c of filtered.value) {
    const arr = map.get(c.group) ?? []
    arr.push(c)
    map.set(c.group, arr)
  }
  return Array.from(map.entries()) as Array<[Command['group'], Command[]]>
})

watch(filtered, () => { activeIndex.value = 0 })

const openPalette = () => {
  open.value = true
  query.value = ''
  activeIndex.value = 0
  nextTick(() => inputRef.value?.focus())
}
const close = () => { open.value = false }

const runActive = () => {
  const cmd = filtered.value[activeIndex.value]
  if (!cmd) return
  cmd.run()
  close()
}

const onKey = (e: KeyboardEvent) => {
  const cmd = e.metaKey || e.ctrlKey
  if (cmd && e.key.toLowerCase() === 'k') {
    const target = e.target as HTMLElement | null
    if (target?.isContentEditable) return
    e.preventDefault()
    open.value ? close() : openPalette()
    return
  }
  if (!open.value) return
  if (e.key === 'Escape') { e.preventDefault(); close(); return }
  if (e.key === 'ArrowDown') { e.preventDefault(); activeIndex.value = Math.min(filtered.value.length - 1, activeIndex.value + 1); scrollIntoView() }
  if (e.key === 'ArrowUp') { e.preventDefault(); activeIndex.value = Math.max(0, activeIndex.value - 1); scrollIntoView() }
  if (e.key === 'Enter') { e.preventDefault(); runActive() }
}

const scrollIntoView = () => {
  nextTick(() => {
    const root = listRef.value
    if (!root) return
    const el = root.querySelector<HTMLElement>(`[data-idx="${activeIndex.value}"]`)
    el?.scrollIntoView({ block: 'nearest' })
  })
}

const indexOf = (cmd: Command): number => filtered.value.indexOf(cmd)

onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition duration-100 ease-out"
      leave-active-class="transition duration-75 ease-in"
      enter-from-class="opacity-0"
      enter-to-class="opacity-100"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
    >
      <div
        v-if="open"
        class="fixed inset-0 z-[200] flex items-start justify-center bg-ink-900/60 backdrop-blur-sm"
        @click.self="close"
      >
        <Transition
          enter-active-class="transition duration-150 ease-out"
          enter-from-class="opacity-0 -translate-y-2 scale-95"
          enter-to-class="opacity-100 translate-y-0 scale-100"
          appear
        >
          <div class="mt-24 w-full max-w-lg overflow-hidden rounded-lg border border-divider bg-ink-800 shadow-2xl ring-1 ring-white/5">
            <div class="flex items-center gap-2 border-b border-divider px-3 py-2">
              <span class="text-xs text-ink-400">⌘K</span>
              <input
                ref="inputRef"
                v-model="query"
                type="text"
                placeholder="Поиск команды…"
                class="flex-1 bg-transparent text-sm text-ink-100 outline-none placeholder:text-ink-500"
              />
              <span class="rounded bg-ink-700 px-1.5 py-0.5 text-[10px] text-ink-400">Esc</span>
            </div>
            <div ref="listRef" class="max-h-80 overflow-y-auto py-1">
              <div v-if="filtered.length === 0" class="px-4 py-6 text-center text-xs text-ink-400">
                Ничего не найдено
              </div>
              <template v-for="[group, items] in grouped" :key="group">
                <div class="px-3 pb-1 pt-2 text-[10px] uppercase tracking-wide text-ink-500">
                  {{ COMMAND_GROUP_LABEL[group] }}
                </div>
                <button
                  v-for="cmd in items"
                  :key="cmd.id"
                  type="button"
                  :data-idx="indexOf(cmd)"
                  class="flex w-full items-center justify-between px-3 py-1.5 text-left text-sm"
                  :class="indexOf(cmd) === activeIndex ? 'bg-accent text-white' : 'text-ink-200 hover:bg-ink-700'"
                  @mouseenter="activeIndex = indexOf(cmd)"
                  @click="cmd.run(); close()"
                >
                  <span>{{ cmd.label }}</span>
                  <span v-if="cmd.hotkey" class="ml-3 text-[10px]" :class="indexOf(cmd) === activeIndex ? 'text-white/70' : 'text-ink-400'">{{ cmd.hotkey }}</span>
                </button>
              </template>
            </div>
          </div>
        </Transition>
      </div>
    </Transition>
  </Teleport>
</template>
