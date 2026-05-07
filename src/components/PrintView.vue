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

const sheetMm = computed(() => {
  if (params.format === 'pages') {
    const widthPx = Math.max(store.schema.pages.left.width, store.schema.pages.right.width)
    return {
      width: fromPx(widthPx, 'mm'),
      height: fromPx(canvas.value.height, 'mm'),
    }
  }
  return {
    width: fromPx(canvas.value.width, 'mm'),
    height: fromPx(canvas.value.height, 'mm'),
  }
})

const pageStyle = (
  side: 'left' | 'right' | null,
): Record<string, string> => {
  const bg = store.schema.background
  const bgColor = bg.type === 'plain' ? bg.color ?? '#ffffff' : '#ffffff'
  const base: Record<string, string> = {
    position: 'relative',
    overflow: 'hidden',
    background: bgColor,
    breakAfter: 'page',
    pageBreakAfter: 'always',
  }
  if (side === null) {
    base.width = `${canvas.value.width}px`
    base.height = `${canvas.value.height}px`
  } else {
    const p = store.schema.pages[side]
    base.width = `${p.width}px`
    base.height = `${p.height}px`
  }
  return base
}

const cropMarkLength = 18
const cropMarkOffset = 6

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

const sheets = computed(() => {
  if (status.value !== 'ready') return []
  if (params.format === 'pages') {
    return [
      { kind: 'page' as const, side: 'left' as const },
      { kind: 'page' as const, side: 'right' as const },
    ]
  }
  return [{ kind: 'spread' as const }]
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

    <template v-for="(sheet, idx) in sheets" :key="idx">
      <section
        v-if="sheet.kind === 'spread'"
        class="print-sheet"
        :style="pageStyle(null)"
      >
        <!-- left page background -->
        <div
          class="page-bg"
          :class="store.schema.background.type === 'paper' ? 'paper-texture' : ''"
          :style="{ left: '0px', top: '0px', width: `${store.schema.pages.left.width}px`, height: `${store.schema.pages.left.height}px` }"
        />
        <!-- right page background -->
        <div
          class="page-bg"
          :class="store.schema.background.type === 'paper' ? 'paper-texture' : ''"
          :style="{ left: `${rightX}px`, top: '0px', width: `${store.schema.pages.right.width}px`, height: `${store.schema.pages.right.height}px` }"
        />
        <ElementsLayer />

        <!-- crop marks: corners of left page -->
        <template v-if="params.marks">
          <svg
            class="crop-marks"
            :width="canvas.width"
            :height="canvas.height"
            :viewBox="`0 0 ${canvas.width} ${canvas.height}`"
          >
            <g v-for="(box, i) in [
              { x: 0, y: 0, w: store.schema.pages.left.width, h: store.schema.pages.left.height },
              { x: rightX, y: 0, w: store.schema.pages.right.width, h: store.schema.pages.right.height },
            ]" :key="i" stroke="black" stroke-width="0.5">
              <!-- top-left -->
              <line :x1="box.x - cropMarkOffset - cropMarkLength" :y1="box.y" :x2="box.x - cropMarkOffset" :y2="box.y" />
              <line :x1="box.x" :y1="box.y - cropMarkOffset - cropMarkLength" :x2="box.x" :y2="box.y - cropMarkOffset" />
              <!-- top-right -->
              <line :x1="box.x + box.w + cropMarkOffset" :y1="box.y" :x2="box.x + box.w + cropMarkOffset + cropMarkLength" :y2="box.y" />
              <line :x1="box.x + box.w" :y1="box.y - cropMarkOffset - cropMarkLength" :x2="box.x + box.w" :y2="box.y - cropMarkOffset" />
              <!-- bottom-left -->
              <line :x1="box.x - cropMarkOffset - cropMarkLength" :y1="box.y + box.h" :x2="box.x - cropMarkOffset" :y2="box.y + box.h" />
              <line :x1="box.x" :y1="box.y + box.h + cropMarkOffset" :x2="box.x" :y2="box.y + box.h + cropMarkOffset + cropMarkLength" />
              <!-- bottom-right -->
              <line :x1="box.x + box.w + cropMarkOffset" :y1="box.y + box.h" :x2="box.x + box.w + cropMarkOffset + cropMarkLength" :y2="box.y + box.h" />
              <line :x1="box.x + box.w" :y1="box.y + box.h + cropMarkOffset" :x2="box.x + box.w" :y2="box.y + box.h + cropMarkOffset + cropMarkLength" />
            </g>
          </svg>
        </template>
      </section>

      <section
        v-else
        class="print-sheet"
        :style="pageStyle(sheet.side)"
      >
        <!-- single page: shift canvas so chosen page sits at (0,0) -->
        <div
          class="page-bg"
          :class="store.schema.background.type === 'paper' ? 'paper-texture' : ''"
          :style="{ left: '0px', top: '0px', width: `${store.schema.pages[sheet.side].width}px`, height: `${store.schema.pages[sheet.side].height}px` }"
        />
        <div
          :style="{
            position: 'absolute',
            left: sheet.side === 'left' ? '0px' : `-${rightX}px`,
            top: '0px',
            width: `${canvas.width}px`,
            height: `${canvas.height}px`,
          }"
        >
          <ElementsLayer />
        </div>
      </section>
    </template>
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
.page-bg {
  position: absolute;
}
.crop-marks {
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
