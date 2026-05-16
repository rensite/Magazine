import type { TextElement } from '@/types/element'
import { lookupFont } from './fonts'

const buildProbe = (): HTMLDivElement => {
  const node = document.createElement('div')
  node.style.position = 'fixed'
  node.style.top = '-99999px'
  node.style.left = '-99999px'
  node.style.visibility = 'hidden'
  node.style.whiteSpace = 'pre-wrap'
  node.style.wordWrap = 'break-word'
  node.style.boxSizing = 'content-box'
  node.style.pointerEvents = 'none'
  return node
}

const applyStyle = (node: HTMLDivElement, el: TextElement, fontSize: number, width: number) => {
  const font = lookupFont(el.fontFamily)
  node.style.fontFamily = font.cssStack
  node.style.fontSize = `${fontSize}px`
  node.style.fontWeight = String(el.fontWeight ?? 400)
  node.style.fontStyle = el.italic ? 'italic' : 'normal'
  node.style.textDecoration = el.underline ? 'underline' : 'none'
  node.style.letterSpacing = el.letterSpacing != null ? `${el.letterSpacing}px` : '0'
  node.style.lineHeight = String(el.lineHeight)
  node.style.textAlign = el.align
  node.style.width = `${width}px`
  node.textContent = el.content
}

export const measureText = (el: TextElement, width: number, fontSize: number): { w: number; h: number } => {
  const probe = buildProbe()
  document.body.appendChild(probe)
  try {
    applyStyle(probe, el, fontSize, width)
    return { w: probe.scrollWidth, h: probe.scrollHeight }
  } finally {
    probe.remove()
  }
}

export const fitTextToFrame = (el: TextElement, width: number, height: number): number => {
  if (width <= 0 || height <= 0 || !el.content) return el.fontSize
  let lo = 4
  let hi = 600
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2
    const { w, h } = measureText(el, width, mid)
    if (w <= width + 0.5 && h <= height + 0.5) lo = mid
    else hi = mid
    if (hi - lo < 0.5) break
  }
  return Math.max(4, Math.floor(lo))
}

export const measureNaturalFrame = (el: TextElement): { width: number; height: number } => {
  const maxWidth = 4000
  const probe = buildProbe()
  document.body.appendChild(probe)
  try {
    applyStyle(probe, el, el.fontSize, maxWidth)
    probe.style.width = 'auto'
    probe.style.whiteSpace = 'pre'
    const w = Math.min(maxWidth, probe.scrollWidth)
    probe.style.width = `${w}px`
    probe.style.whiteSpace = 'pre-wrap'
    return { width: w, height: probe.scrollHeight }
  } finally {
    probe.remove()
  }
}
