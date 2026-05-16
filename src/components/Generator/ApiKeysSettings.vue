<script setup lang="ts">
import { computed, ref } from 'vue'
import { aiCall } from '@/ai'
import {
  clearAllKeys,
  hasKey,
  keysState,
  keysStatus,
  setKey,
} from '@/ai/keys'
import { MissingKeyError, ProviderError, type ProviderId } from '@/ai/types'

defineProps<{ open: boolean }>()
const emit = defineEmits<{ (e: 'close'): void }>()

interface ProviderRow {
  id: ProviderId
  label: string
  placeholder: string
  href: string
  /** Optional sub-line under the label. */
  note: string
}

const providers: ProviderRow[] = [
  {
    id: 'claude',
    label: 'Anthropic Claude',
    placeholder: 'sk-ant-…',
    href: 'https://console.anthropic.com/settings/keys',
    note: 'Text analyst, story angles, editor personas.',
  },
  {
    id: 'gemini',
    label: 'Google Gemini',
    placeholder: 'AIza…',
    href: 'https://aistudio.google.com/app/apikey',
    note: 'Image analysis (vision), image generation fallback.',
  },
  {
    id: 'grok',
    label: 'xAI Grok',
    placeholder: 'xai-…',
    href: 'https://console.x.ai',
    note: 'Fallback for text + primary for image generation.',
  },
]

// Local drafts so the user can edit without committing until they hit Save.
const drafts = ref<Record<ProviderId, string>>({
  claude: keysState().claude ?? '',
  gemini: keysState().gemini ?? '',
  grok: keysState().grok ?? '',
})

// Mask state per provider.
const revealed = ref<Record<ProviderId, boolean>>({
  claude: false,
  gemini: false,
  grok: false,
})

const testState = ref<
  Record<
    ProviderId,
    { status: 'idle' | 'testing' | 'ok' | 'failed'; message?: string }
  >
>({
  claude: { status: 'idle' },
  gemini: { status: 'idle' },
  grok: { status: 'idle' },
})

const status = computed(() => keysStatus())

const save = () => {
  for (const p of providers) {
    setKey(p.id, drafts.value[p.id] ?? '')
  }
  emit('close')
}

const clearOne = (id: ProviderId) => {
  drafts.value[id] = ''
  setKey(id, '')
  testState.value[id] = { status: 'idle' }
}

const clearAll = () => {
  if (!confirm('Удалить все сохранённые ключи?')) return
  clearAllKeys()
  for (const p of providers) drafts.value[p.id] = ''
}

const testProvider = async (id: ProviderId) => {
  // Persist the draft before testing so the provider call uses it.
  setKey(id, drafts.value[id] ?? '')
  if (!hasKey(id)) {
    testState.value[id] = { status: 'failed', message: 'Ключ не указан' }
    return
  }
  testState.value[id] = { status: 'testing' }
  try {
    await aiCall('Reply with exactly "ok".', {
      task: id === 'gemini' ? 'classify' : 'classify',
      provider: id,
      enableFallback: false,
      maxTokens: 10,
      temperature: 0,
    })
    testState.value[id] = { status: 'ok', message: 'Соединение OK' }
  } catch (err) {
    if (err instanceof MissingKeyError) {
      testState.value[id] = { status: 'failed', message: 'Ключ не указан' }
    } else if (err instanceof ProviderError) {
      testState.value[id] = { status: 'failed', message: err.message.slice(0, 120) }
    } else {
      testState.value[id] = {
        status: 'failed',
        message: err instanceof Error ? err.message.slice(0, 120) : 'Ошибка',
      }
    }
  }
}
</script>

