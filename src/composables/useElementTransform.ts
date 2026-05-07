import { computed, type Ref } from 'vue'
import type { SpreadElement } from '@/types/element'
import { ensureBox, toCssTransform, toSvgTransform } from '@/utils/transform'

export const useElementTransform = (el: Ref<SpreadElement>) => {
  const box = computed(() => ensureBox(el.value))
  return {
    box,
    css: computed(() => toCssTransform(box.value)),
    svg: computed(() => toSvgTransform(box.value)),
  }
}
