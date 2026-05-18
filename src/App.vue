<script setup lang="ts">
import { computed, onMounted, provide, ref, watch } from 'vue'
import EditorCanvas from '@/components/EditorCanvas.vue'
import Toolbar from '@/components/Toolbar.vue'
import PageSettingsPanel from '@/components/PageSettingsPanel.vue'
import Inspector from '@/components/Inspector.vue'
import CommandPalette from '@/components/CommandPalette.vue'
import ContextMenu from '@/components/ContextMenu.vue'
import SelectionToolbar from '@/components/SelectionToolbar.vue'
import AuthGate from '@/components/AuthGate.vue'
import SpreadsMenu from '@/components/SpreadsMenu.vue'
import PrintView from '@/components/PrintView.vue'
import EditableTitle from '@/components/EditableTitle.vue'
import GeneratorView from '@/components/Generator/GeneratorView.vue'
import ApiKeysSettings from '@/components/Generator/ApiKeysSettings.vue'
import { useSpreadStore } from '@/stores/spreadStore'
import { useAuthStore } from '@/stores/authStore'
import { useGeneratorStore } from '@/stores/generatorStore'
import { supabaseSpreadService } from '@/services/spreadService'
import { usePersistence } from '@/composables/usePersistence'
import { useImageUrls } from '@/composables/useImageUrls'
import { useKeyboardShortcuts } from '@/composables/useKeyboardShortcuts'
import { useClipboardTextPaste } from '@/composables/useClipboardTextPaste'
import { cacheGet, isCacheNewer } from '@/services/localCache'
import { emptySchema } from '@/utils/elementFactory'
import type { ChapterRecord, SpreadRecord, SpreadSchema } from '@/types/element'

const isPrintMode = new URLSearchParams(window.location.search).has('print')

// Top-level screen branching (no router yet). Generator runs as a
// full-screen alternate view — option 1A from the PR design doc.
const isGenerating = ref(false)
const isApiKeysOpen = ref(false)
const openApiKeys = () => {
  isApiKeysOpen.value = true
}
const closeApiKeys = () => {
  isApiKeysOpen.value = false
}

const openGenerator = () => {
  isGenerating.value = true
}

const closeGenerator = () => {
  isGenerating.value = false
}

const handleVariantOpened = async (payload: { angleId: string; schema: unknown }) => {
  // Create a new spread row for the generated variant and load it.
  try {
    const record = await supabaseSpreadService.create(
      `Generated · ${payload.angleId}`,
      payload.schema as SpreadSchema,
    )
    await refreshList()
    await openSpread(record.id)
    isGenerating.value = false
  } catch (err) {
    initError.value = (err as Error).message
  }
}

const store = useSpreadStore()
const auth = useAuthStore()
const generatorStore = useGeneratorStore()

const persistence = usePersistence(supabaseSpreadService)
provide('forceSave', persistence.forceSave)

const imageUrls = useImageUrls(supabaseSpreadService)
provide('imageUrls', imageUrls.urls)

useKeyboardShortcuts({ onSave: () => void persistence.forceSave('manual') })
useClipboardTextPaste()

interface SpreadSummary {
  id: string
  title: string
  updated_at: string
  current_version: number
  schema?: SpreadSchema | unknown
  chapter_id?: string | null
  position?: number
}

const spreads = ref<SpreadSummary[]>([])
const chapters = ref<ChapterRecord[]>([])
const current = ref<SpreadRecord | null>(null)
const listLoading = ref(false)
const initError = ref<string | null>(null)

const LAST_OPENED_KEY = 'stan:lastOpenedSpread'

