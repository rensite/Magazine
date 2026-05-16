import type { Pinia } from 'pinia'
import { useSpreadStore } from '@/stores/spreadStore'
import { fitTextToFrame as fitTextSize } from '@/utils/textFit'
import type { ParsedCommand } from './parser'
import { isText, type SpreadElement } from '@/types/element'

export interface ExecuteResult {
  applied: string[]
  skipped: string[]
}

export const executeCommand = (cmd: ParsedCommand, _pinia?: Pinia): ExecuteResult => {
  const store = useSpreadStore()
  const selectedAll = store.selectedAll
  const applied: string[] = []
  const skipped: string[] = []

  if (selectedAll.length === 0) {
    if (cmd.actions.includes('undo')) { store.undo(); applied.push('отменить') }
    else if (cmd.actions.includes('redo')) { store.redo(); applied.push('повторить') }
    else skipped.push('нет выделения')
    return { applied, skipped }
  }

  // Bulk-apply the patch in a single undo entry to every selected
  // element. Text-only fields (fontSize, fontFamily, ...) end up as
  // no-ops on image elements, which is what we want.
  if (Object.keys(cmd.patch).length > 0) {
    store.updateMany(
      selectedAll.map((e) => e.id),
      cmd.patch,
    )
    applied.push(...cmd.recognized)
  }

  const ids = selectedAll.map((e) => e.id)
  const freshEls = (): SpreadElement[] => store.selectedAll

  // Actions (each is a separate undo step). When semantics are "do for
  // each", we iterate the current selection.
  for (const action of cmd.actions) {
    switch (action) {
      case 'delete':
        store.removeMany(ids)
        applied.push(selectedAll.length > 1 ? `удалено x${selectedAll.length}` : 'удалено')
        return { applied, skipped }
      case 'duplicate':
        store.duplicateSelected()
        applied.push(selectedAll.length > 1 ? `дублировано x${selectedAll.length}` : 'дублировано')
        break
      case 'undo': store.undo(); applied.push('отменено'); break
      case 'redo': store.redo(); applied.push('повторено'); break
      case 'reset':
        for (const el of freshEls()) store.resetTransform(el.id)
        applied.push('сброс')
        break
      case 'lock':
        for (const el of freshEls()) if (!el.locked) store.toggleLock(el.id)
        applied.push('заблокировано')
        break
      case 'unlock':
        for (const el of freshEls()) if (el.locked) store.toggleLock(el.id)
        applied.push('разблокировано')
        break
      case 'hide':
        for (const el of freshEls()) if (!el.hidden) store.toggleHidden(el.id)
        applied.push('скрыто')
        break
      case 'show':
        for (const el of freshEls()) if (el.hidden) store.toggleHidden(el.id)
        applied.push('показано')
        break
      case 'front':
        for (const el of freshEls()) store.bringToFront(el.id)
        applied.push('наверх')
        break
      case 'back':
        for (const el of freshEls().slice().reverse()) store.sendToBack(el.id)
        applied.push('вниз')
        break
      case 'fitFrame':
        for (const el of freshEls()) if (isText(el)) store.fitFrameToText(el.id)
        applied.push('рамка по тексту')
        break
      case 'fitText':
        for (const el of freshEls()) {
          if (!isText(el)) continue
          const size = fitTextSize(el, el.width, el.height)
          store.fitTextToFrame(el.id, size)
        }
        applied.push('текст по рамке')
        break
    }
  }

  return { applied, skipped }
}
