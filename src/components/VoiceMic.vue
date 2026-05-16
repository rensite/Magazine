<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useSpreadStore } from '@/stores/spreadStore'
import { useVoiceCommand } from '@/voice/useVoiceCommand'
import { parseCommand } from '@/voice/parser'
import { executeCommand } from '@/voice/executor'

interface Toast { id: number; tone: 'ok' | 'warn' | 'err'; text: string; sub?: string }
const toasts = ref<Toast[]>([])
let toastId = 0
const pushToast = (tone: Toast['tone'], text: string, sub?: string) => {
  const id = ++toastId
  toasts.value.push({ id, tone, text, sub })
  setTimeout(() => { toasts.value = toasts.value.filter((t) => t.id !== id) }, 3500)
}

const store = useSpreadStore()

const handleTranscript = (transcript: string) => {
  const parsed = parseCommand(transcript, { selected: store.selected })
  const hasWork = Object.keys(parsed.patch).length > 0 || parsed.actions.length > 0
  if (!hasWork) {
    pushToast('warn', 'Не понял', transcript)
    return
  }
  if (!store.selected && !parsed.actions.some((a) => a === 'undo' || a === 'redo')) {
    pushToast('warn', 'Сначала выдели элемент', transcript)
    return
  }
  const res = executeCommand(parsed)
  pushToast(
    res.applied.length > 0 ? 'ok' : 'warn',
    res.applied.length > 0 ? `✓ ${res.applied.join(', ')}` : 'ничего не применено',
    parsed.unknown.length > 0 ? `непонятно: ${parsed.unknown.join(' ')}` : undefined,
  )
}

const handleError = (msg: string) => {
  // not-allowed = пользователь не дал доступ к микрофону
  pushToast('err', 'Микрофон недоступен', msg)
}

const { supported, listening, interim, start, stop } = useVoiceCommand({
  onTranscript: handleTranscript,
  onError: handleError,
})

const pressing = ref(false)
const onPointerDown = (e: PointerEvent) => {
  if (e.button !== 0) return
  pressing.value = true
  start()
}
const onPointerUp = () => {
  if (!pressing.value) return
  pressing.value = false
  stop()
}

const onKeyDown = (e: KeyboardEvent) => {
  if (e.code !== 'Space' || e.repeat) return
  const target = e.target as HTMLElement | null
  if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return
  if (!e.shiftKey) return
  e.preventDefault()
  if (!pressing.value) {
    pressing.value = true
    start()
  }
}
const onKeyUp = (e: KeyboardEvent) => {
  if (e.code !== 'Space') return
  if (pressing.value) {
    pressing.value = false
    stop()
  }
}

onMounted(() => {
  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeyDown)
  window.removeEventListener('keyup', onKeyUp)
})
</script>

<template>
  <button
    v-if="supported"
    type="button"
    class="relative rounded px-2 py-1 text-xs"
    :class="listening ? 'bg-red-500 text-white' : 'bg-ink-700 text-ink-200 hover:bg-ink-600'"
    title="Зажми, скажи команду. Хоткей: Shift+Space"
    @pointerdown="onPointerDown"
    @pointerup="onPointerUp"
    @pointerleave="onPointerUp"
    @pointercancel="onPointerUp"
  >
    <span class="inline-flex items-center gap-1">
      <span class="inline-block h-2 w-2 rounded-full" :class="listening ? 'bg-white animate-pulse' : 'bg-red-400'" />
      {{ listening ? 'слушаю…' : 'Mic' }}
    </span>
  </button>
  <span v-else class="text-[10px] text-ink-500" title="Web Speech API недоступен">Mic n/a</span>

  <Teleport to="body">
    <Transition
      enter-active-class="transition-all duration-150 ease-out"
      leave-active-class="transition-all duration-100 ease-in"
      enter-from-class="opacity-0 translate-y-2"
      enter-to-class="opacity-100 translate-y-0"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0 translate-y-2"
    >
      <div v-if="listening && interim" class="pointer-events-none fixed bottom-20 left-1/2 z-50 -translate-x-1/2 rounded bg-ink-900/90 px-4 py-2 text-sm text-ink-100 shadow-lg ring-1 ring-white/5">
        {{ interim }}
      </div>
    </Transition>
    <div class="pointer-events-none fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 flex-col items-center gap-2">
      <TransitionGroup
        enter-active-class="transition-all duration-150 ease-out"
        leave-active-class="transition-all duration-150 ease-in"
        enter-from-class="opacity-0 translate-y-2 scale-95"
        enter-to-class="opacity-100 translate-y-0 scale-100"
        leave-from-class="opacity-100"
        leave-to-class="opacity-0 -translate-y-1 scale-95"
      >
        <div
          v-for="t in toasts"
          :key="t.id"
          class="pointer-events-auto rounded px-3 py-2 text-xs shadow-lg ring-1 ring-white/10"
          :class="{
            'bg-emerald-700 text-emerald-50': t.tone === 'ok',
            'bg-amber-700 text-amber-50': t.tone === 'warn',
            'bg-red-700 text-red-50': t.tone === 'err',
          }"
        >
          <div>{{ t.text }}</div>
          <div v-if="t.sub" class="mt-0.5 text-[10px] opacity-80">{{ t.sub }}</div>
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>
