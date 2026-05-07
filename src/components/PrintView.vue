<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, provide, ref, watch } from 'vue'
import { useSpreadStore } from '@/stores/spreadStore'
import { useAuthStore } from '@/stores/authStore'
import { supabaseSpreadService } from '@/services/spreadService'
import { useImageUrls } from '@/composables/useImageUrls'
import { provideStaticRender } from '@/composables/useStaticRender'
import { rightPageX, spreadCanvasSize } from '@/utils/elementFactory'
import { fromPx } from '@/utils/units'
import ElementsLayer from './ElementsLayer.vue'

interface PrintParams {
  spreadId: string | null
  format: 'spread' | 'pages'
  marks: boolean
  auto: boolean
}

const params = (() => {
  const p = new URLSearchParams(window.location.search)
  const spreadId = p.get('print')
  const format = p.get('format') === 'pages' ? 'pages' : 'spread'
  const marks = p.get('marks') !== '0'
  const auto = p.get('auto') === '1'
  return { spreadId, format, marks, auto } as PrintParams
})()

const store = useSpreadStore()
const auth = useAuthStore()

const imageUrls = useImageUrls(supabaseSpreadService)
provide('imageUrls', imageUrls.urls)
provideStaticRender(true)

const status = ref<'init' | 'loading' | 'ready' | 'error'>('init')
const errorMessage = ref<string | null>(null)

const canvas = computed(() => spreadCanvasSize(store.schema))
const rightX = computed(() => rightPageX(store.schema))

const bleedPx = computed(() =>
  Math.max(store.schema.pages.left.bleed, store.schema.pages.right.bleed),
)

interface Sheet {
  kind: 'spread' | 'page'
  side?: 'left' | 'right'
  trimW: number
  trimH: number
  // canvas-space coordinates of the trim's top-left
  trimOriginX: number
  trimOriginY: number
}

const sheets = computed<Sheet[]>(() => {
  if (status.value !== 'ready') return []
  if (params.format === 'pages') {
    return [
      {
        kind: 'page',
        side: 'left',
        trimW: store.schema.pages.left.width,
        trimH: store.schema.pages.left.height,
        trimOriginX: 0,
        trimOriginY: 0,
      },
      {
        kind: 'page',
        side: 'right',
        trimW: store.schema.pages.right.width,
        trimH: store.schema.pages.right.height,
        trimOriginX: rightX.value,
        trimOriginY: 0,
      },
    ]
  }
  return [
    {
      kind: 'spread',
      trimW: canvas.value.width,
      trimH: canvas.value.height,
      trimOriginX: 0,
      trimOriginY: 0,
    },
  ]
})

const sheetSizePx = (s: Sheet) => ({
  width: s.trimW + bleedPx.value * 2,
  height: s.trimH + bleedPx.value * 2,
})

const firstSheet = computed<Sheet | null>(() => sheets.value[0] ?? null)

const sheetMm = computed(() => {
  const f = firstSheet.value
  const fallbackW = canvas.value.width + bleedPx.value * 2
  const fallbackH = canvas.value.height + bleedPx.value * 2
  const w = f ? sheetSizePx(f).width : fallbackW
  const h = f ? sheetSizePx(f).height : fallbackH
  return { width: fromPx(w, 'mm'), height: fromPx(h, 'mm') }
})

const sheetStyle = (s: Sheet): Record<string, string> => {
  const size = sheetSizePx(s)
  const bg = store.schema.background
  const bgColor = bg.type === 'plain' ? bg.color ?? '#ffffff' : '#ffffff'
  return {
    position: 'relative',
    overflow: 'hidden',
    background: bgColor,
    width: `${size.width}px`,
    height: `${size.height}px`,
    breakAfter: 'page',
    pageBreakAfter: 'always',
  }
}

const cropMarkLength = 18
const cropMarkOffset = 6
const regMarkRadius = 6

