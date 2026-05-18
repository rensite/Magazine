// Aggressively compress an image Blob for LLM vision payloads. Editorial
// classifiers and palette/caption tasks don't need detail past ~512px,
// so we trade pixels for bytes (and for upstream token cost).
//
// Strategy: iterate over a descending list of max-edges and JPEG qualities;
// return the first output that fits under `maxBytes`. If nothing fits, fall
// back to the smallest produced (better small-and-blurry than 404).

export interface CompressOptions {
  /** Target maximum bytes. Default 50 KB. */
  maxBytes?: number
  /** Longest-edge values to try, descending. */
  maxEdges?: number[]
  /** JPEG qualities to try at each edge, descending. */
  qualities?: number[]
  mimeType?: 'image/jpeg' | 'image/webp'
}

const DEFAULTS = {
  maxBytes: 50_000,
  maxEdges: [1024, 768, 512, 384, 256],
  qualities: [0.7, 0.55, 0.4, 0.3],
  mimeType: 'image/jpeg' as const,
}

export interface CompressedImage {
  base64: string
  mimeType: string
  bytes: number
}

export const blobToBase64 = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const raw = String(reader.result ?? '')
      const i = raw.indexOf(',')
      resolve(i >= 0 ? raw.slice(i + 1) : raw)
    }
    reader.onerror = () => reject(reader.error ?? new Error('FileReader failed'))
    reader.readAsDataURL(blob)
  })

const drawScaled = (bmp: ImageBitmap, edge: number): HTMLCanvasElement => {
  const scale = Math.min(1, edge / Math.max(bmp.width, bmp.height))
  const w = Math.max(1, Math.round(bmp.width * scale))
  const h = Math.max(1, Math.round(bmp.height * scale))
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const ctx = c.getContext('2d')
  if (!ctx) throw new Error('compressImage: 2d context unavailable')
  ctx.drawImage(bmp, 0, 0, w, h)
  return c
}

const canvasToBlob = (c: HTMLCanvasElement, mime: string, q: number): Promise<Blob | null> =>
  new Promise((res) => c.toBlob(res, mime, q))

export const compressImageBlob = async (
  source: Blob,
  opts: CompressOptions = {},
): Promise<CompressedImage> => {
  const cfg = { ...DEFAULTS, ...opts }
  const bmp = await createImageBitmap(source)
  try {
    let smallest: Blob | null = null
    for (const edge of cfg.maxEdges) {
      // One canvas per edge — quality iterations reuse the same pixels.
      const canvas = drawScaled(bmp, edge)
      for (const q of cfg.qualities) {
        const out = await canvasToBlob(canvas, cfg.mimeType, q)
        if (!out) continue
        if (out.size <= cfg.maxBytes) {
          const base64 = await blobToBase64(out)
          return { base64, mimeType: out.type || cfg.mimeType, bytes: out.size }
        }
        if (!smallest || out.size < smallest.size) smallest = out
      }
    }
    if (!smallest) throw new Error('compressImageBlob: canvas.toBlob returned null at every step')
    const base64 = await blobToBase64(smallest)
    return { base64, mimeType: smallest.type || cfg.mimeType, bytes: smallest.size }
  } finally {
    bmp.close?.()
  }
}

export const base64ToBlob = (b64: string, mimeType: string): Blob => {
  const bin = atob(b64)
  const arr = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i)
  return new Blob([arr], { type: mimeType })
}
