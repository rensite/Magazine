<script setup lang="ts">
import { computed } from 'vue'
import type { SpreadElement, TextElement } from '@/types/element'
import { isText } from '@/types/element'
import { useSpreadStore } from '@/stores/spreadStore'
import { aabb } from '@/utils/geometry'
import { ensureBox } from '@/utils/transform'

const props = defineProps<{ element: SpreadElement }>()
const store = useSpreadStore()

const bbox = computed(() => aabb(ensureBox(props.element)))

const position = computed(() => {
  const b = bbox.value
  const cxCanvas = (b.minX + b.maxX) / 2
  const screenCx = store.pan.x + cxCanvas * store.zoom
  const screenTopY = store.pan.y + b.minY * store.zoom
  return {
    left: `${screenCx}px`,
    top: `${screenTopY - 12}px`,
  }
})

const onScale = (factor: number) => {
  const el = props.element
  if (isText(el)) {
    const next = Math.max(8, Math.min(400, Math.round((el as TextElement).fontSize * factor)))
    if (next !== (el as TextElement).fontSize) {
      store.updateElement(el.id, { fontSize: next })
    }
    return
  }
  const cx = el.x + el.width / 2
  const cy = el.y + el.height / 2
  const w = Math.max(8, el.width * factor)
  const h = Math.max(8, el.height * factor)
  store.updateElement(el.id, {
    width: w,
    height: h,
    x: cx - w / 2,
    y: cy - h / 2,
  } as Partial<SpreadElement>)
}

const rotateBy90 = (dir: 1 | -1) => {
  const next = Math.round((props.element.rotate + dir * 90) / 90) * 90
  store.updateElement(props.element.id, { rotate: next })
}

const angle = computed({
  get: () => Math.round(props.element.rotate),
  set: (v) => {
    const n = Number(v)
    if (Number.isFinite(n)) {
      store.updateElement(props.element.id, { rotate: n })
    }
  },
})

const remove = () => store.removeElement(props.element.id)
</script>

<template>
  <div
    class="pointer-events-auto absolute -translate-x-1/2 -translate-y-full"
    :style="position"
  >
    <div class="flex items-center gap-1 rounded-md border border-ink-600 bg-ink-800/95 px-1 py-1 shadow-xl backdrop-blur">
      <button
        class="rounded px-2 py-1 text-xs text-ink-200 hover:bg-ink-700"
        :title="isText(props.element) ? 'Меньше текст' : 'Уменьшить'"
        @pointerdown.stop
        @click="onScale(0.9)"
      >−</button>
      <button
        class="rounded px-2 py-1 text-xs text-ink-200 hover:bg-ink-700"
        :title="isText(props.element) ? 'Больше текст' : 'Увеличить'"
        @pointerdown.stop
        @click="onScale(1.1)"
      >+</button>
      <span class="mx-1 h-4 w-px bg-ink-600" />
      <button
        class="rounded px-2 py-1 text-xs text-ink-200 hover:bg-ink-700"
        title="Повернуть −90°"
        @pointerdown.stop
        @click="rotateBy90(-1)"
      >↺</button>
      <input
        type="number"
        step="1"
        class="w-14 rounded bg-ink-700 px-1 py-0.5 text-center text-xs text-ink-100"
        title="Угол поворота (°)"
        :value="angle"
        @pointerdown.stop
        @change="angle = Number(($event.target as HTMLInputElement).value)"
      />
      <button
        class="rounded px-2 py-1 text-xs text-ink-200 hover:bg-ink-700"
        title="Повернуть +90°"
        @pointerdown.stop
        @click="rotateBy90(1)"
      >↻</button>
      <span class="mx-1 h-4 w-px bg-ink-600" />
      <button
        class="rounded px-2 py-1 text-xs text-red-400 hover:bg-red-500/20"
        title="Удалить"
        @pointerdown.stop
        @click="remove"
      >×</button>
    </div>
  </div>
</template>
