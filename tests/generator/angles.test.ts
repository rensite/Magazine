import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { anglesTooSimilar, generateAngles } from '@/generator/angles'
import { __setEnvForTests } from '@/ai/keys'
import type { Brief } from '@/generator/schemas/brief'
import type { StoryAngle } from '@/generator/schemas/angle'

const angle = (overrides: Partial<StoryAngle> = {}): StoryAngle => ({
  id: 'a',
  title: 'Утренний ритуал',
  oneliner: 'про привычку и медленность',
  hook: 'Тёплая чашка.',
  arc: { opening: 'a', development: 'b', climax: 'c', closing: 'd' },
  keyBeats: ['чай', 'тишина', 'свет'],
  recommendedEditor: 'japanese-lifestyle',
  suitabilityScore: 0.8,
  caveats: [],
  ...overrides,
})

describe('anglesTooSimilar', () => {
  it('returns null when angles are conceptually different', () => {
    const out = anglesTooSimilar([
      angle({ id: 'a', title: 'Утренний ритуал', oneliner: 'про медленность' }),
      angle({ id: 'b', title: 'Винтажная эпоха', oneliner: 'возвращение старого' }),
      angle({ id: 'c', title: 'Личностный портрет', oneliner: 'герой и его метод' }),
    ])
    expect(out).toBeNull()
  })

  it('flags two near-duplicate titles', () => {
    const out = anglesTooSimilar([
      angle({ id: 'a', title: 'Утренний ритуал', oneliner: 'медленный чай и тишина' }),
      angle({ id: 'b', title: 'Ритуал утра', oneliner: 'медленный чай в тишине' }),
      angle({ id: 'c', title: 'Винтажная эпоха', oneliner: 'возвращение старого' }),
    ])
    expect(out).toEqual({ i: 0, j: 1 })
  })
})

const jsonResponse = (body: unknown): Response =>
  new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })

const briefStub: Brief = {
  content: {
    detectedLanguage: 'ru',
    genre: 'essay',
    structure: { sections: [{ id: 's1', content: 'Lorem ipsum', wordCount: 100 }] },
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

const goodAnglesPayload = {
  angles: [
    angle({ id: 'a', title: 'Утренний ритуал', oneliner: 'про медленность' }),
    angle({ id: 'b', title: 'Винтажная эпоха', oneliner: 'про эпоху' }),
    angle({ id: 'c', title: 'Личностный портрет', oneliner: 'про героя' }),
    angle({ id: 'd', title: 'Технология как искусство', oneliner: 'про метод' }),
  ],
}

beforeEach(() => {
  __setEnvForTests({ VITE_ANTHROPIC_API_KEY: 'sk-ant-test' })
})

afterEach(() => {
  __setEnvForTests(null)
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('generateAngles', () => {
  it('returns angles when first attempt is diverse enough', async () => {
    const spy = vi.fn(async () =>
      jsonResponse({ content: [{ type: 'text', text: JSON.stringify(goodAnglesPayload) }] }),
    )
    vi.stubGlobal('fetch', spy)
    const out = await generateAngles(briefStub)
    expect(out).toHaveLength(4)
    expect(spy).toHaveBeenCalledOnce()
  })

  it('retries once when first attempt has duplicates', async () => {
    const dupePayload = {
      angles: [
        angle({ id: 'a', title: 'Утренний ритуал', oneliner: 'медленный чай и тишина' }),
        angle({ id: 'b', title: 'Ритуал утра', oneliner: 'медленный чай в тишине' }),
        angle({ id: 'c', title: 'Винтажная эпоха', oneliner: 'возвращение старого' }),
        angle({ id: 'd', title: 'Личностный портрет', oneliner: 'герой и его метод' }),
      ],
    }
    let n = 0
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        n++
        const body = n === 1 ? dupePayload : goodAnglesPayload
        return jsonResponse({ content: [{ type: 'text', text: JSON.stringify(body) }] })
      }),
    )
    const out = await generateAngles(briefStub)
    expect(out.map((a) => a.title)).not.toContain('Ритуал утра')
  })
})
