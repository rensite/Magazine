import { inject, provide, type InjectionKey } from 'vue'

export const STATIC_RENDER_KEY: InjectionKey<boolean> = Symbol('staticRender')

export const provideStaticRender = (value: boolean) => {
  provide(STATIC_RENDER_KEY, value)
}

export const useStaticRender = (): boolean =>
  inject(STATIC_RENDER_KEY, false)