<template>
  <Transition
    enter-active-class="transition-opacity duration-150"
    leave-active-class="transition-opacity duration-100"
    enter-from-class="opacity-0"
    leave-to-class="opacity-0"
  >
    <div
      v-if="open"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6"
      @click.self="emit('close')"
    >
      <div class="w-full max-w-2xl rounded-lg bg-ink-900 p-6 shadow-2xl">
        <header class="mb-2 flex items-baseline justify-between">
          <h2 class="font-serif text-xl">Ключи AI-провайдеров</h2>
          <button
            class="text-ink-400 hover:text-ink-100"
            @click="emit('close')"
            aria-label="Закрыть"
          >×</button>
        </header>
        <p class="mb-5 text-xs text-ink-400">
          Ключи хранятся локально в браузере (<code class="rounded bg-ink-800 px-1">localStorage</code>),
          в собранный JS не попадают. Каждый ключ — твой; мы не пересылаем его никуда, кроме самого провайдера.
        </p>

        <div class="space-y-5">
          <section
            v-for="p in providers"
            :key="p.id"
            class="rounded-lg border border-ink-700 bg-ink-800/40 p-4"
          >
            <div class="mb-2 flex items-baseline justify-between">
              <div>
                <p class="text-sm font-medium text-ink-100">{{ p.label }}</p>
                <p class="text-[11px] text-ink-400">{{ p.note }}</p>
              </div>
              <a
                :href="p.href"
                target="_blank"
                rel="noopener"
                class="text-[11px] text-gold hover:underline"
              >Получить ключ →</a>
            </div>

            <div class="flex items-center gap-2">
              <input
                :type="revealed[p.id] ? 'text' : 'password'"
                v-model="drafts[p.id]"
                :placeholder="p.placeholder"
                spellcheck="false"
                autocomplete="off"
                class="flex-1 rounded bg-ink-900 px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-accent"
              />
              <button
                type="button"
                class="rounded bg-ink-700 px-2 py-2 text-xs hover:bg-ink-600"
                :title="revealed[p.id] ? 'Скрыть' : 'Показать'"
                @click="revealed[p.id] = !revealed[p.id]"
              >{{ revealed[p.id] ? '🙈' : '👁' }}</button>
              <button
                type="button"
                :disabled="testState[p.id].status === 'testing'"
                class="rounded bg-ink-700 px-3 py-2 text-xs hover:bg-ink-600 disabled:opacity-40"
                @click="testProvider(p.id)"
              >
                {{ testState[p.id].status === 'testing' ? 'Тест…' : 'Тест' }}
              </button>
              <button
                v-if="drafts[p.id]"
                type="button"
                class="rounded bg-ink-700 px-2 py-2 text-xs hover:bg-ink-600"
                title="Удалить"
                @click="clearOne(p.id)"
              >🗑</button>
            </div>

            <p
              class="mt-2 text-[11px]"
              :class="{
                'text-green-400': testState[p.id].status === 'ok',
                'text-red-400': testState[p.id].status === 'failed',
                'text-ink-400':
                  testState[p.id].status === 'idle' ||
                  testState[p.id].status === 'testing',
              }"
            >
              <template v-if="testState[p.id].status !== 'idle'">
                {{ testState[p.id].message }}
              </template>
              <template v-else-if="status[p.id].hasRuntime">
                Активный ключ сохранён.
              </template>
              <template v-else-if="status[p.id].hasEnv">
                Используется ключ из <code class="rounded bg-ink-800 px-1">.env.local</code>
                (только dev).
              </template>
              <template v-else>
                Ключ не указан.
              </template>
            </p>
          </section>
        </div>

        <footer class="mt-6 flex items-center justify-between">
          <button
            class="text-xs text-ink-400 hover:text-red-400"
            @click="clearAll"
          >Очистить все ключи</button>
          <div class="flex gap-2">
            <button
              class="rounded bg-ink-700 px-4 py-2 text-sm hover:bg-ink-600"
              @click="emit('close')"
            >Отмена</button>
            <button
              class="rounded bg-gold px-4 py-2 text-sm text-ink-900 hover:opacity-90"
              @click="save"
            >Сохранить</button>
          </div>
        </footer>
      </div>
    </div>
  </Transition>
</template>
