import type { BaseElement } from '@/types/element'

export interface Box {
  x: number
  y: number
  width: number
  height: number
  rotate: number
}

export const toCssTransform = (b: Box): string =>
  `translate(${b.x}px, ${b.y}px) rotate(${b.rotate}deg)`

export const toSvgTransform = (b: Box): string => {
  const cx = b.width / 2
  const cy = b.height / 2
  return `translate(${b.x} ${b.y}) rotate(${b.rotate} ${cx} ${cy})`
}

export const cssTransformOrigin = '0 0'

export interface Vec2 { x: number; y: number }

export const radians = (deg: number): number => (deg * Math.PI) / 180

export const rotatePoint = (p: Vec2, origin: Vec2, deg: number): Vec2 => {
  const rad = radians(deg)
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  const dx = p.x - origin.x
  const dy = p.y - origin.y
  return {
    x: origin.x + dx * cos - dy * sin,
    y: origin.y + dx * sin + dy * cos,
  }
}

export const localToCanvas = (
  localX: number,
  localY: number,
  el: Box,
): Vec2 => {
  const center: Vec2 = { x: el.x + el.width / 2, y: el.y + el.height / 2 }
  const corner: Vec2 = { x: el.x + localX, y: el.y + localY }
  return rotatePoint(corner, center, el.rotate)
}

export const screenToCanvas = (
  screenX: number,
  screenY: number,
  canvasRect: DOMRect,
  zoom: number,
  pan: Vec2,
): Vec2 => ({
  x: (screenX - canvasRect.left - pan.x) / zoom,
  y: (screenY - canvasRect.top - pan.y) / zoom,
})

export const ensureBox = (el: Pick<BaseElement, 'x' | 'y' | 'width' | 'height' | 'rotate'>): Box => ({
  x: el.x,
  y: el.y,
  width: el.width,
  height: el.height,
  rotate: el.rotate,
})
