import type { SpreadSchema } from '@/types/element'
import { rightPageX } from './elementFactory'
import { MIN_DIM, type HandleKey } from './geometry'
import type { Box } from './transform'

export interface SnapLines {
  x: number[]
  y: number[]
}

export const buildSnapLines = (schema: SpreadSchema): SnapLines => {
  const xs: number[] = []
  const ys: number[] = []
  const sides = [
    { x: 0, page: schema.pages.left },
    { x: rightPageX(schema), page: schema.pages.right },
  ]

  for (const s of sides) {
    xs.push(s.x, s.x + s.page.width)
    xs.push(s.x + s.page.margins.left, s.x + s.page.width - s.page.margins.right)
    ys.push(0, s.page.height)
    ys.push(s.page.margins.top, s.page.height - s.page.margins.bottom)

    const bg = schema.baselineGrid
    if (bg.enabled && bg.lineHeight > 0) {
      const top = s.page.margins.top
      const bottom = s.page.height - s.page.margins.bottom
      const start = top + (((bg.offset % bg.lineHeight) + bg.lineHeight) % bg.lineHeight)
      for (let y = start; y <= bottom + 0.001; y += bg.lineHeight) ys.push(y)
    }

    const cg = schema.columnGrid
    if (cg.enabled && cg.columns >= 1) {
      const left = s.x + s.page.margins.left
      const right = s.x + s.page.width - s.page.margins.right
      const inner = right - left
      if (inner > 0) {
        const colWidth = (inner - cg.gutter * (cg.columns - 1)) / cg.columns
        if (colWidth > 0) {
          for (let i = 0; i < cg.columns; i++) {
            const cl = left + i * (colWidth + cg.gutter)
            xs.push(cl, cl + colWidth)
          }
        }
      }
    }
  }
  return { x: xs, y: ys }
}

const nearestDelta = (value: number, targets: number[], threshold: number): number => {
  let best = 0
  let bestAbs = threshold
  for (const t of targets) {
    const d = t - value
    const ad = Math.abs(d)
    if (ad < bestAbs) {
      bestAbs = ad
      best = d
    }
  }
  return best
}

export const snapDrag = (box: Box, lines: SnapLines, threshold: number): { x: number; y: number } => {
  if (threshold <= 0) return { x: box.x, y: box.y }
  const candX = [box.x, box.x + box.width / 2, box.x + box.width]
  const candY = [box.y, box.y + box.height / 2, box.y + box.height]
  let dx = 0
  let dxAbs = threshold + 1
  for (const c of candX) {
    const d = nearestDelta(c, lines.x, threshold)
    if (d !== 0 && Math.abs(d) < dxAbs) {
      dxAbs = Math.abs(d)
      dx = d
    }
  }
  let dy = 0
  let dyAbs = threshold + 1
  for (const c of candY) {
    const d = nearestDelta(c, lines.y, threshold)
    if (d !== 0 && Math.abs(d) < dyAbs) {
      dyAbs = Math.abs(d)
      dy = d
    }
  }
  return { x: box.x + dx, y: box.y + dy }
}

export const snapResize = (
  box: Box,
  handle: HandleKey,
  lines: SnapLines,
  threshold: number,
): Box => {
  if (threshold <= 0) return box
  const movesLeft = handle === 'nw' || handle === 'sw' || handle === 'w'
  const movesRight = handle === 'ne' || handle === 'se' || handle === 'e'
  const movesTop = handle === 'nw' || handle === 'ne'
  const movesBottom = handle === 'sw' || handle === 'se'

  let { x, y, width, height } = box
  if (movesRight) {
    const right = x + width
    const d = nearestDelta(right, lines.x, threshold)
    if (d !== 0) width = Math.max(MIN_DIM, width + d)
  }
  if (movesLeft) {
    const right = x + width
    const d = nearestDelta(x, lines.x, threshold)
    if (d !== 0) {
      const newX = x + d
      const newWidth = right - newX
      if (newWidth >= MIN_DIM) {
        x = newX
        width = newWidth
      }
    }
  }
  if (movesBottom) {
    const bottom = y + height
    const d = nearestDelta(bottom, lines.y, threshold)
    if (d !== 0) height = Math.max(MIN_DIM, height + d)
  }
  if (movesTop) {
    const bottom = y + height
    const d = nearestDelta(y, lines.y, threshold)
    if (d !== 0) {
      const newY = y + d
      const newHeight = bottom - newY
      if (newHeight >= MIN_DIM) {
        y = newY
        height = newHeight
      }
    }
  }
  return { x, y, width, height, rotate: box.rotate }
}
