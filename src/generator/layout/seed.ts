// Tiny deterministic PRNG used for the "violations" budget. Same partitura
// in → same chaos out. We use mulberry32 for ~1ns/call with great
// distribution, plenty good enough for layout jitter.

export const mulberry32 = (seed: number) => {
  let t = seed >>> 0
  return (): number => {
    t = (t + 0x6d2b79f5) >>> 0
    let r = Math.imul(t ^ (t >>> 15), 1 | t)
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296
  }
}

/** Hash a string to a 32-bit unsigned int. djb2 — stable across engines. */
export const hashString = (s: string): number => {
  let h = 5381
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) >>> 0
  }
  return h
}
