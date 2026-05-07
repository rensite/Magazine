import type { Box, Vec2 } from './transform'
import { rotatePoint } from './transform'

export const clamp = (v: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, v))

export const snapAngle = (deg: number, step = 15, threshold = 4): number => {
  const normalized = ((deg % 360) + 360) % 360
  const nearest = Math.round(normalized / step) * step
  return Math.abs(normalized - nearest) <= threshold ? nearest : normalized
}

export const aabb = (b: Box): { minX: number; minY: number; maxX: number; maxY: number } => {
  const cx = b.x + b.width / 2
  const cy = b.y + b.height / 2
  const corners: Vec2[] = [
    { x: b.x, y: b.y },
    { x: b.x + b.width, y: b.y },
    { x: b.x + b.width, y: b.y + b.height },
    { x: b.x, y: b.y + b.height },
  ].map((p) => rotatePoint(p, { x: cx, y: cy }, b.rotate))

  return {
    minX: Math.min(...corners.map((c) => c.x)),
    minY: Math.min(...corners.map((c) => c.y)),
    maxX: Math.max(...corners.map((c) => c.x)),
    maxY: Math.max(...corners.map((c) => c.y)),
  }
}

export const MIN_DIM = 8

export type HandleKey = 'nw' | 'ne' | 'sw' | 'se' | 'e' | 'w'

export const resizeBox = (
  start: Box,
  handle: HandleKey,
  dx: number,
  dy: number,
  preserveRatio = false,
): Box => {
  let { x, y, width, height } = start
  const ratio = start.width / start.height

  switch (handle) {
    case 'se':
      width = Math.max(MIN_DIM, start.width + dx)
      height = preserveRatio ? width / ratio : Math.max(MIN_DIM, start.height + dy)
      break
    case 'sw':
      width = Math.max(MIN_DIM, start.width - dx)
      height = preserveRatio ? width / ratio : Math.max(MIN_DIM, start.height + dy)
      x = start.x + start.width - width
      break
    case 'ne':
      width = Math.max(MIN_DIM, start.width + dx)
      height = preserveRatio ? width / ratio : Math.max(MIN_DIM, start.height - dy)
      y = start.y + start.height - height
      break
    case 'nw':
      width = Math.max(MIN_DIM, start.width - dx)
      height = preserveRatio ? width / ratio : Math.max(MIN_DIM, start.height - dy)
      x = start.x + start.width - width
      y = start.y + start.height - height
      break
    case 'e':
      width = Math.max(MIN_DIM, start.width + dx)
      break
    case 'w':
      width = Math.max(MIN_DIM, start.width - dx)
      x = start.x + start.width - width
      break
  }
  return { x, y, width, height, rotate: start.rotate }
}

export const angleBetween = (origin: Vec2, p: Vec2): number =>
  (Math.atan2(p.y - origin.y, p.x - origin.x) * 180) / Math.PI