const styleTagId = 'print-page-rule'
const writePageRule = () => {
  const existing = document.getElementById(styleTagId)
  if (existing) existing.remove()
  const tag = document.createElement('style')
  tag.id = styleTagId
  tag.textContent = `
    @page { size: ${sheetMm.value.width}mm ${sheetMm.value.height}mm; margin: 0; }
    html, body { background: #ffffff; }
  `
  document.head.appendChild(tag)
}

watch(sheetMm, writePageRule, { immediate: false })

const waitForReady = async () => {
  if (document.fonts && document.fonts.ready) {
    await document.fonts.ready
  }
  const imgs = Array.from(document.querySelectorAll<HTMLImageElement>('.print-sheet img'))
  await Promise.all(
    imgs.map((img) =>
      img.complete && img.naturalWidth > 0
        ? Promise.resolve()
        : new Promise<void>((res) => {
            img.addEventListener('load', () => res(), { once: true })
            img.addEventListener('error', () => res(), { once: true })
          }),
    ),
  )
}

const load = async () => {
  if (!params.spreadId) {
    status.value = 'error'
    errorMessage.value = 'Не указан spread id (?print=<id>).'
    return
  }
  status.value = 'loading'
  try {
    const record = await supabaseSpreadService.load(params.spreadId)
    store.loadSchema(record.id, record.title, record.schema)
    document.title = `${record.title} — print`
    writePageRule()
    await waitForReady()
    status.value = 'ready'
    if (params.auto) {
      requestAnimationFrame(() => window.print())
    }
  } catch (err) {
    status.value = 'error'
    errorMessage.value = (err as Error).message ?? 'Ошибка загрузки'
  }
}

const triggerPrint = () => window.print()
const closeWindow = () => {
  window.close()
  // window.close() is silently ignored if the tab wasn't opened via script.
  // Fall back to going back in history so the user lands on the editor.
  setTimeout(() => {
    if (!window.closed) history.length > 1 ? history.back() : (location.href = '/')
  }, 50)
}

onMounted(async () => {
  await auth.init()
  if (!auth.isAuthenticated) {
    status.value = 'error'
    errorMessage.value = 'Не залогинен. Залогинься в редакторе и открой ссылку снова.'
    return
  }
  await load()
})

onBeforeUnmount(() => {
  document.getElementById(styleTagId)?.remove()
})
</script>

