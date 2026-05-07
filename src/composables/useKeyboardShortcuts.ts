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
