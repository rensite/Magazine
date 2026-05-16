<script setup lang="ts">
import { computed, ref } from 'vue'
import SpreadPreview from '@/components/SpreadPreview.vue'
import { useGenerator } from '@/composables/useGenerator'
import { useGapActions } from '@/composables/useGapActions'
import { hasKey } from '@/ai/keys'
import type { StoryAngle } from '@/generator/schemas/angle'
import type { Brief } from '@/generator/schemas/brief'
import type { Gap } from '@/generator/schemas/gap'

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'open-variant', payload: { angleId: string; schema: unknown }): void
}>()

const gen = useGenerator()
const store = gen.store
const gapActions = useGapActions()

interface GeneratedSlot {
  base64?: string
  mimeType?: string
  error?: string
}

const slotFor = (gapId: string, provider: 'grok' | 'gemini'): GeneratedSlot | null => {
  const pair = gapActions.generatedImages.value[gapId]
  if (!pair) return null
  return (pair[provider] as GeneratedSlot | null) ?? null
}

const slotError = (slot: GeneratedSlot | null): string | null =>
  slot && slot.error ? slot.error : null

const slotDataUrl = (slot: GeneratedSlot | null): string | null => {
  if (!slot || !slot.base64) return null
  return `data:${slot.mimeType ?? 'image/jpeg'};base64,${slot.base64}`
}

// First-run guard: text uses Claude → analyst won't run without it; vision
// uses Gemini → image analysis falls back through Claude→Grok. So the
// hard prerequisite is "at least one text-capable provider configured".
const hasAnyKey = computed(() => hasKey('claude') || hasKey('grok') || hasKey('gemini'))
const openApiKeys = () => {
  window.dispatchEvent(new CustomEvent('stan:open-api-keys'))
}

// Step machine: 'upload' → 'brief' → 'angles' → 'variants' → 'detail'
type Step = 'upload' | 'brief' | 'angles' | 'variants' | 'detail'
const step = ref<Step>('upload')

const errorMessage = computed(() => store.session?.errorMessage ?? null)

// ---------- Step 1: upload ----------
const titleInput = ref('')
const pasteText = ref('')

const startNew = async () => {
  await gen.startSession(titleInput.value.trim() || 'Untitled session')
}

const acceptPaste = () => {
  if (!pasteText.value.trim()) return
  gen.addInlineText(pasteText.value)
  pasteText.value = ''
}

