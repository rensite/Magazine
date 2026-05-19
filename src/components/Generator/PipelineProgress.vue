<script setup lang="ts">
// Four-stage progress strip rendered above the Generator stage cards.
// Reads `step` from parent (what UI is currently showing) and `progress`
// from the store (what the pipeline is doing right now). A stage is:
//   - "done" if the user has moved past it,
//   - "active" if it's the current UI step (regardless of whether a job
//     is running),
//   - "running" if there's an in-flight job whose `progress.stage` maps
//     to this column,
//   - "pending" otherwise.

import { computed } from 'vue'
import { useGeneratorStore, type PipelineProgress } from '@/stores/generatorStore'

type Step = 'upload' | 'brief' | 'angles' | 'preview' | 'variants' | 'detail'
type Stage = 'brief' | 'angles' | 'preview' | 'variants' | 'result'

const props = defineProps<{ step: Step }>()

const store = useGeneratorStore()
const progress = computed<PipelineProgress | null>(() => store.progress)

const stages: Array<{ id: Stage; label: string }> = [
  { id: 'brief', label: 'Бриф' },
  { id: 'angles', label: 'Углы' },
  { id: 'preview', label: 'План' },
  { id: 'variants', label: 'Варианты' },
  { id: 'result', label: 'Готово' },
]

// UI step → ordinal so we can call earlier stages "done".
const stepOrder: Record<Step, number> = {
  upload: 0,
  brief: 1,
  angles: 2,
  preview: 3,
  variants: 4,
  detail: 5,
}

// Pipeline progress.stage → the visual column it lights up. Note the
// editors-stage tick lights up either "План" or "Варианты" depending on
// whether we're in the preview substep — we route by the current UI step.
const progressColumn = (
  p: PipelineProgress,
  step: Step,
): Stage => {
  if (p.stage === 'analyzing') return 'brief'
  if (p.stage === 'angles') return 'angles'
  if (p.stage === 'compiling') return 'variants'
  // editors-stage callback is shared by preview + editors pipelines.
  return step === 'preview' ? 'preview' : 'variants'
}

const stateOf = (stage: Stage): 'done' | 'running' | 'active' | 'pending' => {
  const stageOrdinal: Record<Stage, number> = {
    brief: 1,
    angles: 2,
    preview: 3,
    variants: 4,
    result: 5,
  }
  const here = stageOrdinal[stage]
  const now = stepOrder[props.step]
  const running = progress.value && progressColumn(progress.value, props.step) === stage
  if (running) return 'running'
  if (now > here) return 'done'
  if (now === here) return 'active'
  return 'pending'
}

const ratio = (stage: Stage): number => {
  if (!progress.value) return 0
  if (progressColumn(progress.value, props.step) !== stage) return 0
  if (progress.value.total <= 0) return 0
  return Math.min(1, progress.value.current / progress.value.total)
}

const activeSubLabel = computed(() => {
  if (!progress.value) return ''
  const { label, current, total } = progress.value
  if (total <= 1) return `${label}…`
  return `${label} ${current}/${total}`
})
</script>

<template>
  <section class="border-b border-ink-700 bg-ink-900/60 px-6 py-3">
    <div class="flex items-stretch gap-2">
      <div
        v-for="(s, i) in stages"
        :key="s.id"
        class="flex flex-1 flex-col gap-1.5"
      >
        <div class="flex items-center gap-2">
          <span
            class="flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-medium"
            :class="{
              'bg-gold text-ink-900': stateOf(s.id) === 'done',
              'bg-accent text-ink-900': stateOf(s.id) === 'running',
              'bg-ink-700 text-ink-100': stateOf(s.id) === 'active',
              'bg-ink-800 text-ink-500': stateOf(s.id) === 'pending',
            }"
          >
            <span v-if="stateOf(s.id) === 'done'">✓</span>
            <span v-else-if="stateOf(s.id) === 'running'" class="block h-2 w-2 animate-pulse rounded-full bg-ink-900" />
            <span v-else>{{ i + 1 }}</span>
          </span>
          <span
            class="text-xs"
            :class="{
              'text-ink-100': stateOf(s.id) !== 'pending',
              'text-ink-500': stateOf(s.id) === 'pending',
            }"
          >{{ s.label }}</span>
        </div>
        <div class="h-1 rounded bg-ink-800">
          <div
            class="h-full rounded transition-all duration-300"
            :class="{
              'bg-gold': stateOf(s.id) === 'done',
              'bg-accent': stateOf(s.id) === 'running',
              'bg-ink-700': stateOf(s.id) === 'active',
              'bg-transparent': stateOf(s.id) === 'pending',
            }"
            :style="{
              width:
                stateOf(s.id) === 'done'
                  ? '100%'
                  : stateOf(s.id) === 'running'
                    ? `${Math.max(8, ratio(s.id) * 100)}%`
                    : stateOf(s.id) === 'active'
                      ? '15%'
                      : '0%',
            }"
          />
        </div>
      </div>
    </div>
    <p v-if="progress" class="mt-2 text-[11px] text-ink-400">{{ activeSubLabel }}</p>
  </section>
</template>
