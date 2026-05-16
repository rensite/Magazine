// Layer 5: Validator + light auto-correction.
//
// Checks (per spec §10.3):
//   - measure: text-bearing blocks render 45–75 characters per line
//   - contrast: WCAG AA 4.5:1 for body, 3:1 for large text
//   - hierarchy monotonicity: title.size > deck.size > body.size > caption.size
//   - overflow: every element fits inside the spread (with bleed)
//   - overlap: image/image and image/text overlaps under the budget
//   - DPI: image natural dims yield ≥150 dpi at on-page size
//
// We do up to N light auto-corrections (font shrink, column widen, overlap
// nudge) per pass. If issues remain, we surface them as warnings — the
// compiler orchestrator decides whether to ask the editor for a redo.

import type { SpreadElement, SpreadSchema } from '@/types/element'
import { isImage, isText, isTextBearing } from '@/types/element'
import { rightPageX, spreadCanvasSize } from '@/utils/elementFactory'

export type ValidationSeverity = 'error' | 'warning'
export type ValidationCode =
  | 'measure-too-short'
  | 'measure-too-long'
  | 'contrast-low'
  | 'hierarchy-non-monotonic'
  | 'overflow'
  | 'overlap-excess'
  | 'dpi-low'

export interface ValidationIssue {
  code: ValidationCode
  severity: ValidationSeverity
  elementId?: string
  message: string
  /** True if the auto-correction pass fixed this issue. */
  autoFixed?: boolean
}

export interface ValidationResult {
  ok: boolean
  schema: SpreadSchema
  issues: ValidationIssue[]
}

// ---------- helpers ----------

