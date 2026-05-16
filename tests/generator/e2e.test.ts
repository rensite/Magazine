// End-to-end integration test for the full editorial generator pipeline:
// raw text + images → Brief → Angles → Editor → Compiled SpreadSchema v3.
// All LLM calls are mocked via fetch; no network, no Supabase.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { runAnalyst } from '@/generator/analyst'
import { generateAngles } from '@/generator/angles'
import { runEditorsForAngles } from '@/generator/editors'
import { compile, validate } from '@/generator/layout'
import { __setEnvForTests } from '@/ai/keys'

const jsonResponse = (body: unknown): Response =>
  new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })

const TEXT_ANALYSIS = {
  detectedLanguage: 'ru',
  genre: 'essay',
  structure: {
    title: 'Утро',
    sections: [
      { id: 's1', heading: 'Начало', content: 'Каждое утро начинается с чашки.', wordCount: 200 },
      { id: 's2', content: 'Тишина — это форма привычки.', wordCount: 200 },
    ],
  },
  tone: { primary: 'reflective' },
  candidatePullquotes: [
    { text: 'Тишина — это форма', sourceLocation: 's2', strength: 0.9, reason: 'образ' },
  ],
  candidateFactboxes: [],
  naturalBreakpoints: [],
  totalWordCount: 400,
  keyEntities: ['автор'],
  themes: ['ритуал', 'тишина'],
}

const VISION_RESP = {
  shotType: 'environment',
  subject: 'morning room',
  subjectDetail: 'a quiet kitchen at dawn',
  focalPoint: { x: 0.5, y: 0.5 },
  mood: 'serene',
  palette: [],
  hasFaces: false,
  faceCount: 0,
  technicalQuality: 'high',
  editorialFitness: 0.85,
  tags: ['kitchen', 'morning'],
  caption: 'Утренняя кухня.',
}

const ANGLES_RESP = {
  angles: [
    {
      id: 'a-ritual',
      title: 'Утренний ритуал',
      oneliner: 'про привычку и медленность',
      hook: 'Каждое утро начинается с чашки.',
      arc: { opening: 'a', development: 'b', climax: 'c', closing: 'd' },
      keyBeats: ['чай', 'тишина', 'свет'],
      recommendedEditor: 'japanese-lifestyle',
      suitabilityScore: 0.9,
      caveats: [],
    },
    {
      id: 'a-silence',
      title: 'Форма тишины',
      oneliner: 'про звук как материал',
      hook: 'Тишина — это форма.',
      arc: { opening: 'a', development: 'b', climax: 'c', closing: 'd' },
      keyBeats: ['тишина', 'дыхание'],
      recommendedEditor: 'swiss-book',
      suitabilityScore: 0.75,
      caveats: [],
    },
  ],
}

const EDITOR_RESP = (archetypeId: string) => ({
  selection: {
    usedTextSections: ['s1', 's2'],
    droppedTextSections: [],
    usedMedia: ['img1'],
    droppedMedia: [],
  },
  gaps: [
    {
      id: 'gap-1',
      kind: 'missing-image',
      priority: 'recommended',
      description: 'Не хватает закрывающего кадра.',
      reason: 'Финал тонет в тексте.',
      suggestedAction: {
        type: 'generate-image',
        brief: 'a quiet morning room',
        aspectRatio: '4:5',
      },
    },
  ],
  editorialNotes: 'Воздух и spaciousness.',
  partitura: {
    archetypeId,
    pageSize: { w: 420, h: 297, units: 'mm' },
    margins: { top: 15, right: 15, bottom: 15, left: 20 },
    bleed: 3,
    grid: { columns: 8, gutter: 16, baseline: 14 },
    typeScale: { base: 11, ratio: 1.33 },
    typePair: { display: 'serif', text: 'sans-serif' },
    palette: { paper: '#f8f4ec', ink: '#1a1410', accents: ['#a07050'] },
    zones: [
      { id: 'z-title', role: 'title', span: { col: [0, 4], row: [0, 1] }, contentRef: 's1' },
      { id: 'z-body', role: 'body', span: { col: [0, 3], row: [1, 6] }, contentRef: 's2' },
      {
        id: 'z-hero',
        role: 'image-hero',
        span: { col: [4, 8], row: [0, 5] },
        contentRef: 'img1',
      },
    ],
    accents: [],
    violations: [],
    rhythm: 'spacious',
  },
})

beforeEach(() => {
  __setEnvForTests({
    VITE_ANTHROPIC_API_KEY: 'sk-ant-test',
    VITE_GEMINI_API_KEY: 'gem-test',
    VITE_GROK_API_KEY: 'xai-test',
  })
})

afterEach(() => {
  __setEnvForTests(null)
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('editorial generator — full pipeline', () => {
  it('300+ words + 1 image → Brief → 2 angles → 2 valid v3 SpreadSchemas', async () => {
    let claudeCalls = 0
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString()
        if (url.includes('anthropic.com')) {
          claudeCalls++
          // Calls in order: 1) text-analyst, 2) angles, 3+4) editors.
          if (claudeCalls === 1) {
            return jsonResponse({
              content: [{ type: 'text', text: JSON.stringify(TEXT_ANALYSIS) }],
            })
          }
          if (claudeCalls === 2) {
            return jsonResponse({
              content: [{ type: 'text', text: JSON.stringify(ANGLES_RESP) }],
            })
          }
          const archetype = claudeCalls === 3 ? 'japanese-lifestyle' : 'swiss-book'
          return jsonResponse({
            content: [{ type: 'text', text: JSON.stringify(EDITOR_RESP(archetype)) }],
          })
        }
        if (url.includes('googleapis.com')) {
          return jsonResponse({
            candidates: [{ content: { parts: [{ text: JSON.stringify(VISION_RESP) }] } }],
          })
        }
        return new Response('?', { status: 404 })
      }),
    )

    // L1: Brief
    const brief = await runAnalyst({
      rawText: 'Каждое утро ' + 'слово '.repeat(300),
      images: [
        {
          id: 'img1',
          url: 'https://x/morning.jpg',
          tech: { width: 1600, height: 1200, aspectRatio: 1.33, palette: [] },
        },
      ],
    })
    expect(brief.media).toHaveLength(1)
    expect(brief.sufficiency.textVolume).toBe('fits-spread')

    // L2: Angles
    const angles = await generateAngles(brief, { count: 2 })
    expect(angles).toHaveLength(2)
    expect(angles[0].id).toBe('a-ritual')

    // L3: Editors
    const editorResults = await runEditorsForAngles(brief, angles, 'ru')
    expect(editorResults.every((r) => r.output !== null)).toBe(true)

    // L4 + L5: Compile + validate each variant
    const variants = editorResults.map((r) => {
      const schema = compile({ brief, output: r.output! })
      const validation = validate(schema)
      return { angleId: r.angleId, schema: validation.schema, issues: validation.issues }
    })

    expect(variants).toHaveLength(2)
    for (const v of variants) {
      // Every variant produces a v3 schema with at least one of each kind we need.
      expect(v.schema.version).toBe(3)
      const types = new Set(v.schema.elements.map((e) => e.type))
      expect(types.has('text')).toBe(true) // title + body
      expect(types.has('image')).toBe(true) // hero
      // No fatal errors; some warnings are allowed.
      const errors = v.issues.filter((i) => i.severity === 'error' && !i.autoFixed)
      expect(errors).toHaveLength(0)
    }
  })
})
