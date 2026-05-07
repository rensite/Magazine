import { ASSETS_BUCKET, getSupabase } from './supabaseClient'

export interface UploadedImage {
  src: string
  thumb: string
  naturalWidth: number
  naturalHeight: number
}

const MAX_FULL = 2000
const MAX_THUMB = 300

const ALPHA_TYPES = new Set(['image/png', 'image/webp', 'image/gif', 'image/svg+xml'])

interface OutputFormat {
  mime: string
  ext: string
  quality: number
}

const pickFormat = (file: File): OutputFormat => {
  if (ALPHA_TYPES.has(file.type)) return { mime: 'image/png', ext: 'png', quality: 1 }
  return { mime: 'image/jpeg', ext: 'jpg', quality: 0.9 }
}

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
  format: OutputFormat,
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
  ctx.clearRect(0, 0, w, h)
  ctx.drawImage(img, 0, 0, w, h)
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, format.mime, format.quality),
  )
  if (!blob) throw new Error('canvas toBlob returned null')
  return { blob, dataUrl: canvas.toDataURL(format.mime, format.quality), width: w, height: h }
}

/**
 * Local-only image preparation: resize and inline as data URLs.
 * Use when no Supabase auth is wired (dev / quick prototyping).
 * Note: data URLs in JSONB make schemas heavy — replace with `uploadImage`
 * once auth is set up.
 */
const isSvg = (file: File): boolean => file.type === 'image/svg+xml'

const fileToDataUrl = (file: File | Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error ?? new Error('FileReader failed'))
    reader.readAsDataURL(file)
  })

export const prepareLocalImage = async (file: File): Promise<UploadedImage> => {
  if (!file.type.startsWith('image/')) {
    throw new Error(`Not an image: ${file.type}`)
  }
  const img = await loadImage(file)
  if (isSvg(file)) {
    const dataUrl = await fileToDataUrl(file)
    return {
      src: dataUrl,
      thumb: dataUrl,
      naturalWidth: img.naturalWidth,
      naturalHeight: img.naturalHeight,
    }
  }
  const format = pickFormat(file)
  const [full, thumb] = await Promise.all([
    resize(img, MAX_FULL, format),
    resize(img, MAX_THUMB, format),
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
  const id = crypto.randomUUID()
  const storage = getSupabase().storage.from(ASSETS_BUCKET)

  if (isSvg(file)) {
    const path = `${userId}/${spreadId}/${id}.svg`
    const res = await storage.upload(path, file, {
      contentType: 'image/svg+xml',
      upsert: false,
    })
    if (res.error) throw res.error
    return {
      src: path,
      thumb: path,
      naturalWidth: img.naturalWidth,
      naturalHeight: img.naturalHeight,
    }
  }

  const format = pickFormat(file)
  const [full, thumb] = await Promise.all([
    resize(img, MAX_FULL, format),
    resize(img, MAX_THUMB, format),
  ])

  const fullPath = `${userId}/${spreadId}/${id}.${format.ext}`
  const thumbPath = `${userId}/${spreadId}/${id}_thumb.${format.ext}`

  const [fullRes, thumbRes] = await Promise.all([
    storage.upload(fullPath, full.blob, { contentType: format.mime, upsert: false }),
    storage.upload(thumbPath, thumb.blob, { contentType: format.mime, upsert: false }),
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
