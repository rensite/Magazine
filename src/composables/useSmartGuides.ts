import { reactive } from 'vue'

export interface GuideLabel { x: number; y: number; text: string }

interface GuideState {
  vertical: number[]
  horizontal: number[]
  labels: GuideLabel[]
}

const state = reactive<GuideState>({ vertical: [], horizontal: [], labels: [] })

export const smartGuides = state

export const setSmartGuides = (
  vertical: number[],
  horizontal: number[],
  labels: GuideLabel[] = [],
): void => {
  state.vertical = vertical
  state.horizontal = horizontal
  state.labels = labels
}

export const clearSmartGuides = (): void => {
  if (state.vertical.length) state.vertical = []
  if (state.horizontal.length) state.horizontal = []
  if (state.labels.length) state.labels = []
}
