// Pre-zod normalization for editor LLM output.
//
// Models routinely make small structural mistakes that strict zod
// validation rejects — `id: null`, `anchor.col: "3"`, a zone with no
// contentRef. Bouncing those back to the model with a retry burns
// tokens and often produces the same shape. Instead we sanitize: fill
// in synthetic ids, coerce string-numbers, and drop entries that
// reference nothing the compiler can resolve.
//
// Scope is narrow on purpose: only the shapes we've observed failing in
// practice. Anything outside the known-bad list is left for zod to
// reject loudly.

let counter = 0
const synthId = (prefix: string): string => {
  counter = (counter + 1) % 1_000_000
  return `${prefix}-${Date.now().toString(36)}-${counter.toString(36)}`
}

const isNonEmptyString = (v: unknown): v is string => typeof v === 'string' && v.length > 0

const coerceNumber = (v: unknown): unknown => {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string') {
    const n = Number(v)
    if (Number.isFinite(n)) return n
  }
  return v
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

const normalizeGaps = (gaps: unknown): unknown => {
  if (!Array.isArray(gaps)) return gaps
  return gaps.map((g) => {
    if (!isRecord(g)) return g
    const id = isNonEmptyString(g.id) ? g.id : synthId('gap')
    return { ...g, id }
  })
}

const normalizeAccents = (accents: unknown): unknown => {
  if (!Array.isArray(accents)) return accents
  return accents.map((a) => {
    if (!isRecord(a)) return a
    const id = isNonEmptyString(a.id) ? a.id : synthId('acc')
    const anchor = isRecord(a.anchor)
      ? { ...a.anchor, col: coerceNumber(a.anchor.col), row: coerceNumber(a.anchor.row) }
      : a.anchor
    return { ...a, id, anchor }
  })
}

const normalizeZones = (zones: unknown): unknown => {
  if (!Array.isArray(zones)) return zones
  return zones
    .filter((z) => isRecord(z) && isNonEmptyString(z.contentRef))
    .map((z) => {
      const zone = z as Record<string, unknown>
      const id = isNonEmptyString(zone.id) ? zone.id : synthId('zone')
      return { ...zone, id }
    })
}

const normalizeViolations = (violations: unknown): unknown => {
  if (!Array.isArray(violations)) return violations
  // Drop violations that reference nothing — the compiler would crash
  // trying to apply rotation/overlap to a missing target.
  return violations.filter((v) => isRecord(v) && isNonEmptyString(v.targetId))
}

const normalizePartitura = (partitura: unknown): unknown => {
  if (!isRecord(partitura)) return partitura
  return {
    ...partitura,
    zones: normalizeZones(partitura.zones),
    accents: normalizeAccents(partitura.accents),
    violations: normalizeViolations(partitura.violations),
  }
}

/**
 * Sanitize the LLM's raw editor output before zod validation. Returns a
 * shallow-cloned object — never mutates the input.
 */
export const normalizeEditorOutput = (raw: unknown): unknown => {
  if (!isRecord(raw)) return raw
  return {
    ...raw,
    gaps: normalizeGaps(raw.gaps),
    partitura: normalizePartitura(raw.partitura),
  }
}
