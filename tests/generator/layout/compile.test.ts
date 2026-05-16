import { describe, expect, it } from 'vitest'
import { compile } from '@/generator/layout'
import type { Brief } from '@/generator/schemas/brief'
import type { EditorOutput } from '@/generator/schemas/editorOutput'

const brief: Brief = {
  content: {
    detectedLanguage: 'ru',
    genre: 'essay',
    structure: {
      sections: [
        { id: 's1', heading: 'Заголовок', content: 'Заголовок разворота', wordCount: 3 },
        { id: 's2', content: 'Тело статьи '.repeat(50), wordCount: 100 },
        { id: 's3', content: 'Подпись к фото', wordCount: 3 },
      ],
    },
    tone: { primary: 'reflective' },
    candidatePullquotes: [],
    candidateFactboxes: [],
    naturalBreakpoints: [],
    totalWordCount: 106,
    keyEntities: [],
    themes: [],
  },
  media: [
    {
      id: 'img1',
      url: 'https://x/img1.jpg',
      tech: { width: 1600, height: 1067, aspectRatio: 1.5, palette: [] },
      semantic: {
        shotType: 'environment',
        subject: 'scene',
        subjectDetail: 'a quiet room',
        focalPoint: { x: 0.5, y: 0.5 },
        mood: 'serene',
        palette: [],
        hasFaces: false,
        faceCount: 0,
        technicalQuality: 'high',
        editorialFitness: 0.9,
        tags: [],
        caption: '',
      },
    },
  ],
  sufficiency: { textVolume: 'fits-spread', mediaVariety: 'enough', notes: [] },
  createdAt: '2025-01-01',
}

const output: EditorOutput = {
  angleId: 'a1',
  archetypeId: 'swiss-book',
  selection: {
    usedTextSections: ['s1', 's2', 's3'],
    droppedTextSections: [],
    usedMedia: ['img1'],
    droppedMedia: [],
  },
  gaps: [],
  editorialNotes: '',
  partitura: {
    archetypeId: 'swiss-book',
    pageSize: { w: 420, h: 297, units: 'mm' },
    margins: { top: 15, right: 15, bottom: 15, left: 20 },
    bleed: 3,
    grid: { columns: 6, gutter: 12, baseline: 13 },
    typeScale: { base: 11, ratio: 1.4 },
    typePair: { display: 'serif', text: 'serif' },
    palette: { paper: '#fafaf7', ink: '#0a0a0a', accents: ['#c1322b'] },
    zones: [
      { id: 'title', role: 'title', span: { col: [0, 4], row: [0, 1] }, contentRef: 's1' },
      { id: 'body', role: 'body', span: { col: [0, 3], row: [1, 8] }, contentRef: 's2' },
      { id: 'hero', role: 'image-hero', span: { col: [3, 6], row: [1, 5] }, contentRef: 'img1' },
      { id: 'cap', role: 'caption', span: { col: [3, 6], row: [5, 6] }, contentRef: 's3' },
    ],
    accents: [
      {
        id: 'q1',
        kind: 'pullquote',
        anchor: { col: 0, row: 9 },
        payload: { content: 'Тишина — это форма.' },
      },
      { id: 'd1', kind: 'divider', anchor: { col: 3, row: 6 }, payload: {} },
    ],
    violations: [{ kind: 'rotate', amount: 3, seed: 1, targetId: 'q1' }],
    rhythm: 'balanced',
  },
}

describe('compile', () => {
  it('produces a SpreadSchema v3 with the right element kinds', () => {
    const schema = compile({ brief, output })
    expect(schema.version).toBe(3)
    const types = schema.elements.map((e) => e.type)
    expect(types).toContain('text') // title + body + caption all use TextElement
    expect(types).toContain('image')
    expect(types).toContain('pullquote')
    expect(types).toContain('shape') // divider
  })

  it('resolves contentRef to actual section/media content', () => {
    const schema = compile({ brief, output })
    const body = schema.elements.find((e) => e.name === 'body')
    expect(body).toBeDefined()
    if (body && body.type === 'text') {
      expect(body.content).toContain('Тело статьи')
    }
    const img = schema.elements.find((e) => e.name === 'hero')
    expect(img).toBeDefined()
    if (img && img.type === 'image') {
      expect(img.src).toBe('https://x/img1.jpg')
      expect(img.naturalWidth).toBe(1600)
    }
  })

  it('applies type scale: title > body > caption', () => {
    const schema = compile({ brief, output })
    const title = schema.elements.find((e) => e.name === 'title')
    const body = schema.elements.find((e) => e.name === 'body')
    const cap = schema.elements.find((e) => e.name === 'cap')
    if (title?.type === 'text' && body?.type === 'text' && cap?.type === 'caption') {
      expect(title.fontSize).toBeGreaterThan(body.fontSize)
      expect(body.fontSize).toBeGreaterThan(cap.fontSize)
    } else {
      throw new Error('expected title/body/cap to be rendered')
    }
  })

  it('is deterministic — same input yields the same coords/rotations', () => {
    const a = compile({ brief, output, seed: 'fixed' })
    const b = compile({ brief, output, seed: 'fixed' })
    // Element IDs are uid-random so we compare by name and geometry.
    const norm = (s: typeof a) =>
      s.elements
        .map((e) => `${e.name ?? ''}|${e.x.toFixed(2)}|${e.y.toFixed(2)}|${e.width.toFixed(2)}|${e.height.toFixed(2)}|${e.rotate.toFixed(2)}`)
        .sort()
    expect(norm(a)).toEqual(norm(b))
  })

  it('honors violations within the ±7° clamp', () => {
    const schema = compile({ brief, output })
    const quote = schema.elements.find((e) => e.type === 'pullquote')
    expect(quote).toBeDefined()
    if (quote) {
      expect(Math.abs(quote.rotate)).toBeLessThanOrEqual(7)
      expect(Math.abs(quote.rotate)).toBeGreaterThan(0)
    }
  })
})
