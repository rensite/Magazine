// Shared prompt scaffolding used by every editor archetype. The archetype
// modules append style-specific addendums on top.

import type { EditorArchetype, EditorInput } from './types'

export const buildSharedEditorPrompt = (
  input: EditorInput,
  archetype: EditorArchetype,
): string => {
  const { brief, angle, uiLanguage } = input
  const sections = brief.content.structure.sections
    .map((s) => `[${s.id}] ${s.heading ?? ''} (${s.wordCount}w): ${s.content.slice(0, 300)}`)
    .join('\n')
  const media = brief.media
    .map(
      (m) =>
        `- ${m.id} (${m.semantic.shotType}, ${m.semantic.mood}, fitness ${m.semantic.editorialFitness.toFixed(2)}): "${m.semantic.subjectDetail}"`,
    )
    .join('\n')

  return `You are editing a spread in the "${archetype.meta.name}" archetype.
References: ${archetype.meta.referenceTitles.join(', ')}.
Archetype description: ${archetype.meta.description}

Story angle: ${angle.title}
Oneliner: ${angle.oneliner}
Hook: ${angle.hook}
Arc: ${angle.arc.opening} → ${angle.arc.development} → ${angle.arc.climax} → ${angle.arc.closing}
Key beats: ${angle.keyBeats.join(' / ')}

Available text sections:
${sections || '(no text)'}

Available media:
${media || '(no media)'}

Defaults for this archetype:
- Grid: ${archetype.defaults.grid.columns} columns, gutter ${archetype.defaults.grid.gutter}px, baseline ${archetype.defaults.grid.baseline}px
- Type pair: display "${archetype.defaults.typePair.display}", text "${archetype.defaults.typePair.text}"
- Palette: paper ${archetype.defaults.palette.paper}, ink ${archetype.defaults.palette.ink}, accents [${archetype.defaults.palette.accents.join(', ')}]
- Violations budget: ${archetype.defaults.violationsBudget}
- Rhythm: ${archetype.defaults.rhythm}

Your job: produce an EditorLlmOutput JSON object with these fields:

1. "selection": { usedTextSections: [id…], droppedTextSections: [{id, reason}], usedMedia: [id…], droppedMedia: [{id, reason}] }
   - Pick the strongest material that supports the angle. Drop the rest with a one-sentence reason.

2. "gaps": [Gap…] — what's missing for this angle to land.
   - kind ∈ missing-text | missing-image | missing-quote | missing-factbox | missing-caption | tonal-imbalance | length-mismatch | image-quality | redundancy
   - priority ∈ critical | recommended | nice-to-have
   - description (${uiLanguage})
   - reason (why it matters for this angle)
   - suggestedAction is one of:
     - { type: "generate-text", brief: "…" }
     - { type: "shoot-photo", brief: "…" }
     - { type: "find-stock", query: "…" }
     - { type: "generate-image", brief: "…", aspectRatio: "4:5"|"16:9"|"1:1", style: "…" }
     - { type: "add-element", element: "pullquote"|"caption"|"factbox", content: "…" }
     - { type: "drop-element", targetId: "…" }
     - { type: "rewrite", targetId: "…", brief: "…" }

3. "partitura": Partitura (the layout score):
   - archetypeId: "${archetype.id}"
   - pageSize: { w: 420, h: 297, units: "mm" } (A4 landscape spread)
   - margins: { top, right, bottom, left } in mm
   - bleed: 3 mm
   - grid: ${JSON.stringify(archetype.defaults.grid)}
   - typeScale: ${JSON.stringify(archetype.defaults.typeScale)}
   - typePair: ${JSON.stringify(archetype.defaults.typePair)}
   - palette: ${JSON.stringify(archetype.defaults.palette)}
   - zones: array of { id, role, span: { col: [start, endEx], row: [start, endEx] }, contentRef }
     - role ∈ masthead | title | deck | body | image-hero | image-detail | pullquote | caption | sidebar | factbox | byline | folio
     - contentRef MUST be either a section id from the brief or a media id
   - accents: array of accents (pullquote/sticker/marker/stamp/divider) — keep within violationsBudget
   - violations: deliberate breaks of grid (rotate / overlap / overflow), each with a numeric seed
   - rhythm: "${archetype.defaults.rhythm}"

4. "editorialNotes": 1–2 sentences explaining the key compositional choice you made.

Hard constraints:
- Every zone's contentRef must reference an id that exists in selection.usedTextSections or selection.usedMedia.
- Never invent text content directly in the partitura — only reference content by id.
- Stay within the violations budget.
- Body text zones should occupy 2–3 columns so the line measure stays readable (45–75ch).

Output language for human-readable strings (description / editorialNotes / partitura content references): ${uiLanguage}.`
}