<template>
  <div class="print-root">
    <header class="print-toolbar no-print">
      <span class="title">{{ store.title || '—' }}</span>
      <span class="meta">
        {{ sheetMm.width.toFixed(1) }} × {{ sheetMm.height.toFixed(1) }} mm
        · {{ params.format === 'pages' ? 'страницы' : 'разворот' }}
        · {{ params.marks ? 'с метками' : 'без меток' }}
      </span>
      <button class="btn" :disabled="status !== 'ready'" @click="triggerPrint">Печать</button>
      <button class="btn btn-ghost" @click="closeWindow" title="Закрыть вкладку">✕</button>
    </header>

    <div v-if="status !== 'ready'" class="print-status no-print">
      <span v-if="status === 'init' || status === 'loading'">Готовлю страницу…</span>
      <span v-else-if="status === 'error'" class="error">{{ errorMessage }}</span>
    </div>

    <section
      v-for="(sheet, idx) in sheets"
      :key="idx"
      class="print-sheet"
      :class="store.schema.background.type === 'paper' ? 'paper-texture' : ''"
      :style="sheetStyle(sheet)"
    >
      <!-- canvas content shifted into the trim region; clipping done by the
           sheet's overflow:hidden so anything in the bleed area shows but
           anything outside the sheet is cut off -->
      <div
        :style="{
          position: 'absolute',
          left: `${bleedPx - sheet.trimOriginX}px`,
          top: `${bleedPx - sheet.trimOriginY}px`,
          width: `${canvas.width}px`,
          height: `${canvas.height}px`,
        }"
      >
        <ElementsLayer />
      </div>

      <!-- marks layer: crop + registration in sheet coordinates -->
      <svg
        v-if="params.marks"
        class="print-marks"
        :width="sheetSizePx(sheet).width"
        :height="sheetSizePx(sheet).height"
        :viewBox="`0 0 ${sheetSizePx(sheet).width} ${sheetSizePx(sheet).height}`"
      >
        <!-- crop marks at trim corners (offset by bleed inside sheet) -->
        <g stroke="black" stroke-width="0.5" fill="none">
          <!-- corner positions in sheet coords -->
          <template v-for="(corner, ci) in [
            { x: bleedPx, y: bleedPx, sx: -1, sy: -1 },
            { x: bleedPx + sheet.trimW, y: bleedPx, sx: 1, sy: -1 },
            { x: bleedPx, y: bleedPx + sheet.trimH, sx: -1, sy: 1 },
            { x: bleedPx + sheet.trimW, y: bleedPx + sheet.trimH, sx: 1, sy: 1 },
          ]" :key="ci">
            <line
              :x1="corner.x + corner.sx * cropMarkOffset"
              :y1="corner.y"
              :x2="corner.x + corner.sx * (cropMarkOffset + cropMarkLength)"
              :y2="corner.y"
            />
            <line
              :x1="corner.x"
              :y1="corner.y + corner.sy * cropMarkOffset"
              :x2="corner.x"
              :y2="corner.y + corner.sy * (cropMarkOffset + cropMarkLength)"
            />
          </template>
        </g>
        <!-- registration marks (crosshair circles) at sheet corners,
             centered between trim and sheet edges -->
        <g stroke="black" stroke-width="0.4" fill="none">
          <template v-for="(reg, ri) in [
            { x: bleedPx / 2, y: bleedPx / 2 },
            { x: sheetSizePx(sheet).width - bleedPx / 2, y: bleedPx / 2 },
            { x: bleedPx / 2, y: sheetSizePx(sheet).height - bleedPx / 2 },
            { x: sheetSizePx(sheet).width - bleedPx / 2, y: sheetSizePx(sheet).height - bleedPx / 2 },
          ]" :key="ri">
            <circle :cx="reg.x" :cy="reg.y" :r="regMarkRadius" />
            <line :x1="reg.x - regMarkRadius * 1.6" :y1="reg.y" :x2="reg.x + regMarkRadius * 1.6" :y2="reg.y" />
            <line :x1="reg.x" :y1="reg.y - regMarkRadius * 1.6" :x2="reg.x" :y2="reg.y + regMarkRadius * 1.6" />
          </template>
        </g>
      </svg>
    </section>
  </div>
</template>

<style scoped>
.print-root {
  background: #2c2f36;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 24px 0 64px;
  gap: 24px;
}
.print-toolbar {
  position: sticky;
  top: 0;
  z-index: 10;
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 8px 16px;
  background: #1a1c20;
  color: #d8dadf;
  border-radius: 6px;
  font-size: 12px;
}
.print-toolbar .title { font-style: italic; }
.print-toolbar .meta { color: #8a909a; }
.print-toolbar .btn {
  background: #d4a85f;
  color: #1a1410;
  border: none;
  padding: 6px 14px;
  border-radius: 4px;
  cursor: pointer;
}
.print-toolbar .btn[disabled] { opacity: 0.5; cursor: default; }
.print-toolbar .btn-ghost {
  background: transparent;
  color: #d8dadf;
  padding: 4px 10px;
}
.print-toolbar .btn-ghost:hover { background: #2a2d33; }
.print-status { color: #d8dadf; font-size: 13px; }
.print-status .error { color: #f87171; }

.print-sheet {
  background: white;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.4);
}
.print-marks {
  position: absolute;
  left: 0;
  top: 0;
  pointer-events: none;
}

@media print {
  .no-print { display: none !important; }
  .print-root {
    background: white;
    padding: 0;
    gap: 0;
    min-height: 0;
  }
  .print-sheet {
    box-shadow: none;
    margin: 0;
  }
}
</style>
