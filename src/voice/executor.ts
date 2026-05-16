import type { Pinia } from 'pinia'
import { useSpreadStore } from '@/stores/spreadStore'
import { fitTextToFrame as fitTextSize } from '@/utils/textFit'
import type { ParsedCommand } from './parser'
import { isText } from '@/types/element'

export interface ExecuteResult {
  applied: string[]
  skipped: string[]
}

export const executeCommand = (cmd: ParsedCommand, _pinia?: Pinia): ExecuteResult => {
  const store = useSpreadStore()
  const sel = store.selected
  const applied: string[] = []
  const skipped: string[] = []

  if (!sel) {
    if (cmd.actions.includes('undo')) { store.undo(); applied.push('отменить') }
    else if (cmd.actions.includes('redo')) { store.redo(); applied.push('повторить') }
    else skipped.push('нет выделения')
    return { applied, skipped }
  }

  // Patch first — single undo entry.
  if (Object.keys(cmd.patch).length > 0) {
    store.updateElement(sel.id, cmd.patch)
    applied.push(...cmd.recognized)
  }

  // Actions (each separate undo).
  for (const action of cmd.actions) {
    const fresh = store.selected ?? sel
    switch (action) {
      case 'delete': store.removeElement(fresh.id); applied.push('удалено'); return { applied, skipped }
      case 'duplicate': store.duplicateSelected(); applied.push('дублировано'); break
      case 'undo': store.undo(); applied.push('отменено'); break
      case 'redo': store.redo(); applied.push('повторено'); break
      case 'reset': store.resetTransform(fresh.id); applied.push('сброс'); break
      case 'lock': if (!fresh.locked) store.toggleLock(fresh.id); applied.push('заблокировано'); break
      case 'unlock': if (fresh.locked) store.toggleLock(fresh.id); applied.push('разблокировано'); break
      case 'hide': if (!fresh.hidden) store.toggleHidden(fresh.id); applied.push('скрыто'); break
      case 'show': if (fresh.hidden) store.toggleHidden(fresh.id); applied.push('показано'); break
      case 'front': store.bringToFront(fresh.id); applied.push('наверх'); break
      case 'back': store.sendToBack(fresh.id); applied.push('вниз'); break
      case 'fitFrame': store.fitFrameToText(fresh.id); applied.push('рамка по тексту'); break
      case 'fitText':
        if (isText(fresh)) {
          const size = fitTextSize(fresh, fresh.width, fresh.height)
          store.fitTextToFrame(fresh.id, size)
          applied.push(`текст по рамке (${size})`)
        }
        break
    }
  }

  return { applied, skipped }
}
