import { reactive } from 'vue'

interface GuideState {
  vertical: number[]
  horizontal: number[]
}

const state = reactive<GuideState>({ vertical: [], horizontal: [] })

export const smartGuides = state

export const setSmartGuides = (vertical: number[], horizontal: number[]): void => {
  state.vertical = vertical
  state.horizontal = horizontal
}

export const clearSmartGuides = (): void => {
  if (state.vertical.length) state.vertical = []
  if (state.horizontal.length) state.horizontal = []
}
