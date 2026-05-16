import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { availableArchetypes, getArchetype, runEditor, runEditorsForAngles } from '@/generator/editors'
import { __setEnvForTests } from '@/ai/keys'
import type { Brief } from '@/generator/schemas/brief'
import type { StoryAngle } from '@/generator/schemas/angle'

const briefStub: Brief = {
  content: {
    detectedLanguage: 'ru',
    genre: 'essay',
    structure: { sections: [{ id: 's1', content: 'A B C', wordCount: 100 }] },
    tone: { primary: 'reflective' },
    candidatePullquotes: [],
    candidateFactboxes: [],
    naturalBreakpoints: [],
    totalWordCount: 400,
    keyEntities: [],
    themes: ['ritual'],
  },
  media: [],
  sufficiency: { textVolume: 'fits-spread', mediaVariety: 'insufficient', notes: [] },
  createdAt: '2025-01-01T00:00:00Z',
}

const angleStub: StoryAngle = {
  id: 'angle-1',
  title: 'Утренний ритуал',
  oneliner: 'про медленность',
  hook: 'чашка',
  arc: { opening: 'a', development: 'b', climax: 'c', closing: 'd' },
  keyBeats: ['чай', 'тишина'],
  recommendedEditor: 'japanese-lifestyle',
  suitabilityScore: 0.8,
  caveats: [],
}

/** Minimal valid EditorLlmOutput payload for the mocked LLM. */
const editorPayload = (archetypeId: string) => ({
  selection: {
    usedTextSections: ['s1'],
    droppedTextSections: [],
    usedMedia: [],
    droppedMedia: [],
  },
  gaps: [],
  partitura: {
    archetypeId,
    pageSize: { w: 420, h: 297, units: 'mm' },
    margins: { top: 15, right: 15, bottom: 15, left: 20 },
    bleed: 3,
    grid: { columns: 8, gutter: 16, baseline: 14 },
    typeScale: { base: 11, ratio: 1.33 },
    typePair: { display: 'serif', text: 'sans-serif' },
    palette: { paper: '#f8f4ec', ink: '#1a1410', accents: [] },
    zones: [
      { id: 'z1', role: 'title', span: { col: [0, 4], row: [0, 1] }, contentRef: 's1' },
      { id: 'z2', role: 'body', span: { col: [0, 4], row: [1, 4] }, contentRef: 's1' },
    ],
    accents: [],
    violations: [],
    rhythm: 'spacious',
  },
  editorialNotes: 'Воздух и spaciousness.',
})

const jsonResponse = (body: unknown): Response =>
  new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })

beforeEach(() => {
  __setEnvForTests({ VITE_ANTHROPIC_API_KEY: 'sk-ant-test' })
})
afterEach(() => {
  __setEnvForTests(null)
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('archetype registry', () => {
  it('exposes three MVP archetypes', () => {
    const ids = availableArchetypes().map((a) => a.id)
    expect(ids).toEqual(
      expect.arrayContaining(['japanese-lifestyle', 'swiss-book', 'nyt-longread']),
    )
  })

  it('throws on unimplemented archetypes (e.g. apartamento)', () => {
    expect(() => getArchetype('apartamento')).toThrow(/not implemented/)
  })
})

describe('runEditor', () => {
  it('produces EditorOutput stamped with angleId and archetypeId', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({
          content: [{ type: 'text', text: JSON.stringify(editorPayload('japanese-lifestyle')) }],
        }),
      ),
    )
    const out = await runEditor({ brief: briefStub, angle: angleStub })
    expect(out.angleId).toBe('angle-1')
    expect(out.archetypeId).toBe('japanese-lifestyle')
    expect(out.partitura.zones).toHaveLength(2)
  })

  it('honors archetypeId override', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({
          content: [{ type: 'text', text: JSON.stringify(editorPayload('swiss-book')) }],
        }),
      ),
    )
    const out = await runEditor({
      brief: briefStub,
      angle: angleStub,
      archetypeId: 'swiss-book',
    })
    expect(out.archetypeId).toBe('swiss-book')
  })
})

describe('runEditorsForAngles', () => {
  it('parallel-runs editors and tolerates individual failures', async () => {
    let n = 0
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        n++
        if (n === 2) {
          // Second angle: claude fails AND grok fallback fails -> bubble error
          return new Response('boom', { status: 503, statusText: 'down' })
        }
        return jsonResponse({
          content: [{ type: 'text', text: JSON.stringify(editorPayload('japanese-lifestyle')) }],
        })
      }),
    )
    const angles: StoryAngle[] = [
      { ...angleStub, id: 'a1' },
      { ...angleStub, id: 'a2' },
      { ...angleStub, id: 'a3' },
    ]
    const results = await runEditorsForAngles(briefStub, angles, 'ru')
    expect(results).toHaveLength(3)
    const failed = results.find((r) => r.output === null)
    expect(failed).toBeDefined()
    const ok = results.filter((r) => r.output !== null)
    expect(ok.length).toBeGreaterThanOrEqual(1)
  })
})
