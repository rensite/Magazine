<script setup lang="ts">
import { computed, inject, onBeforeUnmount, onMounted, ref, type Ref } from 'vue'
import { useSpreadStore } from '@/stores/spreadStore'
import { EDITOR_CONTAINER_KEY } from '@/composables/useCanvasPointer'
import { isText, isImage } from '@/types/element'
import { aabb } from '@/utils/geometry'
import { ensureBox } from '@/utils/transform'
import { rememberTextStyle } from '@/composables/useTextDefaults'
import { useCommands } from '@/composables/useCommands'
import ColorPicker from './ColorPicker.vue'
import UiTooltip from './UiTooltip.vue'

/**
 * Floating mini-toolbar pinned just above the selection bounding box.
 * Mirrors the most-used Inspector actions so users don't have to glance
 * to the side panel. Hidden during drag/resize/rotate and while the
 * element is in text-edit mode.
 */

const store = useSpreadStore()
const container = inject<Ref<HTMLElement | null>>(EDITOR_CONTAINER_KEY)
const tick = ref(0)
const editingText = ref(false)

const selected = computed(() => store.selected)
const textSelected = computed(() => (selected.value && isText(selected.value) ? selected.value : null))
const imageSelected = computed(() => (selected.value && isImage(selected.value) ? selected.value : null))
const { list: commands } = useCommands()
const runById = (id: string) => commands.find((c) => c.id === id)?.run()

// Re-compute screen position on viewport changes.
const onTick = () => { tick.value++ }
onMounted(() => {
  window.addEventListener('resize', onTick)
  window.addEventListener('scroll', onTick, true)
})
onBeforeUnmount(() => {
  window.removeEventListener('resize', onTick)
  window.removeEventListener('scroll', onTick, true)
})

const screenPos = computed(() => {
  tick.value // dep
  const el = selected.value
  const root = container?.value
  if (!el || !root) return null
  const box = aabb(ensureBox(el))
  const rect = root.getBoundingClientRect()
  const x = rect.left + store.pan.x + box.minX * store.zoom + ((box.maxX - box.minX) * store.zoom) / 2
  const y = rect.top + store.pan.y + box.minY * store.zoom
  return { x, y }
})

const visible = computed(() => {
  return !!selected.value && !!screenPos.value && !editingText.value && !selected.value.locked
})

// Detect inline text-editing mode (contenteditable focus on the
// canvas) — when active, hide to avoid covering the text.
const onFocusIn = (e: FocusEvent) => {
  const t = e.target as HTMLElement | null
  editingText.value = !!t?.isContentEditable
}
const onFocusOut = () => { editingText.value = false }
onMounted(() => {
  window.addEventListener('focusin', onFocusIn)
  window.addEventListener('focusout', onFocusOut)
})
onBeforeUnmount(() => {
  window.removeEventListener('focusin', onFocusIn)
  window.removeEventListener('focusout', onFocusOut)
})

const cycleWeight = () => {
  const t = textSelected.value
  if (!t) return
  const cur = t.fontWeight ?? 400
  const next = cur >= 700 ? 400 : 700
  store.updateElement(t.id, { fontWeight: next })
}
const toggleItalic = () => {
  const t = textSelected.value
  if (!t) return
  store.updateElement(t.id, { italic: !t.italic })
}
const toggleUnderline = () => {
  const t = textSelected.value
  if (!t) return
  store.updateElement(t.id, { underline: !t.underline })
}
const setAlign = (align: 'left' | 'center' | 'right') => {
  const t = textSelected.value
  if (!t) return
  store.updateElement(t.id, { align })
  rememberTextStyle({ align })
}
const setColor = (hex: string) => {
  const t = textSelected.value
  if (!t) return
  store.updateElement(t.id, { color: hex })
  rememberTextStyle({ color: hex })
}
</script>

