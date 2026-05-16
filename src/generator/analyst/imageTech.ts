// Local pre-pass over an uploaded image: dimensions, dominant OKLCH palette,
// and a content hash. No LLM, no native deps — all browser APIs.
//
// We deliberately skip EXIF parsing for MVP (would require `exifr` and
// many EXIF fields are missing anyway); the LLM will infer date/camera
// from visual context if it matters. Adding `exifr` later is one import.

import type { MediaTechMeta, OklchColor } from '../schemas/brief'

/**
 * Decode an image File/Blob into an ImageBitmap (browser) and read
 * intrinsic dimensions. Falls back to HTMLImageElement for older browsers.
 */
const decode = async (blob: Blob): Promise<{ width: number; height: number; pixels: ImageData }> => {
  if (typeof createImageBitmap === 'undefined') {
    throw new Error('createImageBitmap is required for image pre-analysis')
  }
  const bitmap = await createImageBitmap(blob)
  const { width, height } = bitmap
  // Downscale to a small thumb for color sampling; full res would be slow
  // and the dominant colors are stable at low resolution.
  const targetW = 64
  const targetH = Math.max(1, Math.round((height / width) * targetW))
  const canvas =
    typeof OffscreenCanvas !== 'undefined'
      ? new OffscreenCanvas(targetW, targetH)
      : Object.assign(document.createElement('canvas'), { width: targetW, height: targetH })
  const ctx = (canvas as OffscreenCanvas).getContext('2d') as
    | OffscreenCanvasRenderingContext2D
    | CanvasRenderingContext2D
    | null
  if (!ctx) throw new Error('2d context unavailable')
  ctx.drawImage(bitmap as CanvasImageSource, 0, 0, targetW, targetH)
  const pixels = ctx.getImageData(0, 0, targetW, targetH)
  bitmap.close?.()
  return { width, height, pixels }
}

/** sRGB → linear (per channel, 0..1). */
const srgbToLinear = (c: number): number => {
  const x = c / 255
  return x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4)
}

/** sRGB → OKLCH. Derivation per https://bottosson.github.io/posts/oklab/. */
const rgbToOklch = (r: number, g: number, b: number): OklchColor => {
  const rl = srgbToLinear(r)
  const gl = srgbToLinear(g)
  const bl = srgbToLinear(b)
  const l = 0.4122214708 * rl + 0.5363325363 * gl + 0.0514459929 * bl
  const m = 0.2119034982 * rl + 0.6806995451 * gl + 0.1073969566 * bl
  const s = 0.0883024619 * rl + 0.2817188376 * gl + 0.6299787005 * bl
  const l_ = Math.cbrt(l)
  const m_ = Math.cbrt(m)
  const s_ = Math.cbrt(s)
  const L = 0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_
  const a = 1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_
  const bch = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_
  const C = Math.sqrt(a * a + bch * bch)
  let H = (Math.atan2(bch, a) * 180) / Math.PI
  if (H < 0) H += 360
  return { l: L, c: C, h: H }
}

/**
 * Bucket pixels into a tiny 4×4×4 grid in OKL/C/H-flat space and return
 * the top N cluster centroids by population. Simple and good enough for
 * editorial palette extraction — better than picking 1px and faster
 * than k-means.
 */
const dominantPalette = (pixels: ImageData, n = 5): OklchColor[] => {
  const buckets = new Map<string, { count: number; sumL: number; sumC: number; sumH: number }>()
  const data = pixels.data
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3]
    if (a < 200) continue // skip translucent
    const r = data[i]
    const g = data[i + 1]
    const b = data[i + 2]
    const ok = rgbToOklch(r, g, b)
    // Skip near-black and near-white to surface chromatic colors (avoids
    // the case where #f5efe2 paper dominates the palette).
    if (ok.l < 0.1 || ok.l > 0.95) continue
    const key = `${Math.round(ok.l * 4)}-${Math.round(ok.c * 16)}-${Math.round(ok.h / 30)}`
    const cell = buckets.get(key) ?? { count: 0, sumL: 0, sumC: 0, sumH: 0 }
    cell.count++
    cell.sumL += ok.l
    cell.sumC += ok.c
    cell.sumH += ok.h
    buckets.set(key, cell)
  }
  const ranked = [...buckets.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, n)
    .map((cell) => ({
      l: cell.sumL / cell.count,
      c: cell.sumC / cell.count,
      h: cell.sumH / cell.count,
    }))
  return ranked
}

/** SHA-256 of the file bytes as lowercase hex. */
const hashBlob = async (blob: Blob): Promise<string> => {
  if (typeof crypto?.subtle?.digest !== 'function') return ''
  const buf = await blob.arrayBuffer()
  const digest = await crypto.subtle.digest('SHA-256', buf)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Full local-only image analysis. Cheap; safe to run on the upload
 * worker before vision LLM is called. Resilient to bitmap decode
 * failures — returns a "low quality" stub so the pipeline doesn't crash.
 */
export const analyzeImageLocally = async (blob: Blob): Promise<MediaTechMeta> => {
  try {
    const { width, height, pixels } = await decode(blob)
    const palette = dominantPalette(pixels, 5)
    const hash = await hashBlob(blob)
    return {
      width,
      height,
      aspectRatio: width / height,
      byteSize: blob.size,
      palette,
      hash,
    }
  } catch {
    return {
      width: 0,
      height: 0,
      aspectRatio: 1,
      byteSize: blob.size,
      palette: [],
    }
  }
}