const onFiles = async (e: Event) => {
  const input = e.target as HTMLInputElement
  if (!input.files) return
  for (const file of Array.from(input.files)) {
    if (file.type.startsWith('text/') || file.name.endsWith('.md') || file.name.endsWith('.txt')) {
      gen.addInlineText(await file.text(), file.name)
    } else if (file.type.startsWith('image/')) {
      // In a full integration this hands off to useImageImport for Supabase
      // upload + signed URL. For the demo path we use a blob: URL so the
      // generator runs end-to-end without backend dependencies.
      const url = URL.createObjectURL(file)
      const id = `i-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
      await gen.addImage({ id, blob: file, filename: file.name, url })
    }
  }
  input.value = ''
}

const removeMaterial = (id: string) => store.removeMaterial(id)

const proceedToAnalysis = async () => {
  if (store.materials.length === 0) return
  try {
    await gen.runAnalysis()
    step.value = 'brief'
  } catch {
    // error is already stored on the session; UI surfaces it via errorMessage
  }
}

// ---------- Step 2: brief preview ----------
const briefData = computed(() => store.session?.brief as Brief | null)

const acceptBrief = async () => {
  try {
    await gen.runAngles()
    step.value = 'angles'
  } catch {
    /* surfaced via errorMessage */
  }
}

// ---------- Step 3: angles ----------
const angles = computed(() => (store.session?.angles as StoryAngle[] | null) ?? [])
const selectedAngleIds = computed({
  get: () => store.session?.selectedAngleIds ?? [],
  set: (v) => store.patch({ selectedAngleIds: v }),
})

const toggleAngle = (id: string) => {
  const next = new Set(selectedAngleIds.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  selectedAngleIds.value = [...next]
}

const generateVariants = async () => {
  if (selectedAngleIds.value.length === 0) return
  step.value = 'variants'
  try {
    await gen.runEditorsAndCompile()
  } catch {
    /* surfaced */
  }
}

// ---------- Step 4: variants ----------
interface VariantDetail {
  output: { gaps: Gap[]; editorialNotes: string; selection: { droppedTextSections: Array<{ id: string; reason: string }>; droppedMedia: Array<{ id: string; reason: string }> } }
  schema: unknown
  issues: Array<{ message: string; severity: string }>
}
const variants = computed(() => {
  const v = (store.session?.variants ?? {}) as Record<string, VariantDetail>
  return Object.entries(v).map(([angleId, detail]) => ({
    angleId,
    angle: angles.value.find((a) => a.id === angleId),
    ...detail,
  }))
})

const focusedAngleId = ref<string | null>(null)
const focused = computed(() =>
  focusedAngleId.value
    ? variants.value.find((v) => v.angleId === focusedAngleId.value) ?? null
    : null,
)

const openVariantInEditor = (angleId: string, schema: unknown) => {
  store.selectVariant(angleId)
  emit('open-variant', { angleId, schema })
}
</script>

<template>
  <div class="flex h-full flex-col bg-ink-900 text-ink-100">
    <header class="flex items-center justify-between border-b border-ink-700 px-6 py-3">
      <div class="flex items-center gap-4">
        <span class="font-serif text-lg italic text-gold">Stan</span>
        <span class="text-sm text-ink-400">Editorial Generator</span>
      </div>
      <div class="flex items-center gap-3 text-xs text-ink-400">
        <span v-if="errorMessage" class="text-red-400">{{ errorMessage }}</span>
        <span v-if="store.saving">сохраняется…</span>
        <span v-if="gen.isWorking.value">обрабатываем…</span>
        <span
          v-if="store.cost.calls > 0"
          class="rounded bg-ink-800 px-2 py-0.5"
          :title="`In: ${store.cost.totalInputTokens} · Out: ${store.cost.totalOutputTokens} · Calls: ${store.cost.calls}`"
        >
          {{ store.cost.calls }} вызов(ов) · ${{ store.cost.totalUsd.toFixed(3) }}
        </span>
        <button
          v-if="gen.isWorking.value"
          class="rounded bg-ink-700 px-2 py-1 text-ink-100 hover:bg-ink-600"
          @click="gen.cancel()"
        >Отменить</button>
        <button
          class="rounded bg-ink-700 px-3 py-1 text-ink-100 hover:bg-ink-600"
          @click="openApiKeys"
          title="API-ключи"
        >🔑 Ключи</button>
        <button
          class="rounded bg-ink-700 px-3 py-1 text-ink-100 hover:bg-ink-600"
          @click="emit('close')"
        >Закрыть</button>
      </div>
    </header>

    <main class="flex-1 overflow-y-auto px-6 py-8">
      <!-- First-run banner: no provider configured yet. -->
      <div
        v-if="!hasAnyKey"
        class="mb-6 flex items-center justify-between rounded-lg border border-gold/30 bg-gold/5 px-4 py-3 text-sm"
      >
        <div>
          <p class="text-gold">Сначала укажи API-ключ хотя бы одного провайдера.</p>
          <p class="text-[11px] text-ink-400">
            Ключи хранятся локально в твоём браузере, не пересылаются никуда кроме самого провайдера.
          </p>
        </div>
        <button
          class="rounded bg-gold px-3 py-1.5 text-xs text-ink-900 hover:opacity-90"
          @click="openApiKeys"
        >Добавить ключ</button>
      </div>

      <!-- Progress dots -->
      <ol class="mb-6 flex items-center gap-3 text-[11px] uppercase tracking-wide text-ink-400">
        <li :class="step === 'upload' ? 'text-gold' : ''">1. Материалы</li>
        <li>·</li>
        <li :class="step === 'brief' ? 'text-gold' : ''">2. Понимание</li>
        <li>·</li>
        <li :class="step === 'angles' ? 'text-gold' : ''">3. Углы</li>
        <li>·</li>
        <li :class="step === 'variants' || step === 'detail' ? 'text-gold' : ''">4. Варианты</li>
      </ol>

      <!-- Step 1: upload -->
      <section v-if="step === 'upload'" class="max-w-3xl">
        <h2 class="mb-4 font-serif text-2xl">Из чего соберём разворот?</h2>
        <div v-if="!store.session" class="mb-6 flex items-center gap-3">
          <input
            v-model="titleInput"
            placeholder="Название сессии"
            class="flex-1 rounded bg-ink-800 px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-accent"
          />
          <button
            class="rounded bg-gold px-4 py-2 text-sm text-ink-900 hover:opacity-90"
            @click="startNew"
          >Начать</button>
        </div>

        <div v-else>
          <div class="mb-4 rounded-lg border border-dashed border-ink-700 bg-ink-800/50 p-6 text-center">
            <input
              type="file"
              multiple
              accept=".txt,.md,text/*,image/*"
              class="block w-full text-sm text-ink-300"
              @change="onFiles"
            />
            <p class="mt-2 text-xs text-ink-500">
              .txt / .md / .jpg / .png / .webp. Можно несколько за раз.
            </p>
          </div>

          <details class="mb-6 text-sm text-ink-300">
            <summary class="cursor-pointer text-ink-200">или вставить текст</summary>
            <textarea
              v-model="pasteText"
              rows="6"
              class="mt-2 w-full rounded bg-ink-800 p-3 outline-none focus:ring-1 focus:ring-accent"
              placeholder="Скопируй сюда черновик…"
            />
            <button
              class="mt-2 rounded bg-ink-700 px-3 py-1 text-xs hover:bg-ink-600"
              @click="acceptPaste"
            >Добавить</button>
          </details>

          <ul v-if="store.materials.length" class="mb-6 space-y-2">
            <li
              v-for="m in store.materials"
              :key="m.id"
              class="flex items-center justify-between rounded bg-ink-800 px-3 py-2 text-sm"
            >
              <span class="flex-1 truncate">
                <span class="mr-2 text-[10px] uppercase text-ink-500">{{ m.kind }}</span>
                {{ m.filename }}
              </span>
              <button class="text-ink-400 hover:text-red-400" @click="removeMaterial(m.id)">×</button>
            </li>
          </ul>

          <button
            :disabled="store.materials.length === 0 || gen.isWorking.value"
            class="rounded bg-gold px-4 py-2 text-sm text-ink-900 hover:opacity-90 disabled:opacity-40"
            @click="proceedToAnalysis"
          >Разобрать материал →</button>
        </div>
      </section>

      <!-- Step 2: brief -->
      <section v-else-if="step === 'brief' && briefData" class="max-w-3xl">
        <h2 class="mb-4 font-serif text-2xl">Что я понял про материал</h2>
        <dl class="grid grid-cols-2 gap-4 rounded-lg bg-ink-800 p-5 text-sm">
          <div>
            <dt class="text-[10px] uppercase text-ink-500">Жанр</dt>
            <dd>{{ briefData.content.genre }}</dd>
          </div>
          <div>
            <dt class="text-[10px] uppercase text-ink-500">Язык</dt>
            <dd>{{ briefData.content.detectedLanguage }}</dd>
          </div>
          <div>
            <dt class="text-[10px] uppercase text-ink-500">Тон</dt>
            <dd>{{ briefData.content.tone.primary }}</dd>
          </div>
          <div>
            <dt class="text-[10px] uppercase text-ink-500">Слов</dt>
            <dd>{{ briefData.content.totalWordCount }}</dd>
          </div>
          <div class="col-span-2">
            <dt class="text-[10px] uppercase text-ink-500">Темы</dt>
            <dd>{{ briefData.content.themes.join(' · ') || '—' }}</dd>
          </div>
          <div class="col-span-2">
            <dt class="text-[10px] uppercase text-ink-500">Фото</dt>
            <dd>{{ briefData.media.length }} шт.</dd>
          </div>
        </dl>

        <div
          v-if="briefData.sufficiency.notes.length"
          class="mt-4 rounded-lg border border-yellow-500/30 bg-yellow-500/5 p-4 text-sm text-yellow-200"
        >
          <p class="mb-2 text-[10px] uppercase tracking-wide text-yellow-400">Заметки</p>
          <ul class="list-disc space-y-1 pl-4">
            <li v-for="(n, i) in briefData.sufficiency.notes" :key="i">{{ n }}</li>
          </ul>
        </div>

        <div class="mt-6 flex gap-3">
          <button
            class="rounded bg-ink-700 px-3 py-1.5 text-sm hover:bg-ink-600"
            @click="step = 'upload'"
          >← Назад</button>
          <button
            :disabled="gen.isWorking.value"
            class="rounded bg-gold px-4 py-2 text-sm text-ink-900 hover:opacity-90 disabled:opacity-40"
            @click="acceptBrief"
          >Согласен, придумай углы →</button>
        </div>
      </section>

      <!-- Step 3: angles -->
      <section v-else-if="step === 'angles'" class="max-w-5xl">
        <h2 class="mb-4 font-serif text-2xl">Под каким углом рассказать?</h2>
        <p class="mb-6 text-sm text-ink-400">
          Отметь, какие развернуть в полные варианты вёрстки. По умолчанию — все.
        </p>
        <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
          <button
            v-for="a in angles"
            :key="a.id"
            type="button"
            class="rounded-lg border bg-ink-800 p-4 text-left transition hover:bg-ink-700"
            :class="
              selectedAngleIds.includes(a.id)
                ? 'border-gold'
                : 'border-ink-700'
            "
            @click="toggleAngle(a.id)"
          >
            <p class="font-serif text-lg">{{ a.title }}</p>
            <p class="mt-1 text-sm text-ink-300">{{ a.oneliner }}</p>
            <p class="mt-2 text-[10px] uppercase tracking-wide text-ink-500">
              {{ a.recommendedEditor }} · suitability {{ Math.round(a.suitabilityScore * 100) }}%
            </p>
            <p v-if="a.caveats.length" class="mt-1 text-[11px] text-yellow-300/80">
              ⚠ {{ a.caveats.join(' · ') }}
            </p>
          </button>
        </div>
        <div class="mt-6 flex gap-3">
          <button class="rounded bg-ink-700 px-3 py-1.5 text-sm hover:bg-ink-600" @click="step = 'brief'">← Назад</button>
          <button
            :disabled="selectedAngleIds.length === 0 || gen.isWorking.value"
            class="rounded bg-gold px-4 py-2 text-sm text-ink-900 hover:opacity-90 disabled:opacity-40"
            @click="generateVariants"
          >Собрать варианты ({{ selectedAngleIds.length }}) →</button>
        </div>
      </section>

      <!-- Step 4: variants -->
      <section v-else-if="step === 'variants'" class="max-w-6xl">
        <h2 class="mb-4 font-serif text-2xl">Варианты разворота</h2>
        <div v-if="variants.length === 0 && gen.isWorking.value" class="text-sm text-ink-400">
          Редакторы пишут…
        </div>
        <div class="grid grid-cols-1 gap-6 md:grid-cols-2">
          <article
            v-for="v in variants"
            :key="v.angleId"
            class="rounded-lg border border-ink-700 bg-ink-800/50 p-4"
          >
            <SpreadPreview
              v-if="v.schema"
              :schema="v.schema"
              :width="300"
              :height="180"
            />
            <p class="mt-3 font-serif text-lg">{{ v.angle?.title }}</p>
            <p class="text-xs text-ink-400">{{ v.angle?.oneliner }}</p>
            <p class="mt-2 text-[10px] uppercase tracking-wide text-ink-500">
              {{ v.angle?.recommendedEditor }}
            </p>
            <p v-if="v.output?.editorialNotes" class="mt-2 text-xs italic text-ink-300">
              {{ v.output.editorialNotes }}
            </p>
            <p v-if="v.issues?.length" class="mt-2 text-[11px] text-yellow-300/80">
              {{ v.issues.length }} замечание(й) валидатора
            </p>
            <div class="mt-3 flex gap-2">
              <button
                class="rounded bg-gold px-3 py-1 text-xs text-ink-900 hover:opacity-90"
                @click="openVariantInEditor(v.angleId, v.schema)"
              >Открыть в редакторе</button>
              <button
                class="rounded bg-ink-700 px-3 py-1 text-xs hover:bg-ink-600"
                @click="focusedAngleId = v.angleId; step = 'detail'"
              >Разобрать</button>
            </div>
          </article>
        </div>
        <div class="mt-6 flex gap-3">
          <button class="rounded bg-ink-700 px-3 py-1.5 text-sm hover:bg-ink-600" @click="step = 'angles'">← К углам</button>
        </div>
      </section>

      <!-- Step 5: detail -->
      <section v-else-if="step === 'detail' && focused" class="max-w-4xl">
        <h2 class="mb-4 font-serif text-2xl">
          {{ focused.angle?.title }} <span class="text-sm text-ink-400">— разбор</span>
        </h2>

        <div class="grid grid-cols-1 gap-6 md:grid-cols-2">
          <div>
            <h3 class="mb-2 text-[10px] uppercase tracking-wide text-ink-500">Отброшенные секции</h3>
            <ul v-if="focused.output?.selection?.droppedTextSections?.length" class="space-y-1 text-sm text-ink-300">
              <li v-for="d in focused.output.selection.droppedTextSections" :key="d.id">
                <span class="text-ink-500">{{ d.id }}:</span> {{ d.reason }}
              </li>
            </ul>
            <p v-else class="text-sm text-ink-500">— ничего не отброшено</p>
          </div>
          <div>
            <h3 class="mb-2 text-[10px] uppercase tracking-wide text-ink-500">Отброшенные фото</h3>
            <ul v-if="focused.output?.selection?.droppedMedia?.length" class="space-y-1 text-sm text-ink-300">
              <li v-for="d in focused.output.selection.droppedMedia" :key="d.id">
                <span class="text-ink-500">{{ d.id }}:</span> {{ d.reason }}
              </li>
            </ul>
            <p v-else class="text-sm text-ink-500">— ничего не отброшено</p>
          </div>
        </div>

        <h3 class="mb-2 mt-6 text-[10px] uppercase tracking-wide text-ink-500">Чего не хватает</h3>
        <ul v-if="focused.output?.gaps?.length" class="space-y-3">
          <li
            v-for="g in focused.output.gaps"
            :key="g.id"
            class="rounded-lg border border-ink-700 bg-ink-800/50 p-3 text-sm"
          >
            <p>
              <span
                class="mr-2 rounded px-1.5 py-0.5 text-[10px] uppercase"
                :class="
                  g.priority === 'critical'
                    ? 'bg-red-500/20 text-red-300'
                    : g.priority === 'recommended'
                      ? 'bg-yellow-500/20 text-yellow-300'
                      : 'bg-ink-700 text-ink-300'
                "
              >{{ g.priority }}</span>
              <span class="text-ink-100">{{ g.description }}</span>
            </p>
            <p class="mt-1 text-xs text-ink-400">{{ g.reason }}</p>
            <p class="mt-1 text-[11px] uppercase tracking-wide text-ink-500">
              {{ g.kind }} → {{ g.suggestedAction.type }}
            </p>
            <!-- generate-image action: render Grok + Gemini side-by-side -->
            <div v-if="g.suggestedAction.type === 'generate-image'" class="mt-3">
              <button
                v-if="!gapActions.generatedImages.value[g.id]"
                class="rounded bg-ink-700 px-3 py-1 text-xs hover:bg-ink-600"
                :disabled="gapActions.inflight.value.has(g.id)"
                @click="gapActions.generateImagesForGap(g)"
              >
                {{ gapActions.inflight.value.has(g.id) ? 'Генерируем…' : 'Сгенерировать (Grok + Gemini)' }}
              </button>
              <div v-else class="grid grid-cols-2 gap-2">
                <figure
                  v-for="prov in (['grok', 'gemini'] as const)"
                  :key="prov"
                  class="rounded border border-ink-700 bg-ink-900 p-2"
                >
                  <p class="mb-1 text-[10px] uppercase tracking-wide text-ink-500">{{ prov }}</p>
                  <div v-if="!slotFor(g.id, prov)" class="aspect-square animate-pulse bg-ink-800" />
                  <div
                    v-else-if="slotError(slotFor(g.id, prov))"
                    class="aspect-square flex items-center justify-center text-[10px] text-red-300"
                  >
                    {{ slotError(slotFor(g.id, prov)) }}
                  </div>
                  <img
                    v-else-if="slotDataUrl(slotFor(g.id, prov))"
                    :src="slotDataUrl(slotFor(g.id, prov)) ?? ''"
                    class="aspect-square w-full object-cover"
                  />
                </figure>
              </div>
            </div>
          </li>
        </ul>
        <p v-else class="text-sm text-ink-500">— редактор всем доволен</p>

        <div class="mt-6 flex gap-3">
          <button class="rounded bg-ink-700 px-3 py-1.5 text-sm hover:bg-ink-600" @click="step = 'variants'">← К вариантам</button>
          <button
            class="rounded bg-gold px-4 py-2 text-sm text-ink-900 hover:opacity-90"
            @click="openVariantInEditor(focused.angleId, focused.schema)"
          >Открыть этот вариант →</button>
        </div>
      </section>
    </main>
  </div>
</template>
