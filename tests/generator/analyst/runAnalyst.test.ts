import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { runAnalyst } from '@/generator/analyst'
import { __setEnvForTests } from '@/ai/keys'

const jsonResponse = (body: unknown): Response =>
  new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })

const mockTextAnalysis = {
  detectedLanguage: 'ru',
  genre: 'essay',
  structure: {
    title: 'Утро',
    sections: [{ id: 's1', content: 'Каждое утро…', wordCount: 200 }],
  },
  tone: { primary: 'reflective' },
  candidatePullquotes: [],
  candidateFactboxes: [],
  naturalBreakpoints: [],
  totalWordCount: 400,
  keyEntities: [],
  themes: ['ritual'],
}

const mockVisionResp = {
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
  caption: 'Утро',
}

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

describe('runAnalyst', () => {
  it('runs text + vision in parallel and composes a Brief', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString()
        if (url.includes('anthropic.com')) {
          return jsonResponse({
            content: [{ type: 'text', text: JSON.stringify(mockTextAnalysis) }],
          })
        }
        if (url.includes('googleapis.com')) {
          return jsonResponse({
            candidates: [{ content: { parts: [{ text: JSON.stringify(mockVisionResp) }] } }],
          })
        }
        return new Response('not found', { status: 404 })
      }),
    )
    const brief = await runAnalyst({
      rawText: 'Каждое утро ' + 'слово '.repeat(200),
      images: [
        {
          id: 'img1',
          url: 'https://x/y.jpg',
          tech: { width: 1200, height: 800, aspectRatio: 1.5, palette: [] },
        },
      ],
    })
    expect(brief.content.themes).toContain('ritual')
    expect(brief.media).toHaveLength(1)
    expect(brief.media[0].semantic.subject).toBe('man')
    expect(brief.sufficiency.textVolume).toBe('fits-spread')
  })

  it('handles 0 images gracefully', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({
          content: [{ type: 'text', text: JSON.stringify(mockTextAnalysis) }],
        }),
      ),
    )
    const brief = await runAnalyst({
      rawText: 'Каждое утро ' + 'слово '.repeat(200),
      images: [],
    })
    expect(brief.media).toEqual([])
    expect(brief.sufficiency.mediaVariety).toBe('insufficient')
  })

  it('tolerates partial vision failure — keeps Brief but drops the failed image', async () => {
    let visionCalls = 0
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString()
        if (url.includes('anthropic.com')) {
          return jsonResponse({
            content: [{ type: 'text', text: JSON.stringify(mockTextAnalysis) }],
          })
        }
        // Gemini fails persistently on the second image, succeeds on the first.
        if (url.includes('googleapis.com') || url.includes('api.x.ai')) {
          visionCalls++
          // First image's first call (gemini) succeeds
          if (visionCalls === 1) {
            return jsonResponse({
              candidates: [{ content: { parts: [{ text: JSON.stringify(mockVisionResp) }] } }],
            })
          }
          // Second image: fail all providers (gemini → claude → grok)
          return new Response('down', { status: 503, statusText: 'Error' })
        }
        return new Response('?', { status: 404 })
      }),
    )
    const brief = await runAnalyst({
      rawText: 'Каждое утро ' + 'слово '.repeat(200),
      images: [
        {
          id: 'img1',
          url: 'https://x/a.jpg',
          tech: { width: 1, height: 1, aspectRatio: 1, palette: [] },
        },
        {
          id: 'img2',
          url: 'https://x/b.jpg',
          tech: { width: 1, height: 1, aspectRatio: 1, palette: [] },
        },
      ],
    })
    expect(brief.media).toHaveLength(1)
    expect(brief.media[0].id).toBe('img1')
  })

  it('returns an empty-structure Brief without paying for an LLM call on empty text', async () => {
    const spy = vi.fn(async () => new Response('should not be called', { status: 500 }))
    vi.stubGlobal('fetch', spy)
    const brief = await runAnalyst({ rawText: '   ', images: [] })
    expect(brief.content.totalWordCount).toBe(0)
    expect(brief.sufficiency.textVolume).toBe('too-short')
    expect(spy).not.toHaveBeenCalled()
  })
})
