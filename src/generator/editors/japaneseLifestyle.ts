// Japanese lifestyle (mina, &Premium, Popeye). Spacious, lots of whitespace,
// detail close-ups, soft palettes, generous captions, restrained type.

import type { EditorArchetype } from './types'
import { buildSharedEditorPrompt } from './shared'

export const japaneseLifestyle: EditorArchetype = {
  id: 'japanese-lifestyle',
  meta: {
    name: 'Японский lifestyle',
    referenceTitles: ['mina', '&Premium', 'Popeye'],
    description:
      'Воздух, белые поля, мягкая палитра, детальные кадры и подписи курсивом.',
  },
  defaults: {
    grid: { columns: 8, gutter: 16, baseline: 14 },
    typeScale: { base: 11, ratio: 1.33 },
    typePair: { display: 'serif', text: 'sans-serif' },
    palette: { paper: '#f8f4ec', ink: '#1a1410', accents: ['#a07050', '#8a8170'] },
    violationsBudget: 1,
    rhythm: 'spacious',
  },
  buildPrompt(input) {
    return (
      buildSharedEditorPrompt(input, this) +
      `

Style notes specific to this archetype:
- Lean into whitespace. Body text rarely exceeds 45% of the spread area.
- Use 2 columns for body in 8-column grid (columns 1–3 and 5–7).
- Detail-shot images often live in a single column, with a long italic caption.
- Pullquotes are small and inline, not block — set 1.4× body size, italic.
- Title is small and quiet; the photographs do the talking.
- Avoid stickers and rotated elements. Violations budget: 1 (one subtle tilt at most).
`
    )
  },
}
