// Normalize ImageInput for provider consumption.
//
// LLM providers accept HTTPS URLs OR base64 bytes for image attachments
// — but NOT browser-internal `blob:` / `data:` URLs. The Generator UI
// hands off blob: URLs from `URL.createObjectURL(file)` so the upload
// step has no Supabase dependency for demos.
//
// This module bridges the gap: if a URL is HTTPS, we pass it through.
// If it's blob: or data:, we fetch the bytes locally and re-emit the
// ImageInput as `{ base64, mimeType }` which every provider knows how
// to serialize.

import type { ImageInput } from './types'

/** Read a Blob into a base64 string (no `data:` prefix). */
const blobToBase64 = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const raw = String(reader.result ?? '')
      // FileReader yields `data:<mime>;base64,<payload>` — strip the prefix.
      const i = raw.indexOf(',')
      resolve(i >= 0 ? raw.slice(i + 1) : raw)
    }
    reader.onerror = () => reject(reader.error ?? new Error('FileReader failed'))
    reader.readAsDataURL(blob)
  })

const needsConversion = (url: string): boolean =>
  url.startsWith('blob:') || url.startsWith('data:')

/**
 * Normalize one ImageInput so providers don't see local-only URLs.
 * Pass-through for HTTPS / gs:// / etc. Fetches+base64 for blob:/data:.
 */
export const normalizeImageInput = async (img: ImageInput): Promise<ImageInput> => {
  if (img.base64) return img // already inline
  if (!img.url) return img
  if (!needsConversion(img.url)) return img
  // blob: URLs are revocable; if the user already revoked the object URL
  // we'll get a fetch error here — surface a readable message.
  let blob: Blob
  try {
    const res = await fetch(img.url)
    if (!res.ok) throw new Error(`fetch blob ${res.status}`)
    blob = await res.blob()
  } catch (err) {
    throw new Error(
      `Could not read local image (${img.url.slice(0, 32)}…): ${
        err instanceof Error ? err.message : String(err)
      }`,
    )
  }
  const mimeType = img.mimeType ?? blob.type ?? 'image/jpeg'
  const base64 = await blobToBase64(blob)
  return { base64, mimeType }
}

/** Bulk-normalize an array. Errors from individual images bubble up. */
export const normalizeImageInputs = async (
  images: ImageInput[] | undefined,
): Promise<ImageInput[] | undefined> => {
  if (!images || images.length === 0) return images
  return Promise.all(images.map(normalizeImageInput))
}
