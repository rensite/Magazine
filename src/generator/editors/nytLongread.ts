// NYT-longread. Big hero photo, serif display, sober two-column body, block
// pullquotes with thin rules, byline + dateline up top.

import type { EditorArchetype } from './types'
import { buildSharedEditorPrompt } from './shared'

export const nytLongread: EditorArchetype = {
  id: 'nyt-longread',
  meta: {
    name: 'NYT-longread',
    referenceTitles: ['NYT Magazine', 'Time', 'The Atlantic'],
    description:
      'Большая обложка-фото, serif display, две колонки тела, инлайн-цитаты с правилами.',
  },
  defaults: {
    grid: { columns: 6, gutter: 14, baseline: 14 },
    typeScale: { base: 11, ratio: 1.4 },
    typePair: { display: 'serif', text: 'serif' },
    palette: { paper: '#fefdfb', ink: '#121212', accents: ['#9b0a0a'] },
    violationsBudget: 1,
    rhythm: 'balanced',
  },
  buildPrompt(input) {
    return (
      buildSharedEditorPrompt(input, this) +
      `

Style notes specific to this archetype:
- One dominant hero image, edge-bleeding to the page top or full-bleed left page.
- Display serif title spans 4–6 columns, weight regular not bold.
- Body in two columns; first paragraph drops the cap or all-caps lead-in.
- Pullquotes: block, with a thin horizontal rule above and below; italic.
- Byline + dateline above title in small caps, tracked.
- Caption set in sans-serif (the only sans in the spread) below image.
- Violations budget: 1 (one accent like a small stamp on a date).
`
    )
  },
}
