import { describe, expect, it } from 'vitest'
import { composeBrief, evaluateSufficiency } from '@/generator/analyst/brief'
import type { ContentAnalysis, Media } from '@/generator/schemas/brief'

const ca = (overrides: Partial<ContentAnalysis> = {}): ContentAnalysis => ({
  detectedLanguage: 'ru',
  genre: 'essay',
  structure: { sections: [{ id: 's1', content: 'lorem', wordCount: 50 }] },
  tone: { primary: 'reflective' },
  candidatePullquotes: [],
  candidateFactboxes: [],
  naturalBreakpoints: [],
  totalWordCount: 400,
  keyEntities: [],
  themes: ['craft'],
  ...overrides,
})

const m = (id: string, overrides: Partial<Media['semantic']> = {}): Media => ({
  id,
  url: `https://x/${id}.jpg`,
  tech: { width: 1200, height: 800, aspectRatio: 1.5, palette: [] },
  semantic: {
    shotType: 'portrait',
    subject: 'man',
    subjectDetail: 'a man at desk',
    focalPoint: { x: 0.5, y: 0.5 },
    mood: 'warm',
    palette: [],
    hasFaces: true,
    faceCount: 1,
    technicalQuality: 'high',
    editorialFitness: 0.7,
    tags: [],
    caption: '',
    ...overrides,
  },
})

describe('evaluateSufficiency — text', () => {
  it('flags very short text', () => {
    const s = evaluateSufficiency(ca({ totalWordCount: 50 }), [m('a'), m('b')])
    expect(s.textVolume).toBe('too-short')
    expect(s.notes.join(' ')).toMatch(/коротк/)
  })

  it('flags too-long text for one spread', () => {
    const s = evaluateSufficiency(ca({ totalWordCount: 5000 }), [m('a'), m('b')])
    expect(s.textVolume).toBe('too-long-for-spread')
  })

  it('passes for 300–800 words', () => {
    const s = evaluateSufficiency(ca({ totalWordCount: 500 }), [m('a'), m('b', { shotType: 'wide' })])
    expect(s.textVolume).toBe('fits-spread')
  })
})

describe('evaluateSufficiency — media', () => {
  it('flags 0 images as insufficient', () => {
    const s = evaluateSufficiency(ca(), [])
    expect(s.mediaVariety).toBe('insufficient')
  })

  it('flags 1 image as insufficient', () => {
    const s = evaluateSufficiency(ca(), [m('a')])
    expect(s.mediaVariety).toBe('insufficient')
  })

  it('flags monotone moods with ≥3 images', () => {
    const s = evaluateSufficiency(ca(), [
      m('a', { mood: 'warm', shotType: 'portrait' }),
      m('b', { mood: 'warm', shotType: 'closeup' }),
      m('c', { mood: 'warm', shotType: 'detail' }),
    ])
    expect(s.mediaVariety).toBe('monotone')
    expect(s.notes.join(' ')).toMatch(/тональности/)
  })

  it('flags monotone shot types', () => {
    const s = evaluateSufficiency(ca(), [
      m('a', { mood: 'warm' }),
      m('b', { mood: 'cold' }),
    ])
    // 2 images both portrait → shot-type monotone
    expect(s.mediaVariety).toBe('monotone')
  })

  it('passes when shots + moods vary', () => {
    const s = evaluateSufficiency(ca(), [
      m('a', { mood: 'warm', shotType: 'portrait' }),
      m('b', { mood: 'cold', shotType: 'wide' }),
      m('c', { mood: 'neutral', shotType: 'detail' }),
    ])
    expect(s.mediaVariety).toBe('enough')
  })
})

describe('composeBrief', () => {
  it('stamps createdAt and bundles content + media', () => {
    const b = composeBrief(ca(), [m('a', { shotType: 'wide' }), m('b')])
    expect(b.content.themes).toContain('craft')
    expect(b.media).toHaveLength(2)
    expect(b.sufficiency.textVolume).toBe('fits-spread')
    expect(b.createdAt).toMatch(/\d{4}-\d{2}-\d{2}T/)
  })
})