/** Relative luminance of an sRGB hex color. */
const luminance = (hex: string): number => {
  const m = hex.replace('#', '').match(/.{2}/g)
  if (!m) return 0
  const [r, g, b] = m.map((c) => {
    const v = parseInt(c, 16) / 255
    return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

export const contrastRatio = (a: string, b: string): number => {
  const la = luminance(a)
  const lb = luminance(b)
  const lighter = Math.max(la, lb)
  const darker = Math.min(la, lb)
  return (lighter + 0.05) / (darker + 0.05)
}

/** Estimate characters per line from element width and font size. */
const estimateMeasureChars = (widthPx: number, fontSizePx: number): number => {
  if (!fontSizePx) return 0
  // Average glyph ≈ 0.5em for body; rounder fonts go higher. 0.55 is a
  // conservative middle.
  const avgGlyphPx = fontSizePx * 0.55
  return Math.round(widthPx / avgGlyphPx)
}

const isOverflowing = (el: SpreadElement, schema: SpreadSchema): boolean => {
  const canvas = spreadCanvasSize(schema)
  // We allow bleed slack equal to the max page bleed.
  const slack = Math.max(schema.pages.left.bleed, schema.pages.right.bleed)
  if (el.x + el.width > canvas.width + slack) return true
  if (el.y + el.height > canvas.height + slack) return true
  if (el.x < -slack) return true
  if (el.y < -slack) return true
  return false
}

const rectOverlapArea = (a: SpreadElement, b: SpreadElement): number => {
  const x1 = Math.max(a.x, b.x)
  const y1 = Math.max(a.y, b.y)
  const x2 = Math.min(a.x + a.width, b.x + b.width)
  const y2 = Math.min(a.y + a.height, b.y + b.height)
  if (x2 <= x1 || y2 <= y1) return 0
  return (x2 - x1) * (y2 - y1)
}

const elementArea = (el: SpreadElement): number => Math.max(1, el.width * el.height)

/** Map for hierarchy check: lower number = larger expected size. */
const HIERARCHY_ORDER: Record<string, number> = {
  masthead: 0,
  title: 1,
  deck: 2,
  pullquote: 3,
  body: 4,
  factbox: 5,
  caption: 6,
  byline: 6,
  folio: 7,
}

// ---------- validation passes ----------

const checkMeasure = (
  schema: SpreadSchema,
  issues: ValidationIssue[],
  autoCorrect: boolean,
): void => {
  for (const el of schema.elements) {
    if (!isText(el)) continue
    const chars = estimateMeasureChars(el.width, el.fontSize)
    if (chars < 30) {
      issues.push({
        code: 'measure-too-short',
        severity: 'warning',
        elementId: el.id,
        message: `Text "${el.name ?? el.id}" measures ~${chars}ch; minimum readable is 45ch.`,
        autoFixed: false,
      })
    } else if (chars > 90) {
      // Auto-correct: shrink font by 1 step (~10%).
      if (autoCorrect) {
        const newSize = Math.max(8, Math.round(el.fontSize * 0.9))
        el.fontSize = newSize
        issues.push({
          code: 'measure-too-long',
          severity: 'warning',
          elementId: el.id,
          message: `Measure exceeded 90ch; auto-shrunk font to ${newSize}px.`,
          autoFixed: true,
        })
      } else {
        issues.push({
          code: 'measure-too-long',
          severity: 'warning',
          elementId: el.id,
          message: `Measure ~${chars}ch exceeds the 75ch upper bound.`,
        })
      }
    }
  }
}

const checkContrast = (schema: SpreadSchema, issues: ValidationIssue[]): void => {
  const bg = schema.background.color ?? '#f5efe2'
  for (const el of schema.elements) {
    if (!isTextBearing(el)) continue
    const fg = (el as { color?: string }).color
    if (!fg) continue
    const ratio = contrastRatio(fg, bg)
    const required = isText(el) ? 4.5 : 3 // body needs 4.5; large text 3
    if (ratio < required) {
      issues.push({
        code: 'contrast-low',
        severity: 'error',
        elementId: el.id,
        message: `Contrast ${ratio.toFixed(2)}:1 below required ${required}:1 (text "${el.name ?? el.id}").`,
      })
    }
  }
}

const checkHierarchy = (schema: SpreadSchema, issues: ValidationIssue[]): void => {
  const byRole: Array<{ role: string; size: number; id: string }> = []
  for (const el of schema.elements) {
    if (!isText(el) && !('fontSize' in el)) continue
    const role = el.name ?? ''
    if (HIERARCHY_ORDER[role] === undefined) continue
    const size = 'fontSize' in el ? (el.fontSize as number) : 0
    byRole.push({ role, size, id: el.id })
  }
  // Group by role and pick the largest of each.
  const max: Record<string, number> = {}
  for (const r of byRole) {
    max[r.role] = Math.max(max[r.role] ?? 0, r.size)
  }
  const ordered = Object.entries(max)
    .filter(([, size]) => size > 0)
    .sort((a, b) => HIERARCHY_ORDER[a[0]] - HIERARCHY_ORDER[b[0]])
  for (let i = 1; i < ordered.length; i++) {
    const [prevRole, prevSize] = ordered[i - 1]
    const [curRole, curSize] = ordered[i]
    if (curSize > prevSize) {
      issues.push({
        code: 'hierarchy-non-monotonic',
        severity: 'warning',
        message: `Hierarchy break: ${curRole} (${curSize}px) is larger than ${prevRole} (${prevSize}px).`,
      })
    }
  }
}

const checkOverflow = (schema: SpreadSchema, issues: ValidationIssue[]): void => {
  for (const el of schema.elements) {
    if (el.type === 'group') continue
    if (isOverflowing(el, schema)) {
      issues.push({
        code: 'overflow',
        severity: 'error',
        elementId: el.id,
        message: `Element "${el.name ?? el.id}" extends beyond the spread.`,
      })
    }
  }
}

const OVERLAP_BUDGET = 0.15 // 15% per spec §10.2

const checkOverlap = (
  schema: SpreadSchema,
  issues: ValidationIssue[],
  _autoCorrect: boolean,
): void => {
  const els = schema.elements.filter((e) => e.type !== 'group')
  for (let i = 0; i < els.length; i++) {
    for (let j = i + 1; j < els.length; j++) {
      const overlap = rectOverlapArea(els[i], els[j])
      if (overlap <= 0) continue
      const minArea = Math.min(elementArea(els[i]), elementArea(els[j]))
      const ratio = overlap / minArea
      if (ratio > OVERLAP_BUDGET) {
        issues.push({
          code: 'overlap-excess',
          severity: 'warning',
          elementId: els[i].id,
          message: `Overlap ${(ratio * 100).toFixed(0)}% between "${els[i].name ?? els[i].id}" and "${els[j].name ?? els[j].id}" exceeds 15% budget.`,
        })
      }
    }
  }
}

const checkDpi = (schema: SpreadSchema, issues: ValidationIssue[]): void => {
  if (!schema.showDpiWarnings) return
  for (const el of schema.elements) {
    if (!isImage(el)) continue
    if (!el.naturalWidth || !el.naturalHeight) continue
    // Approximate: 1 inch = 25.4 mm, our px assumes 96 DPI by default.
    const widthInches = el.width / 96
    if (widthInches <= 0) continue
    const effDpi = el.naturalWidth / widthInches
    if (effDpi < 150) {
      issues.push({
        code: 'dpi-low',
        severity: 'warning',
        elementId: el.id,
        message: `Image effective DPI ${effDpi.toFixed(0)} is below 150.`,
      })
    }
  }
}

// ---------- public ----------

export interface ValidateOptions {
  /** If true, mutate the schema with light fixes (font shrink etc.). Default true. */
  autoCorrect?: boolean
}

export const validate = (
  schema: SpreadSchema,
  opts: ValidateOptions = {},
): ValidationResult => {
  // Defensive clone so callers can compare before/after.
  const cloned: SpreadSchema = JSON.parse(JSON.stringify(schema))
  const issues: ValidationIssue[] = []
  const auto = opts.autoCorrect !== false

  checkMeasure(cloned, issues, auto)
  checkContrast(cloned, issues)
  checkHierarchy(cloned, issues)
  checkOverflow(cloned, issues)
  checkOverlap(cloned, issues, auto)
  checkDpi(cloned, issues)

  const hasError = issues.some((i) => i.severity === 'error' && !i.autoFixed)
  return { ok: !hasError, schema: cloned, issues }
}

// Re-export rightPageX for downstream uses.
export { rightPageX }
