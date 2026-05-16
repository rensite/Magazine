import { FONT_REGISTRY } from '@/utils/fonts'

// Resolves a token to a registered font name. Order of checks:
// 1. direct synonym match ("санс" → Inter)
// 2. substring against registry names (lowercased), longest first
//    ("плейфэр" → "Playfair Display", "интер" → "Inter")
// Token is assumed already lowercased.

const SYNONYMS: Record<string, string> = {
  'sans': 'Inter',
  'санс': 'Inter',
  'sans-serif': 'Inter',
  'serif': 'Source Serif 4',
  'сериф': 'Source Serif 4',
  'mono': 'JetBrains Mono',
  'моно': 'JetBrains Mono',
  'моноширин': 'JetBrains Mono',
  'плейфэр': 'Playfair Display',
  'плейфер': 'Playfair Display',
  'плейфейр': 'Playfair Display',
  'гарамонд': 'EB Garamond',
  'кормор': 'Cormorant Garamond',
  'кормора': 'Cormorant Garamond',
  'мерривезер': 'Merriweather',
  'мерри': 'Merriweather',
  'крымсон': 'Crimson Pro',
  'спектрал': 'Spectral',
  'лора': 'Lora',
  'битер': 'Bitter',
  'роботa': 'Roboto',
  'робот': 'Roboto',
  'роботослаб': 'Roboto Slab',
  'опен': 'Open Sans',
  'опенсанс': 'Open Sans',
  'нунит': 'Nunito',
  'манроуп': 'Manrope',
  'манроп': 'Manrope',
  'интер': 'Inter',
  'плекс': 'IBM Plex Sans',
  'плекссанс': 'IBM Plex Sans',
  'плекссериф': 'IBM Plex Serif',
  'плексмоно': 'IBM Plex Mono',
  'сорссанс': 'Source Sans 3',
  'сорссериф': 'Source Serif 4',
  'кардо': 'Cardo',
  'олдстандард': 'Old Standard TT',
  'птсериф': 'PT Serif',
  'птсанс': 'PT Sans',
  'джетбрейнс': 'JetBrains Mono',
}

const REGISTRY_LOWER = [...FONT_REGISTRY]
  .map((f) => ({ key: f.name.toLowerCase(), name: f.name }))
  .sort((a, b) => b.key.length - a.key.length)

export const resolveFontName = (token: string): string | null => {
  const t = token.toLowerCase().trim()
  if (!t) return null
  if (SYNONYMS[t]) return SYNONYMS[t]
  // exact registry hit
  for (const r of REGISTRY_LOWER) if (r.key === t) return r.name
  // prefix / substring against registry: "плейфэр" doesn't help here
  // but "playfair" / "inter" / "lora" do.
  for (const r of REGISTRY_LOWER) {
    if (r.key.startsWith(t) || t.startsWith(r.key.replace(/\s+/g, ''))) return r.name
  }
  return null
}

// Multi-word family lookup: tries to combine tokens[i..i+n] into a
// known font, e.g. ["ibm","plex","sans"] → "IBM Plex Sans".
export const consumeFontPhrase = (
  tokens: string[],
  i: number,
): { name: string; consumed: number } | null => {
  for (let n = 3; n >= 1; n--) {
    if (i + n > tokens.length) continue
    const phrase = tokens.slice(i, i + n).join('').toLowerCase()
    const hit = resolveFontName(phrase)
    if (hit) return { name: hit, consumed: n }
    const spaced = tokens.slice(i, i + n).join(' ').toLowerCase()
    const hit2 = resolveFontName(spaced)
    if (hit2) return { name: hit2, consumed: n }
  }
  return null
}
