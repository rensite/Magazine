import { onBeforeUnmount, onMounted } from 'vue'
import { useSpreadStore } from '@/stores/spreadStore'

interface Handlers {
  onSave?: () => void
}

const isEditableTarget = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  const tag = target.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
}

// Only contenteditable counts for clipboard/duplicate intent — focus in a
// toolbar input shouldn't disable Cmd+C/V/D for the selected canvas element.
const isInTextEdit = (target: EventTarget | null): boolean =>
  target instanceof HTMLElement && target.isContentEditable

export const useKeyboardShortcuts = ({ onSave }: Handlers = {}) => {
  const store = useSpreadStore()

  const handler = (e: KeyboardEvent) => {
    const cmd = e.metaKey || e.ctrlKey

    if (cmd && e.key.toLowerCase() === 's') {
      e.preventDefault()
      onSave?.()
      return
    }
    if (cmd && e.key.toLowerCase() === 'z' && !e.shiftKey) {
      e.preventDefault()
      store.undo()
      return
    }
    if ((cmd && e.key.toLowerCase() === 'y') || (cmd && e.shiftKey && e.key.toLowerCase() === 'z')) {
      e.preventDefault()
      store.redo()
      return
    }

    // Clipboard / duplicate: yield only when the user is actually editing
    // text (contenteditable). A focused color picker or number input
    // shouldn't swallow these.
    if (!isInTextEdit(e.target)) {
      if (cmd && e.key.toLowerCase() === 'c' && store.selectedId) {
        e.preventDefault()
        store.copySelected()
        return
      }
      if (cmd && e.key.toLowerCase() === 'v' && store.clipboard) {
        e.preventDefault()
        store.paste()
        return
      }
      if (cmd && e.key.toLowerCase() === 'd' && store.selectedId) {
        e.preventDefault()
        store.duplicateSelected()
        return
      }
    }

    if (isEditableTarget(e.target)) return

    if ((e.key === 'Delete' || e.key === 'Backspace') && store.selectedId) {
      e.preventDefault()
      store.removeElement(store.selectedId)
    }
    if (e.key === 'Escape') {
      store.select(null)
    }
  }

  onMounted(() => window.addEventListener('keydown', handler))
  onBeforeUnmount(() => window.removeEventListener('keydown', handler))
}
