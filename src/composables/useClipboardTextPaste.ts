import { onBeforeUnmount, onMounted } from 'vue'
import { useSpreadStore } from '@/stores/spreadStore'
import { makeTextElement } from '@/utils/elementFactory'
import { textDefaults } from './useTextDefaults'

/**
 * Window-wide paste handler that turns OS clipboard text into a new
 * text block on the canvas.
 *
 * Skip conditions (let browser handle normally):
 *  - target is an input / textarea / contenteditable
 *  - the internal element clipboard is non-empty (Cmd+C of a canvas
 *    element wins over OS text)
 *  - clipboard contains no text/plain payload
 */
const isEditable = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  const tag = target.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
}

const MAX_CHARS = 5000

export const useClipboardTextPaste = () => {
  const store = useSpreadStore()

  const onPaste = (e: ClipboardEvent) => {
    if (isEditable(e.target)) return
    if (store.clipboard) return
    const text = e.clipboardData?.getData('text/plain') ?? ''
    const trimmed = text.replace(/\r/g, '').slice(0, MAX_CHARS)
    if (!trimmed.trim()) return
    e.preventDefault()

    const left = store.schema.pages.left
    // Drop near the top-left margin of the left page; users can move it.
    const x = left.margins.left + 16
    const y = left.margins.top + 16
    store.addElement(
      makeTextElement({
        x,
        y,
        content: trimmed,
        fontFamily: textDefaults.fontFamily,
        fontSize: textDefaults.fontSize,
        color: textDefaults.color,
        align: textDefaults.align,
        lineHeight: textDefaults.lineHeight,
      }),
    )
  }

  onMounted(() => window.addEventListener('paste', onPaste))
  onBeforeUnmount(() => window.removeEventListener('paste', onPaste))
}