const refreshList = async () => {
  listLoading.value = true
  try {
    const [list, chapterList] = await Promise.all([
      supabaseSpreadService.list(),
      supabaseSpreadService.listChapters(),
    ])
    spreads.value = list
    chapters.value = chapterList
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

const swapPositions = async <T extends { id: string; position?: number }>(
  list: T[],
  id: string,
  delta: -1 | 1,
  apply: (id: string, position: number) => Promise<void>,
) => {
  const i = list.findIndex((x) => x.id === id)
  const j = i + delta
  if (i === -1 || j < 0 || j >= list.length) return
  const a = list[i]
  const b = list[j]
  const posA = a.position ?? i
  const posB = b.position ?? j
  await Promise.all([apply(a.id, posB), apply(b.id, posA)])
  await refreshList()
}

const moveSpreadInChapter = async (id: string, delta: -1 | 1) => {
  const target = spreads.value.find((s) => s.id === id)
  if (!target) return
  const siblings = spreads.value.filter(
    (s) => (s.chapter_id ?? null) === (target.chapter_id ?? null),
  )
  await swapPositions(siblings, id, delta, supabaseSpreadService.setPosition)
}

const moveSpreadToChapter = async (id: string, chapterId: string | null) => {
  const target = spreads.value.find((s) => s.id === id)
  if (!target) return
  const siblings = spreads.value.filter(
    (s) => (s.chapter_id ?? null) === chapterId && s.id !== id,
  )
  const nextPosition = siblings.reduce((m, s) => Math.max(m, s.position ?? 0), -1) + 1
  await supabaseSpreadService.setChapter(id, chapterId)
  await supabaseSpreadService.setPosition(id, nextPosition)
  await refreshList()
}

const createChapter = async () => {
  const title = prompt('Название главы')
  if (!title?.trim()) return
  await supabaseSpreadService.createChapter(title.trim())
  await refreshList()
}

const renameChapter = async (id: string, title: string) => {
  await supabaseSpreadService.renameChapter(id, title)
  await refreshList()
}

const removeChapter = async (id: string) => {
  const used = spreads.value.filter((s) => s.chapter_id === id)
  if (used.length > 0) {
    alert(
      `Нельзя удалить главу — внутри ${used.length} ${
        used.length === 1 ? 'разворот' : 'разворотов'
      }. Сначала перенеси их в другую главу или в «Без главы».`,
    )
    return
  }
  if (!confirm('Удалить главу?')) return
  await supabaseSpreadService.removeChapter(id)
  await refreshList()
}

const moveChapter = async (id: string, delta: -1 | 1) => {
  await swapPositions(chapters.value, id, delta, supabaseSpreadService.setChapterPosition)
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

const PANELS_KEY = 'stan:panels'
type PanelsState = { pageSettings: boolean; inspector: boolean }
const loadPanels = (): PanelsState => {
  try {
    const raw = localStorage.getItem(PANELS_KEY)
    if (!raw) return { pageSettings: true, inspector: true }
    return { pageSettings: true, inspector: true, ...(JSON.parse(raw) as Partial<PanelsState>) }
  } catch {
    return { pageSettings: true, inspector: true }
  }
}
const panels = ref<PanelsState>(loadPanels())
watch(
  panels,
  (v) => { try { localStorage.setItem(PANELS_KEY, JSON.stringify(v)) } catch { /* ignore */ } },
  { deep: true },
)
const togglePageSettings = () => { panels.value.pageSettings = !panels.value.pageSettings }
const toggleInspector = () => { panels.value.inspector = !panels.value.inspector }

const onKey = (e: KeyboardEvent) => {
  const target = e.target as HTMLElement | null
  if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return
  if (e.key === 'p' || e.key === 'P') { togglePageSettings(); e.preventDefault() }
  if (e.key === 'i' || e.key === 'I') { toggleInspector(); e.preventDefault() }
}
onMounted(() => window.addEventListener('keydown', onKey))

// Open generator from the Cmd+K command palette ("New from materials…").
const onOpenGenerator = () => {
  isGenerating.value = true
}
onMounted(() => window.addEventListener('stan:open-generator', onOpenGenerator))

// Cmd+G shortcut.
const onGeneratorHotkey = (e: KeyboardEvent) => {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'g') {
    e.preventDefault()
    isGenerating.value = true
  }
}
onMounted(() => window.addEventListener('keydown', onGeneratorHotkey))

// Generator surface (or any other component) can open the API-keys modal
// via this event — keeps it decoupled from App.vue imports.
const onOpenApiKeys = () => {
  isApiKeysOpen.value = true
}
onMounted(() => window.addEventListener('stan:open-api-keys', onOpenApiKeys))

// Flush the generator's debounced patch buffer on page hide. Without this,
// hitting F5 within the 400 ms debounce window drops the most-recent
// pipeline result (e.g. the layout schema from stage 4) and the user
// comes back to an earlier stage. `pagehide` is more reliable than
// `beforeunload` (covers mobile/bfcache) and the fetch supabase-js fires
// inherits the keepalive semantics of any in-flight request.
const flushGeneratorOnHide = () => {
  if (generatorStore.hasSession) void generatorStore.flushPending()
}
onMounted(() => window.addEventListener('pagehide', flushGeneratorOnHide))
</script>

<template>
  <PrintView v-if="isPrintMode" />
  <div v-else class="flex h-full flex-col bg-ink-900 text-ink-100">
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
    <template v-else-if="isGenerating">
      <GeneratorView
        @close="closeGenerator"
        @open-variant="handleVariantOpened"
      />
    </template>
    <template v-else>
      <header class="flex items-center justify-between border-b border-ink-700 px-4 py-2">
        <div class="flex items-center gap-3">
          <span class="font-serif text-lg italic text-gold">Stan</span>
          <SpreadsMenu
            :current="current"
            :list="spreads"
            :chapters="chapters"
            :loading="listLoading"
            @open="openSpread"
            @create="createSpread"
            @rename="renameSpread"
            @remove="removeSpread"
            @move-spread="moveSpreadInChapter"
            @move-spread-to-chapter="moveSpreadToChapter"
            @create-chapter="createChapter"
            @rename-chapter="renameChapter"
            @remove-chapter="removeChapter"
            @move-chapter="moveChapter"
            @sign-out="auth.signOut"
          />
          <EditableTitle
            v-if="current"
            :value="headerTitle"
            text-class="text-xs text-ink-500 hover:text-ink-300 cursor-text"
            input-class="rounded bg-ink-700 px-2 py-0.5 text-xs text-ink-100 outline-none focus:ring-1 focus:ring-accent"
            @commit="(v) => current && renameSpread(current.id, v)"
          />
        </div>
        <div class="flex items-center gap-3 text-xs text-ink-400">
          <span v-if="persistence.state.status === 'saving-local'">сохраняется локально…</span>
          <span v-else-if="persistence.state.status === 'saving-remote'">синк с облаком…</span>
          <span v-else-if="persistence.state.status === 'error'" class="text-red-400">ошибка</span>
          <span v-else-if="store.dirty">не сохранено</span>
          <span v-else-if="persistence.state.lastSyncedAt">синк {{ new Date(persistence.state.lastSyncedAt).toLocaleTimeString() }}</span>
          <button
            class="rounded bg-ink-700 px-2 py-1 text-ink-100 hover:bg-ink-600"
            @click="openApiKeys"
            title="API-ключи"
          >🔑</button>
          <button
            class="rounded bg-gold px-2 py-1 text-ink-900 hover:opacity-90"
            @click="openGenerator"
            title="Cmd+G — собрать разворот из материалов"
          >+ Из материалов</button>
          <button
            class="rounded bg-ink-700 px-2 py-1 text-ink-100 hover:bg-ink-600"
            @click="persistence.forceSave('manual')"
            title="Cmd+S"
          >Save</button>
        </div>
      </header>
      <Toolbar
        :spread-id="current?.id ?? null"
        :user-id="auth.user?.id ?? null"
        :inspector-open="panels.inspector"
        :page-settings-open="panels.pageSettings"
        @toggle-inspector="toggleInspector"
        @toggle-page-settings="togglePageSettings"
      />
      <main class="flex flex-1 overflow-hidden">
        <div class="flex-1 overflow-hidden">
          <EditorCanvas v-if="current" />
          <div v-else class="flex h-full items-center justify-center text-ink-400 text-sm">
            <span v-if="initError" class="text-red-400">{{ initError }}</span>
            <span v-else>Загрузка…</span>
          </div>
        </div>
        <Transition
          enter-active-class="transition-all duration-150 ease-out"
          leave-active-class="transition-all duration-100 ease-in"
          enter-from-class="opacity-0 translate-x-2"
          enter-to-class="opacity-100 translate-x-0"
          leave-from-class="opacity-100"
          leave-to-class="opacity-0 translate-x-2"
        >
          <Inspector v-if="current && panels.inspector" />
        </Transition>
        <Transition
          enter-active-class="transition-all duration-150 ease-out"
          leave-active-class="transition-all duration-100 ease-in"
          enter-from-class="opacity-0 translate-x-2"
          enter-to-class="opacity-100 translate-x-0"
          leave-from-class="opacity-100"
          leave-to-class="opacity-0 translate-x-2"
        >
          <PageSettingsPanel v-if="current && panels.pageSettings" />
        </Transition>
      </main>
      <CommandPalette />
      <ContextMenu />
      <SelectionToolbar v-if="current" />
    </template>
    <!-- API-key modal: shown over either the editor or the generator. -->
    <ApiKeysSettings :open="isApiKeysOpen" @close="closeApiKeys" />
  </div>
</template>
