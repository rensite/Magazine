import { defineStore } from 'pinia'
import { produceWithPatches, applyPatches, enablePatches, type Patch } from 'immer'
import type {
  BackgroundSettings,
  ElementId,
  Margins,
  Orientation,
  PageSettings,
  PageSide,
  SpreadElement,
  SpreadSchema,
  Unit,
} from '@/types/element'
import { emptySchema, migrateSchema } from '@/utils/elementFactory'

enablePatches()

const HISTORY_LIMIT = 200

interface HistoryEntry {
  patches: Patch[]
  inverse: Patch[]
  label: string
}

interface State {
  spreadId: string | null
  title: string
  schema: SpreadSchema
  selectedId: ElementId | null
  zoom: number
  pan: { x: number; y: number }
  past: HistoryEntry[]
  future: HistoryEntry[]
  txInitial: SpreadSchema | null
  txLabel: string | null
  dirty: boolean
}

export const useSpreadStore = defineStore('spread', {
  state: (): State => ({
    spreadId: null,
    title: 'Untitled',
    schema: emptySchema(),
    selectedId: null,
    zoom: 1,
    pan: { x: 0, y: 0 },
    past: [],
    future: [],
    txInitial: null,
    txLabel: null,
    dirty: false,
  }),
  getters: {
    elements: (s): SpreadElement[] => s.schema.elements,
    selected: (s): SpreadElement | null =>
      s.schema.elements.find((e) => e.id === s.selectedId) ?? null,
    canUndo: (s): boolean => s.past.length > 0,
    canRedo: (s): boolean => s.future.length > 0,
    inTransaction: (s): boolean => s.txInitial !== null,
  },
  actions: {
    loadSchema(spreadId: string, title: string, schema: SpreadSchema | unknown) {
      this.spreadId = spreadId
      this.title = title
      this.schema = migrateSchema(schema)
      this.selectedId = null
      this.past = []
      this.future = []
      this.txInitial = null
      this.txLabel = null
      this.dirty = false
    },

    select(id: ElementId | null) {
      this.selectedId = id
    },

    apply(label: string, recipe: (draft: SpreadSchema) => void) {
      if (this.txInitial) {
        // Inside a transaction: route through updateInteraction.
        this.updateInteraction(recipe)
        return
      }
      const [next, patches, inverse] = produceWithPatches(this.schema, recipe)
      if (patches.length === 0) return
      this.schema = next
      this.past.push({ patches, inverse, label })
      if (this.past.length > HISTORY_LIMIT) this.past.shift()
      this.future = []
      this.dirty = true
    },

    beginInteraction(label: string) {
      if (this.txInitial) {
        // A previous interaction never reached commit/rollback (window blur,
        // element removed mid-drag, etc.). Bail out the orphan tx so the
        // current pointerdown gets a clean slate.
        this.rollbackInteraction()
      }
      this.txInitial = this.schema
      this.txLabel = label
    },

    updateInteraction(recipe: (draft: SpreadSchema) => void) {
      if (!this.txInitial) return
      const [next] = produceWithPatches(this.schema, recipe)
      this.schema = next
    },

    commitInteraction() {
      const initial = this.txInitial
      const label = this.txLabel
      if (!initial || !label) {
        this.txInitial = null
        this.txLabel = null
        return
      }
      const final = this.schema
      const [, patches, inverse] = produceWithPatches(initial, (d) => {
        d.elements = final.elements
        d.background = final.background
        d.pages = final.pages
        d.gutter = final.gutter
        d.units = final.units
        d.orientation = final.orientation
        d.mirrorPages = final.mirrorPages
        d.showGuides = final.showGuides
      })
      if (patches.length > 0) {
        this.past.push({ patches, inverse, label })
        if (this.past.length > HISTORY_LIMIT) this.past.shift()
        this.future = []
        this.dirty = true
      }
      this.txInitial = null
      this.txLabel = null
    },

    rollbackInteraction() {
      if (this.txInitial) {
        this.schema = this.txInitial
      }
      this.txInitial = null
      this.txLabel = null
    },

    undo() {
      if (this.txInitial) this.rollbackInteraction()
      const entry = this.past.pop()
      if (!entry) return
      this.schema = applyPatches(this.schema, entry.inverse)
      this.future.push(entry)
      this.dirty = true
    },

    redo() {
      const entry = this.future.pop()
      if (!entry) return
      this.schema = applyPatches(this.schema, entry.patches)
      this.past.push(entry)
      this.dirty = true
    },

    addElement(el: SpreadElement) {
      this.apply(`add ${el.type}`, (draft) => {
        draft.elements.push(el)
      })
      this.selectedId = el.id
    },

    updateElement(id: ElementId, patch: Partial<SpreadElement>) {
      this.apply('update', (draft) => {
        const i = draft.elements.findIndex((e) => e.id === id)
        if (i === -1) return
        draft.elements[i] = { ...draft.elements[i], ...patch } as SpreadElement
      })
    },

    removeElement(id: ElementId) {
      this.apply('remove', (draft) => {
        draft.elements = draft.elements.filter((e) => e.id !== id)
      })
      if (this.selectedId === id) this.selectedId = null
    },

    bringToFront(id: ElementId) {
      this.apply('bring to front', (draft) => {
        const i = draft.elements.findIndex((e) => e.id === id)
        if (i === -1 || i === draft.elements.length - 1) return
        const [el] = draft.elements.splice(i, 1)
        draft.elements.push(el)
      })
    },

    sendToBack(id: ElementId) {
      this.apply('send to back', (draft) => {
        const i = draft.elements.findIndex((e) => e.id === id)
        if (i === -1 || i === 0) return
        const [el] = draft.elements.splice(i, 1)
        draft.elements.unshift(el)
      })
    },

    resetRotation(id: ElementId) {
      this.apply('reset rotation', (draft) => {
        const el = draft.elements.find((e) => e.id === id)
        if (el) el.rotate = 0
      })
    },

    setZoom(z: number) {
      this.zoom = Math.max(0.1, Math.min(8, z))
    },

    setPan(x: number, y: number) {
      this.pan = { x, y }
    },

    markClean() {
      this.dirty = false
    },

    setUnits(unit: Unit) {
      this.apply('units', (d) => {
        d.units = unit
      })
    },

    setOrientation(o: Orientation) {
      this.apply('orientation', (d) => {
        if (d.orientation === o) return
        d.orientation = o
        for (const side of ['left', 'right'] as const) {
          const p = d.pages[side]
          ;[p.width, p.height] = [p.height, p.width]
        }
      })
    },

    setPageSize(side: PageSide | 'both', width: number, height: number) {
      this.apply('page size', (d) => {
        if (side === 'both' || d.mirrorPages) {
          d.pages.left.width = width
          d.pages.left.height = height
          d.pages.right.width = width
          d.pages.right.height = height
        } else {
          d.pages[side].width = width
          d.pages[side].height = height
        }
      })
    },

    setMargins(side: PageSide | 'both', margins: Partial<Margins>) {
      this.apply('margins', (d) => {
        const apply = (p: PageSettings) => {
          p.margins = { ...p.margins, ...margins }
        }
        if (side === 'both' || d.mirrorPages) {
          apply(d.pages.left)
          apply(d.pages.right)
        } else {
          apply(d.pages[side])
        }
      })
    },

    setBleed(value: number) {
      this.apply('bleed', (d) => {
        d.pages.left.bleed = value
        d.pages.right.bleed = value
      })
    },

    setGutter(value: number) {
      this.apply('gutter', (d) => {
        d.gutter = value
      })
    },

    setMirrorPages(value: boolean) {
      this.apply('mirror pages', (d) => {
        d.mirrorPages = value
        if (value) {
          d.pages.right = JSON.parse(JSON.stringify(d.pages.left))
        }
      })
    },

    setBackground(bg: Partial<BackgroundSettings>) {
      this.apply('background', (d) => {
        d.background = { ...d.background, ...bg } as BackgroundSettings
      })
    },

    toggleGuides() {
      this.apply('guides', (d) => {
        d.showGuides = !d.showGuides
      })
    },

    /**
     * Update layout fields (width/height/x/y) WITHOUT creating a history
     * entry. Used by auto-sizing text where dimensions are a consequence
     * of content, not user intent.
     */
    setLayout(id: ElementId, layout: Partial<Pick<SpreadElement, 'x' | 'y' | 'width' | 'height'>>) {
      const i = this.schema.elements.findIndex((e) => e.id === id)
      if (i === -1) return
      const el = this.schema.elements[i]
      const next = { ...el, ...layout } as SpreadElement
      if (
        next.x === el.x &&
        next.y === el.y &&
        next.width === el.width &&
        next.height === el.height
      )
        return
      const arr = this.schema.elements.slice()
      arr[i] = next
      this.schema = { ...this.schema, elements: arr }
    },
  },
})
