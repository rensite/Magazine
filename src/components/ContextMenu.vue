<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, computed } from 'vue'
import { useSpreadStore } from '@/stores/spreadStore'
import { useCommands, type Command } from '@/composables/useCommands'

const open = ref(false)
const pos = ref({ x: 0, y: 0 })
const store = useSpreadStore()
const { list } = useCommands()

// Curated subset for the right-click menu: keep it short and grouped.
const MENU_ORDER: Array<{ ids: string[]; label?: string }> = [
  { ids: ['edit.copy', 'edit.paste', 'edit.duplicate'] },
  { ids: ['arrange.front', 'arrange.back'] },
  { ids: ['arrange.lockToggle', 'arrange.hideToggle'] },
  { ids: ['text.fitFrame', 'text.fitText'] },
  { ids: ['image.reset'] },
  { ids: ['edit.delete'] },
]

const byId = computed<Record<string, Command>>(() => Object.fromEntries(list.map((c) => [c.id, c])))

const sections = computed(() => {
  return MENU_ORDER.map((sec) =>
    sec.ids
      .map((id) => byId.value[id])
      .filter((c): c is Command => !!c && (c.enabled ? c.enabled() : true)),
  ).filter((sec) => sec.length > 0)
})

const onContextMenu = (e: MouseEvent) => {
  const target = e.target as HTMLElement | null
  if (target?.closest('input, textarea, [contenteditable=\"true\"]')) return
  // Only show when there is something to act on (otherwise the browser
  // default is more useful — e.g. text selection in the address bar).
  if (!store.selected && !store.clipboard) return
  e.preventDefault()
  pos.value = { x: e.clientX, y: e.clientY }
  open.value = true
}

const close = () => { open.value = false }

const run = (cmd: Command) => {
  cmd.run()
  close()
}

const onWindowClick = (e: MouseEvent) => {
  if (!open.value) return
  if ((e.target as HTMLElement | null)?.closest('[data-context-menu]')) return
  close()
}
const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }

onMounted(() => {
  window.addEventListener('contextmenu', onContextMenu)
  window.addEventListener('mousedown', onWindowClick)
  window.addEventListener('keydown', onKey)
})
onBeforeUnmount(() => {
  window.removeEventListener('contextmenu', onContextMenu)
  window.removeEventListener('mousedown', onWindowClick)
  window.removeEventListener('keydown', onKey)
})

// Adjust position to keep menu in viewport (rough heuristic).
const adjustedPos = computed(() => {
  const maxX = typeof window !== 'undefined' ? window.innerWidth - 220 : pos.value.x
  const maxY = typeof window !== 'undefined' ? window.innerHeight - 280 : pos.value.y
  return { x: Math.min(pos.value.x, maxX), y: Math.min(pos.value.y, maxY) }
})
</script>

<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition duration-100 ease-out"
      enter-from-class="opacity-0 -translate-y-1 scale-95"
      enter-to-class="opacity-100 translate-y-0 scale-100"
      leave-active-class="transition duration-75 ease-in"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
    >
      <div
        v-if="open"
        data-context-menu
        class="fixed z-[150] w-52 origin-top-left overflow-hidden rounded-md border border-divider bg-ink-800 py-1 shadow-2xl ring-1 ring-white/5"
        :style="{ left: `${adjustedPos.x}px`, top: `${adjustedPos.y}px` }"
      >
        <template v-for="(section, si) in sections" :key="si">
          <div v-if="si > 0" class="my-1 h-px bg-divider" />
          <button
            v-for="cmd in section"
            :key="cmd.id"
            type="button"
            class="flex w-full items-center justify-between px-3 py-1 text-left text-xs text-ink-200 hover:bg-accent hover:text-white"
            @click="run(cmd)"
          >
            <span>{{ cmd.label }}</span>
            <span v-if="cmd.hotkey" class="ml-3 text-[10px] text-ink-400">{{ cmd.hotkey }}</span>
          </button>
        </template>
      </div>
    </Transition>
  </Teleport>
</template>