<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition duration-100 ease-out"
      leave-active-class="transition duration-75 ease-in"
      enter-from-class="opacity-0 -translate-y-1"
      enter-to-class="opacity-100 translate-y-0"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
    >
      <div
        v-if="visible && screenPos"
        class="pointer-events-auto fixed z-40 -translate-x-1/2 -translate-y-[calc(100%+10px)] select-none"
        :style="{ left: `${screenPos.x}px`, top: `${screenPos.y}px` }"
      >
        <div class="flex items-center gap-0.5 rounded-md border border-divider bg-ink-800/95 px-1 py-1 shadow-xl ring-1 ring-white/5 backdrop-blur">
          <template v-if="textSelected">
            <UiTooltip text="Bold">
              <button type="button" class="rounded px-2 py-0.5 text-xs font-bold" :class="(textSelected.fontWeight ?? 400) >= 700 ? 'bg-accent text-white' : 'text-ink-200 hover:bg-ink-700'" @click="cycleWeight">B</button>
            </UiTooltip>
            <UiTooltip text="Italic">
              <button type="button" class="rounded px-2 py-0.5 text-xs italic" :class="textSelected.italic ? 'bg-accent text-white' : 'text-ink-200 hover:bg-ink-700'" @click="toggleItalic">I</button>
            </UiTooltip>
            <UiTooltip text="Underline">
              <button type="button" class="rounded px-2 py-0.5 text-xs underline" :class="textSelected.underline ? 'bg-accent text-white' : 'text-ink-200 hover:bg-ink-700'" @click="toggleUnderline">U</button>
            </UiTooltip>

            <div class="mx-1 h-4 w-px bg-divider" />

            <UiTooltip text="Align left">
              <button type="button" class="rounded px-1.5 py-0.5 text-xs" :class="textSelected.align === 'left' ? 'bg-accent text-white' : 'text-ink-200 hover:bg-ink-700'" @click="setAlign('left')">⟵</button>
            </UiTooltip>
            <UiTooltip text="Align center">
              <button type="button" class="rounded px-1.5 py-0.5 text-xs" :class="textSelected.align === 'center' ? 'bg-accent text-white' : 'text-ink-200 hover:bg-ink-700'" @click="setAlign('center')">↔</button>
            </UiTooltip>
            <UiTooltip text="Align right">
              <button type="button" class="rounded px-1.5 py-0.5 text-xs" :class="textSelected.align === 'right' ? 'bg-accent text-white' : 'text-ink-200 hover:bg-ink-700'" @click="setAlign('right')">⟶</button>
            </UiTooltip>

            <div class="mx-1 h-4 w-px bg-divider" />

            <ColorPicker :model-value="textSelected.color" @update:model-value="setColor" />
          </template>

          <template v-if="imageSelected">
            <UiTooltip text="Reset rotation & aspect">
              <button type="button" class="rounded px-2 py-0.5 text-xs text-ink-200 hover:bg-ink-700" @click="runById('image.reset')">↺ reset</button>
            </UiTooltip>
          </template>

          <div v-if="textSelected || imageSelected" class="mx-1 h-4 w-px bg-divider" />

          <UiTooltip text="Duplicate" hotkey="⌘D">
            <button type="button" class="rounded px-2 py-0.5 text-xs text-ink-200 hover:bg-ink-700" @click="runById('edit.duplicate')">⎘</button>
          </UiTooltip>
          <UiTooltip :text="selected?.locked ? 'Unlock' : 'Lock'">
            <button type="button" class="rounded px-2 py-0.5 text-xs text-ink-200 hover:bg-ink-700" @click="runById('arrange.lockToggle')">{{ selected?.locked ? '🔒' : '🔓' }}</button>
          </UiTooltip>
          <UiTooltip text="Delete" hotkey="⌫">
            <button type="button" class="rounded px-2 py-0.5 text-xs text-ink-200 hover:bg-ink-700" @click="runById('edit.delete')">✕</button>
          </UiTooltip>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
