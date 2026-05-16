export interface FontDef {
  name: string
  category: 'serif' | 'sans' | 'mono' | 'display' | 'handwriting'
  weights: number[]
  cyrillic: boolean
  source: 'google' | 'local'
  cssStack: string
}

const g = (
  name: string,
  category: FontDef['category'],
  weights: number[],
  cyrillic: boolean,
  fallback: string,
): FontDef => ({
  name,
  category,
  weights,
  cyrillic,
  source: 'google',
  cssStack: `"${name}", ${fallback}`,
})

export const FONT_REGISTRY: FontDef[] = [
  { name: 'serif', category: 'serif', weights: [400, 700], cyrillic: true, source: 'local', cssStack: 'ui-serif, Georgia, "Times New Roman", serif' },
  { name: 'mono', category: 'mono', weights: [400, 700], cyrillic: true, source: 'local', cssStack: 'ui-monospace, "SF Mono", Menlo, monospace' },
  { name: 'hand', category: 'handwriting', weights: [400], cyrillic: false, source: 'local', cssStack: '"Caveat", "Comic Sans MS", cursive' },

  g('Inter', 'sans', [400, 500, 600, 700], true, 'system-ui, sans-serif'),
  g('IBM Plex Sans', 'sans', [400, 500, 600, 700], true, 'system-ui, sans-serif'),
  g('IBM Plex Serif', 'serif', [400, 600, 700], true, 'Georgia, serif'),
  g('IBM Plex Mono', 'mono', [400, 500, 700], true, 'ui-monospace, monospace'),
  g('Source Sans 3', 'sans', [400, 600, 700], true, 'system-ui, sans-serif'),
  g('Source Serif 4', 'serif', [400, 600, 700], true, 'Georgia, serif'),
  g('Manrope', 'sans', [400, 500, 600, 700], true, 'system-ui, sans-serif'),
  g('Spectral', 'serif', [400, 500, 700], true, 'Georgia, serif'),
  g('EB Garamond', 'serif', [400, 500, 700], true, 'Garamond, serif'),
  g('Cormorant Garamond', 'serif', [400, 500, 700], true, 'Garamond, serif'),
  g('Lora', 'serif', [400, 500, 700], true, 'Georgia, serif'),
  g('Crimson Pro', 'serif', [400, 600, 700], true, 'Georgia, serif'),
  g('Playfair Display', 'serif', [400, 700, 900], true, 'Georgia, serif'),
  g('Merriweather', 'serif', [400, 700, 900], true, 'Georgia, serif'),
  g('PT Serif', 'serif', [400, 700], true, 'Georgia, serif'),
  g('PT Sans', 'sans', [400, 700], true, 'system-ui, sans-serif'),
  g('Roboto', 'sans', [400, 500, 700], true, 'system-ui, sans-serif'),
  g('Roboto Slab', 'serif', [400, 500, 700], true, 'Georgia, serif'),
  g('Open Sans', 'sans', [400, 600, 700], true, 'system-ui, sans-serif'),
  g('Nunito', 'sans', [400, 600, 700], true, 'system-ui, sans-serif'),
  g('JetBrains Mono', 'mono', [400, 500, 700], true, 'ui-monospace, monospace'),
  g('Bitter', 'serif', [400, 600, 700], true, 'Georgia, serif'),
  g('Cardo', 'serif', [400, 700], true, 'Georgia, serif'),
  g('Old Standard TT', 'serif', [400, 700], true, 'Georgia, serif'),
]

export const FONT_BY_NAME: Record<string, FontDef> = Object.fromEntries(
  FONT_REGISTRY.map((f) => [f.name, f]),
)

export const lookupFont = (name: string): FontDef => FONT_BY_NAME[name] ?? FONT_REGISTRY[0]

const loaded = new Set<string>()

export const ensureFontLoaded = (name: string): void => {
  const font = FONT_BY_NAME[name]
  if (!font || font.source !== 'google' || loaded.has(name)) return
  loaded.add(name)
  if (typeof document === 'undefined') return
  const weights = font.weights.join(';')
  const subset = font.cyrillic ? '&subset=cyrillic,latin' : ''
  const family = name.replace(/ /g, '+')
  const href = `https://fonts.googleapis.com/css2?family=${family}:wght@${weights}&display=swap${subset}`
  const link = document.createElement('link')
  link.rel = 'stylesheet'
  link.href = href
  link.dataset.fontName = name
  document.head.appendChild(link)
}

export const preconnectGoogleFonts = (): void => {
  if (typeof document === 'undefined') return
  if (document.querySelector('link[data-google-fonts-preconnect]')) return
  const preconnect = document.createElement('link')
  preconnect.rel = 'preconnect'
  preconnect.href = 'https://fonts.gstatic.com'
  preconnect.crossOrigin = 'anonymous'
  preconnect.dataset.googleFontsPreconnect = 'true'
  document.head.appendChild(preconnect)
}
