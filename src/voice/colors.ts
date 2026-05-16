// Russian color stems → hex. Match by prefix to swallow case forms
// ("красным", "красного", "красной" → all hit "красн").
//
// The first matching prefix wins; longer prefixes go first to avoid
// "светло-сер" being shadowed by "сер".

interface ColorEntry { prefix: string; hex: string }

const RAW: ColorEntry[] = [
  // dark/light modifiers handled separately as prefixes
  { prefix: 'тёмно-красн', hex: '#7f1d1d' },
  { prefix: 'темно-красн', hex: '#7f1d1d' },
  { prefix: 'светло-красн', hex: '#fca5a5' },
  { prefix: 'тёмно-син', hex: '#1e3a8a' },
  { prefix: 'темно-син', hex: '#1e3a8a' },
  { prefix: 'светло-син', hex: '#93c5fd' },
  { prefix: 'тёмно-зелён', hex: '#14532d' },
  { prefix: 'темно-зелен', hex: '#14532d' },
  { prefix: 'светло-зелён', hex: '#86efac' },
  { prefix: 'светло-зелен', hex: '#86efac' },
  { prefix: 'тёмно-сер', hex: '#374151' },
  { prefix: 'темно-сер', hex: '#374151' },
  { prefix: 'светло-сер', hex: '#d1d5db' },

  { prefix: 'бордов', hex: '#7f1d1d' },
  { prefix: 'малинов', hex: '#db2777' },
  { prefix: 'алый', hex: '#dc2626' },
  { prefix: 'алого', hex: '#dc2626' },
  { prefix: 'красн', hex: '#dc2626' },

  { prefix: 'оранж', hex: '#ea580c' },
  { prefix: 'персик', hex: '#fb923c' },
  { prefix: 'охр', hex: '#b45309' },

  { prefix: 'золот', hex: '#d4a85f' },
  { prefix: 'жёлт', hex: '#f59e0b' },
  { prefix: 'желт', hex: '#f59e0b' },
  { prefix: 'лимон', hex: '#facc15' },

  { prefix: 'олив', hex: '#65a30d' },
  { prefix: 'салат', hex: '#84cc16' },
  { prefix: 'зелён', hex: '#16a34a' },
  { prefix: 'зелен', hex: '#16a34a' },
  { prefix: 'изумруд', hex: '#059669' },

  { prefix: 'бирюз', hex: '#0891b2' },
  { prefix: 'голуб', hex: '#0ea5e9' },
  { prefix: 'небес', hex: '#38bdf8' },
  { prefix: 'син', hex: '#2563eb' },
  { prefix: 'индиг', hex: '#4338ca' },

  { prefix: 'фиолет', hex: '#7c3aed' },
  { prefix: 'сирен', hex: '#a78bfa' },
  { prefix: 'пурпур', hex: '#a21caf' },

  { prefix: 'розов', hex: '#ec4899' },
  { prefix: 'фуксия', hex: '#d946ef' },

  { prefix: 'коричнев', hex: '#92400e' },
  { prefix: 'шоколад', hex: '#7c2d12' },
  { prefix: 'беж', hex: '#e7d6ba' },
  { prefix: 'кремов', hex: '#fef3c7' },

  { prefix: 'чёрн', hex: '#000000' },
  { prefix: 'черн', hex: '#000000' },
  { prefix: 'бел', hex: '#ffffff' },
  { prefix: 'сер', hex: '#6b7280' },
  { prefix: 'графит', hex: '#374151' },
]

// Sort by prefix length descending so longer compounds win.
const COLOR_STEMS: ColorEntry[] = [...RAW].sort((a, b) => b.prefix.length - a.prefix.length)

export const colorFromWord = (word: string): string | null => {
  const w = word.toLowerCase()
  for (const c of COLOR_STEMS) {
    if (w.startsWith(c.prefix)) return c.hex
  }
  return null
}

const HEX_RE = /^#?[0-9a-f]{6}$/i
const HEX_SHORT_RE = /^#?[0-9a-f]{3}$/i

export const hexFromWord = (word: string): string | null => {
  const w = word.replace(/^#/, '')
  if (HEX_RE.test(w)) return `#${w.toLowerCase()}`
  if (HEX_SHORT_RE.test(w)) {
    const [a, b, c] = w.toLowerCase().split('')
    return `#${a}${a}${b}${b}${c}${c}`
  }
  return null
}
