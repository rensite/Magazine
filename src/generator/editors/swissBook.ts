// Swiss book / Helvetica grid. Strict 6-col grid, baseline rigor, ink and
// paper only with one accent. Editorial monk mode — works for essays and
// analytical material.

import type { EditorArchetype } from './types'
import { buildSharedEditorPrompt } from './shared'

export const swissBook: EditorArchetype = {
  id: 'swiss-book',
  meta: {
    name: 'Швейцарская книжная',
    referenceTitles: ['Pin-Up', 'Werk, Bauen + Wohnen', 'Lars Müller Publishers'],
    description:
      'Жёсткая 6-колоночная сетка, базовая линия, гельветика, ноль украшений.',
  },
  defaults: {
    grid: { columns: 6, gutter: 12, baseline: 13 },
    typeScale: { base: 10.5, ratio: 1.25 },
    typePair: { display: 'sans-serif', text: 'sans-serif' },
    palette: { paper: '#fafaf7', ink: '#0a0a0a', accents: ['#c1322b'] },
    violationsBudget: 0,
    rhythm: 'balanced',
  },
  buildPrompt(input) {
    return (
      buildSharedEditorPrompt(input, this) +
      `

Style notes specific to this archetype:
- Six-column grid; body always two columns; title may span 3–6 columns.
- All caps for masthead and section labels. No italics anywhere in display.
- Single accent color used sparingly: pullquote text or a thin rule.
- Pullquotes are block, set in the same sans family as body, 1.6× body size.
- Images are full-bleed or column-aligned. No rotation, no overlap.
- Violations budget: 0. The discipline is the design.
- Caption is set at body size minus 1 step, same column as the image, italic forbidden.
`
    )
  },
}
