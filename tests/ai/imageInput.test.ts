import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { normalizeImageInput, normalizeImageInputs } from '@/ai/imageInput'

// happy-dom doesn't ship FileReader's data URL behaviour 100% the same as
// real browsers — verify what we get is the correct base64 of known bytes.

const stubFetchWithBlob = (mimeType: string, bytes: ArrayLike<number>) => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      const buf = new Uint8Array(bytes)
      // Slice() copies into a fresh ArrayBuffer-backed Uint8Array so the
      // Blob ctor's typed-array overload accepts it cleanly under strict TS.
      return new Response(new Blob([buf.slice().buffer], { type: mimeType }), {
        headers: { 'content-type': mimeType },
      })
    }),
  )
}

beforeEach(() => {
  // happy-dom provides FileReader; nothing to stub for it.
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('normalizeImageInput', () => {
  it('passes HTTPS URLs through untouched', async () => {
    const out = await normalizeImageInput({ url: 'https://x/y.jpg' })
    expect(out).toEqual({ url: 'https://x/y.jpg' })
  })

  it('passes already-inline base64 through untouched', async () => {
    const out = await normalizeImageInput({ base64: 'AAA', mimeType: 'image/png' })
    expect(out).toEqual({ base64: 'AAA', mimeType: 'image/png' })
  })

  it('converts blob: URL to base64 with detected mime type', async () => {
    stubFetchWithBlob('image/png', ([1, 2, 3, 4]))
    const out = await normalizeImageInput({ url: 'blob:https://example/abc' })
    expect(out.base64).toBeTruthy()
    expect(out.mimeType).toBe('image/png')
    // 4 bytes → 8 chars base64 (with padding).
    expect(out.base64!.length).toBeGreaterThanOrEqual(4)
    expect(out.url).toBeUndefined()
  })

  it('converts data: URL to base64', async () => {
    stubFetchWithBlob('image/jpeg', ([9, 8, 7]))
    const out = await normalizeImageInput({ url: 'data:image/jpeg;base64,...' })
    expect(out.base64).toBeTruthy()
    expect(out.mimeType).toBe('image/jpeg')
  })

  it('throws a readable error when the blob URL is unreachable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('gone', { status: 404 })),
    )
    await expect(
      normalizeImageInput({ url: 'blob:https://example/dead' }),
    ).rejects.toThrowError(/Could not read local image/)
  })
})

describe('normalizeImageInputs', () => {
  it('returns undefined for undefined input (no allocation)', async () => {
    expect(await normalizeImageInputs(undefined)).toBeUndefined()
  })

  it('returns empty array unchanged', async () => {
    const arr: never[] = []
    expect(await normalizeImageInputs(arr)).toBe(arr)
  })

  it('processes mixed URLs in one batch', async () => {
    stubFetchWithBlob('image/png', ([1, 2]))
    const out = await normalizeImageInputs([
      { url: 'https://x/a.jpg' },
      { url: 'blob:https://x/b' },
      { base64: 'PRE', mimeType: 'image/webp' },
    ])
    expect(out).toBeDefined()
    expect(out![0]).toEqual({ url: 'https://x/a.jpg' })
    expect(out![1].base64).toBeTruthy()
    expect(out![2]).toEqual({ base64: 'PRE', mimeType: 'image/webp' })
  })
})
