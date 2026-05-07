<script setup lang="ts">
import { computed, onMounted, provide, ref, watch } from 'vue'
import EditorCanvas from '@/components/EditorCanvas.vue'
import Toolbar from '@/components/Toolbar.vue'
import PageSettingsPanel from '@/components/PageSettingsPanel.vue'
import AuthGate from '@/components/AuthGate.vue'
import SpreadsMenu from '@/components/SpreadsMenu.vue'
import { useSpreadStore } from '@/stores/spreadStore'
import { useAuthStore } from '@/stores/authStore'
import { supabaseSpreadService } from '@/services/spreadService'
import { usePersistence } from '@/composables/usePersistence'
import { useImageUrls } from '@/composables/useImageUrls'
import { useKeyboardShortcuts } from '@/composables/useKeyboardShortcuts'
import { cacheGet, isCacheNewer } from '@/services/localCache'
import { emptySchema } from '@/utils/elementFactory'
import type { SpreadRecord, SpreadSchema } from '@/types/element'

const store = useSpreadStore()
const auth = useAuthStore()

const persistence = usePersistence(supabaseSpreadService)
provide('forceSave', persistence.forceSave)

const imageUrls = useImageUrls(supabaseSpreadService)
provide('imageUrls', imageUrls.urls)

useKeyboardShortcuts({ onSave: () => void persistence.forceSave('manual') })

interface SpreadSummary {
  id: string
  title: string
  updated_at: string
  current_version: number
  schema?: SpreadSchema | unknown
}

const spreads = ref<SpreadSummary[]>([])
const current = ref<SpreadRecord | null>(null)
const listLoading = ref(false)
const initError = ref<string | null>(null)

const LAST_OPENED_KEY = 'stan:lastOpenedSpread'

const refreshList = async () => {
  listLoading.value = true
  try {
    spreads.value = await supabaseSpreadService.list()
  } catch (err) {
    initError.value = (err as Error).message
  } finally {
    listLoading.value = false
  }
}

const openSpread = async (id: string) => {
  initError.value = null
  try {
    const record = await supabaseSpreadService.load(id)
    const cache = await cacheGet(id)
    const useCache = cache && isCacheNewer(cache, record.updated_at)
    const schema = useCache ? cache!.schema : record.schema
    store.loadSchema(record.id, record.title, schema)
    current.value = { ...record, schema }
    localStorage.setItem(LAST_OPENED_KEY, id)
  } catch (err) {
    initError.value = (err as Error).message
  }
}

const createSpread = async () => {
  try {
    const record = await supabaseSpreadService.create('Untitled', emptySchema())
    await refreshList()
    await openSpread(record.id)
  } catch (err) {
    initError.value = (err as Error).message
  }
}

const renameSpread = async (id: string, title: string) => {
  await supabaseSpreadService.rename(id, title)
  if (current.value?.id === id) current.value = { ...current.value, title }
  if (store.spreadId === id) store.title = title
  await refreshList()
}

const removeSpread = async (id: string) => {
  if (!confirm('Удалить разворот? Это действие нельзя отменить.')) return
  await supabaseSpreadService.remove(id)
  if (current.value?.id === id) current.value = null
  await refreshList()
  if (spreads.value[0]) {
    await openSpread(spreads.value[0].id)
  } else {
    await createSpread()
  }
}

const initForUser = async () => {
  await refreshList()
  const lastOpened = localStorage.getItem(LAST_OPENED_KEY)
  const target =
    (lastOpened && spreads.value.find((s) => s.id === lastOpened)?.id) ||
    spreads.value[0]?.id
  if (target) {
    await openSpread(target)
  } else {
    await createSpread()
  }
}

onMounted(async () => {
  await auth.init()
})

watch(
  () => auth.isAuthenticated,
  async (authed, wasAuthed) => {
    if (authed && !wasAuthed) {
      await initForUser()
    }
    if (!authed && wasAuthed) {
      current.value = null
      spreads.value = []
    }
  },
  { immediate: true },
)

const headerTitle = computed(() => current.value?.title ?? store.title)
</script>

<template>
  <div class="flex h-full flex-col bg-ink-900 text-ink-100">
    <template v-if="!auth.initialized">
      <div class="flex h-full items-center justify-center text-ink-400">…</div>
    </template>
    <template v-else-if="auth.initError">
      <div class="flex h-full items-center justify-center p-8">
        <div class="max-w-md rounded-lg border border-red-500/30 bg-ink-800 p-6 text-sm">
          <p class="font-medium text-red-400">Supabase не настроен</p>
          <p class="mt-2 text-ink-300">{{ auth.initError }}</p>
          <p class="mt-4 text-xs text-ink-400">
            Создай файл <code class="rounded bg-ink-700 px-1 py-0.5 text-ink-100">.env.local</code> в корне проекта:
          </p>
          <pre class="mt-2 rounded bg-ink-900 p-3 text-[11px] text-ink-200">VITE_SUPABASE_URL=https://xxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhb...
VITE_SUPABASE_ASSETS_BUCKET=spread-assets</pre>
          <p class="mt-3 text-xs text-ink-400">Перезапусти <code class="rounded bg-ink-700 px-1 py-0.5">npm run dev</code> — Vite перечитает env.</p>
        </div>
      </div>
    </template>
    <template v-else-if="!auth.isAuthenticated">
      <AuthGate />
    </template>
    <template v-else>
      <header class="flex items-center justify-between border-b border-ink-700 px-4 py-2">
        <div class="flex items-center gap-3">
          <span class="font-serif text-lg italic text-accent">Stan</span>
          <SpreadsMenu
            :current="current"
            :list="spreads"
            :loading="listLoading"
            @open="openSpread"
            @create="createSpread"
            @rename="renameSpread"
            @remove="removeSpread"
            @sign-out="auth.signOut"
          />
          <span class="text-xs text-ink-500">{{ headerTitle }}</span>
        </div>
        <div class="flex items-center gap-3 text-xs text-ink-400">
          <span v-if="persistence.state.status === 'saving-local'">сохраняется локально…</span>
          <span v-else-if="persistence.state.status === 'saving-remote'">синк с облаком…</span>
          <span v-else-if="persistence.state.status === 'error'" class="text-red-400">ошибка</span>
          <span v-else-if="store.dirty">не сохранено</span>
          <span v-else-if="persistence.state.lastSyncedAt">синк {{ new Date(persistence.state.lastSyncedAt).toLocaleTimeString() }}</span>
          <button
            class="rounded bg-ink-700 px-2 py-1 text-ink-100 hover:bg-ink-600"
            @click="persistence.forceSave('manual')"
            title="Cmd+S"
          >Save</button>
        </div>
      </header>
      <Toolbar :spread-id="current?.id ?? null" :user-id="auth.user?.id ?? null" />
      <main class="flex flex-1 overflow-hidden">
        <div class="flex-1 overflow-hidden">
          <EditorCanvas v-if="current" />
          <div v-else class="flex h-full items-center justify-center text-ink-400 text-sm">
            <span v-if="initError" class="text-red-400">{{ initError }}</span>
            <span v-else>Загрузка…</span>
          </div>
        </div>
        <PageSettingsPanel v-if="current" />
      </main>
    </template>
  </div>
</template>
