import { computed } from 'vue'
import { useSpreadStore } from '@/stores/spreadStore'
import { isText, isImage } from '@/types/element'
import { makeTextElement } from '@/utils/elementFactory'
import { textDefaults } from '@/composables/useTextDefaults'
import { fitTextToFrame } from '@/utils/textFit'

export interface Command {
  id: string
  label: string
  group: 'edit' | 'insert' | 'arrange' | 'text' | 'image' | 'view' | 'history'
  hotkey?: string
  keywords?: string
  enabled?: () => boolean
  run: () => void
}

/**
 * Single source of truth for actions exposed via Cmd+K palette and
 * the right-click context menu. The voice parser intentionally lives
 * outside this registry: it operates on free-form RU phrases, while
 * commands here are user-facing English-labelled, hotkey-bound, and
 * stable IDs for analytics.
 */
export const useCommands = () => {
  const store = useSpreadStore()

  const selected = computed(() => store.selected)
  const selectedAll = () => store.selectedAll
  const hasSelection = () => store.selectedCount > 0
  // text-context commands enable when every selected element is text
  const allText = () => store.selectedCount > 0 && selectedAll().every((e) => isText(e))
  const singleImage = () => store.selectedCount === 1 && store.selected !== null && isImage(store.selected)

  const list: Command[] = [
    // Insert
    {
      id: 'insert.text',
      label: 'Insert text block',
      group: 'insert',
      keywords: 'text add new',
      run: () => {
        store.addElement(
          makeTextElement({
            x: 200,
            y: 200,
            fontFamily: textDefaults.fontFamily,
            fontSize: textDefaults.fontSize,
            color: textDefaults.color,
            align: textDefaults.align,
            lineHeight: textDefaults.lineHeight,
          }),
        )
      },
    },
    // History
    {
      id: 'history.undo',
      label: 'Undo',
      group: 'history',
      hotkey: '⌘Z',
      enabled: () => store.canUndo,
      run: () => store.undo(),
    },
    {
      id: 'history.redo',
      label: 'Redo',
      group: 'history',
      hotkey: '⌘⇧Z',
      enabled: () => store.canRedo,
      run: () => store.redo(),
    },
    // Edit
    {
      id: 'edit.duplicate',
      label: 'Duplicate selection',
      group: 'edit',
      hotkey: '⌘D',
      enabled: hasSelection,
      run: () => store.duplicateSelected(),
    },
    {
      id: 'edit.copy',
      label: 'Copy',
      group: 'edit',
      hotkey: '⌘C',
      enabled: hasSelection,
      run: () => store.copySelected(),
    },
    {
      id: 'edit.paste',
      label: 'Paste',
      group: 'edit',
      hotkey: '⌘V',
      enabled: () => store.clipboard !== null,
      run: () => store.paste(),
    },
    {
      id: 'edit.delete',
      label: 'Delete',
      group: 'edit',
      hotkey: '⌫',
      enabled: hasSelection,
      run: () => store.removeMany([...store.selectedIds]),
    },
    {
      id: 'edit.deselect',
      label: 'Deselect',
      group: 'edit',
      hotkey: 'Esc',
      enabled: hasSelection,
      run: () => store.select(null),
    },
    {
      id: 'edit.selectAll',
      label: 'Select all',
      group: 'edit',
      hotkey: '⌘A',
      run: () => store.selectAll(),
    },
    // Arrange — multi-aware: each call iterates the current selection.
    {
      id: 'arrange.front',
      label: 'Bring to front',
      group: 'arrange',
      enabled: hasSelection,
      run: () => { for (const el of selectedAll()) store.bringToFront(el.id) },
    },
    {
      id: 'arrange.back',
      label: 'Send to back',
      group: 'arrange',
      enabled: hasSelection,
      run: () => { for (const el of selectedAll().slice().reverse()) store.sendToBack(el.id) },
    },
    {
      id: 'arrange.lockToggle',
      label: 'Lock / unlock',
      group: 'arrange',
      enabled: hasSelection,
      run: () => { for (const el of selectedAll()) store.toggleLock(el.id) },
    },
    {
      id: 'arrange.hideToggle',
      label: 'Show / hide',
      group: 'arrange',
      enabled: hasSelection,
      run: () => { for (const el of selectedAll()) store.toggleHidden(el.id) },
    },
    // Text — operates on every selected text element.
    {
      id: 'text.fitFrame',
      label: 'Fit frame to text',
      group: 'text',
      enabled: allText,
      run: () => { for (const el of selectedAll()) if (isText(el)) store.fitFrameToText(el.id) },
    },
    {
      id: 'text.fitText',
      label: 'Fit text to frame',
      group: 'text',
      enabled: allText,
      run: () => {
        for (const el of selectedAll()) {
          if (!isText(el)) continue
          const size = fitTextToFrame(el, el.width, el.height)
          store.fitTextToFrame(el.id, size)
        }
      },
    },
    // Image
    {
      id: 'image.reset',
      label: 'Reset rotation & aspect',
      group: 'image',
      enabled: singleImage,
      run: () => selected.value && store.resetTransform(selected.value.id),
    },
  ]

  return { list }
}

export const COMMAND_GROUP_LABEL: Record<Command['group'], string> = {
  edit: 'Edit',
  insert: 'Insert',
  arrange: 'Arrange',
  text: 'Text',
  image: 'Image',
  view: 'View',
  history: 'History',
}
