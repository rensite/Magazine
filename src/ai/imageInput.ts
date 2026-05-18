// Normalize ImageInput for provider consumption.
//
// Two responsibilities:
//   1. Providers cannot fetch browser-internal `blob:` / `data:` URLs —
//      we resolve those locally before sending.
//   2. Every image is aggressively recompressed (target ~50 KB) before
//      going to the LLM. Editorial-classifier tasks don't benefit from
//      full-resolution payloads, and the network/token cost adds up
//      across batches. Originals stay in app state for UI rendering.
//
// If compression fails for any reason (e.g. exotic codec the browser
// can't decode), we fall back to passing the URL through unchanged so
// the provider has a chance to fetch it itself.

import type { ImageInput } from './types'
import { base64ToBlob, blobToBase64, compressImageBlob } from './compressImage'

/** Skip recompression if the input is already this small (bytes). */
const SKIP_COMPRESS_BELOW = 30_000

const approxBase64Bytes = (b64: string): number => Math.floor((b64.length * 3) / 4)

const fetchAsBlob = async (url: string): Promise<Blob> => {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`fetch image ${res.status}`)
  return res.blob()
}

export const normalizeImageInput = async (img: ImageInput): Promise<ImageInput> => {
  let source: Blob | null = null
  let sourceMime: string | undefined

  if (img.base64) {
    if (approxBase64Bytes(img.base64) <= SKIP_COMPRESS_BELOW) return img
    source = base64ToBlob(img.base64, img.mimeType ?? 'image/jpeg')
    sourceMime = img.mimeType
  } else if (img.url) {
    try {
      source = await fetchAsBlob(img.url)
      sourceMime = source.type || undefined
    } catch (err) {
      // For blob:/data: URLs we have no fallback — the provider can't
      // fetch them either, so surface the error.
      if (img.url.startsWith('blob:') || img.url.startsWith('data:')) {
        throw new Error(
          `Could not read local image (${img.url.slice(0, 32)}…): ${
            err instanceof Error ? err.message : String(err)
          }`,
        )
      }
      // For http(s) URLs, let the provider try to fetch it directly.
      return img
    }
  } else {
    return img
  }

  if (source.size <= SKIP_COMPRESS_BELOW) {
    const base64 = await blobToBase64(source)
    return { base64, mimeType: source.type || sourceMime || 'image/jpeg' }
  }

  try {
    const { base64, mimeType } = await compressImageBlob(source)
    return { base64, mimeType }
  } catch {
    // Decode failed (e.g. HEIC). If we at least have the original blob,
    // pass it as base64 unchanged; otherwise pass the URL through.
    if (source) {
      const base64 = await blobToBase64(source)
      return { base64, mimeType: source.type || sourceMime || 'image/jpeg' }
    }
    return img
  }
}

export const normalizeImageInputs = async (
  images: ImageInput[] | undefined,
): Promise<ImageInput[] | undefined> => {
  if (!images || images.length === 0) return images
  return Promise.all(images.map(normalizeImageInput))
}
