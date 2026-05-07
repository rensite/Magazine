import { reactive, watch } from 'vue'
import { useSpreadStore } from '@/stores/spreadStore'
import { isImage } from '@/types/element'
import type { SpreadService } from '@/services/spreadService'

const isStoragePath = (s: string): boolean =>
  !!s && !/^(data:|blob:|https?:\/\/|\/)/.test(s)

export const useImageUrls = (service: SpreadService) => {
  const store = useSpreadStore()
  const urls = reactive<Record<string, string>>({})

  const refresh = async () => {
    const paths = new Set<string>()
    for (const el of store.elements) {
      if (isImage(el)) {
        if (isStoragePath(el.thumb)) paths.add(el.thumb)
        if (isStoragePath(el.src)) paths.add(el.src)
      }
    }
    const missing = [...paths].filter((p) => !urls[p])
    if (missing.length === 0) return
    try {
      const map = await service.signedUrls(missing)
      Object.assign(urls, map)
    } catch (err) {
      console.warn('signedUrls failed', err)
    }
  }

  watch(
    () => store.elements.length,
    () => {
      void refresh()
    },
    { immediate: true },
  )

  const prefetchFull = () => {
    if (typeof requestIdleCallback === 'undefined') return
    requestIdleCallback(() => {
      for (const el of store.elements) {
        if (isImage(el) && urls[el.src]) {
          const img = new Image()
          img.src = urls[el.src]
        }
      }
    })
  }

  return { urls, refresh, prefetchFull }
}
