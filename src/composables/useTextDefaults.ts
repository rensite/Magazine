import { reactive, watch } from 'vue'
import type { TextElement } from '@/types/element'

const STORAGE_KEY = 'stan:textDefaults'

type TextDefaults = Pick<
  TextElement,
  'fontFamily' | 'fontSize' | 'color' | 'align' | 'lineHeight'
>

const fallback: TextDefaults = {
  fontFamily: 'serif',
  fontSize: 24,
  color: '#1a1410',
  align: 'left',
  lineHeight: 1.35,
}

const load = (): TextDefaults => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...fallback }
    return { ...fallback, ...(JSON.parse(raw) as Partial<TextDefaults>) }
  } catch {
    return { ...fallback }
  }
}

export const textDefaults = reactive<TextDefaults>(load())

watch(
  textDefaults,
  (value) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(value))
    } catch {
      /* ignore quota / private mode */
    }
  },
  { deep: true },
)

export const rememberTextStyle = (patch: Partial<TextDefaults>) => {
  for (const k of Object.keys(patch) as (keyof TextDefaults)[]) {
    const v = patch[k]
    if (v !== undefined) {
      (textDefaults as Record<keyof TextDefaults, unknown>)[k] = v
    }
  }
}
