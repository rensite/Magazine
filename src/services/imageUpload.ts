import { ASSETS_BUCKET, getSupabase } from './supabaseClient'

export interface UploadedImage {
  src: string
  thumb: string
  naturalWidth: number
  naturalHeight: number
}

const MAX_FULL = 2000
const MAX_THUMB = 300

const loadImage = (file: File | Blob): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = (e) => {
      URL.revokeObjectURL(url)
      reject(e)
    }
    img.src = url
  })

interface ResizedRaster {
  blob: Blob
  dataUrl: string
  width: number
  height: number
}

const resize = async (
  img: HTMLImageElement,
  maxLong: number,
  type = 'image/jpeg',
  quality = 0.9,
): Promise<ResizedRaster> => {
  const longest = Math.max(img.naturalWidth, img.naturalHeight)
  const scale = longest > maxLong ? maxLong / longest : 1
  const w = Math.round(img.naturalWidth * scale)
  const h = Math.round(img.naturalHeight * scale)
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas 2d context unavailable')
  ctx.drawImage(img, 0, 0, w, h)
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, type, quality),
  )
  if (!blob) throw new Error('canvas toBlob returned null')
  return { blob, dataUrl: canvas.toDataURL(type, quality), width: w, height: h }
}

/**
 * Local-only image preparation: resize and inline as data URLs.
 * Use when no Supabase auth is wired (dev / quick prototyping).
 * Note: data URLs in JSONB make schemas heavy — replace with `uploadImage`
 * once auth is set up.
 */
export const prepareLocalImage = async (file: File): Promise<UploadedImage> => {
  if (!file.type.startsWith('image/')) {
    throw new Error(`Not an image: ${file.type}`)
  }
  const img = await loadImage(file)
  const [full, thumb] = await Promise.all([
    resize(img, MAX_FULL),
    resize(img, MAX_THUMB),
  ])
  return {
    src: full.dataUrl,
    thumb: thumb.dataUrl,
    naturalWidth: full.width,
    naturalHeight: full.height,
  }
}

export const uploadImage = async (
  file: File,
  userId: string,
  spreadId: string,
): Promise<UploadedImage> => {
  if (!file.type.startsWith('image/')) {
    throw new Error(`Not an image: ${file.type}`)
  }

  const img = await loadImage(file)
  const [full, thumb] = await Promise.all([
    resize(img, MAX_FULL),
    resize(img, MAX_THUMB),
  ])

  const id = crypto.randomUUID()
  const fullPath = `${userId}/${spreadId}/${id}.jpg`
  const thumbPath = `${userId}/${spreadId}/${id}_thumb.jpg`
  const storage = getSupabase().storage.from(ASSETS_BUCKET)

  const [fullRes, thumbRes] = await Promise.all([
    storage.upload(fullPath, full.blob, { contentType: 'image/jpeg', upsert: false }),
    storage.upload(thumbPath, thumb.blob, { contentType: 'image/jpeg', upsert: false }),
  ])
  if (fullRes.error) throw fullRes.error
  if (thumbRes.error) throw thumbRes.error

  return {
    src: fullPath,
    thumb: thumbPath,
    naturalWidth: full.width,
    naturalHeight: full.height,
  }
}
