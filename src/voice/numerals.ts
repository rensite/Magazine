// RU numeric word → digits. Covers 0..999, including dative/genitive
// forms commonly produced by ASR ("четырнадцати", "двадцати четырёх").
// Returns null when the token is not a numeral word.

const UNITS: Record<string, number> = {
  'ноль': 0, 'нол': 0,
  'один': 1, 'одна': 1, 'одну': 1, 'одного': 1, 'одной': 1, 'раз': 1,
  'два': 2, 'две': 2, 'двух': 2, 'двум': 2,
  'три': 3, 'трёх': 3, 'трех': 3, 'трём': 3, 'трем': 3,
  'четыре': 4, 'четырёх': 4, 'четырех': 4,
  'пять': 5, 'пяти': 5,
  'шесть': 6, 'шести': 6,
  'семь': 7, 'семи': 7,
  'восемь': 8, 'восьми': 8,
  'девять': 9, 'девяти': 9,
}

const TEENS: Record<string, number> = {
  'десять': 10, 'десяти': 10,
  'одиннадцать': 11, 'одиннадцати': 11,
  'двенадцать': 12, 'двенадцати': 12,
  'тринадцать': 13, 'тринадцати': 13,
  'четырнадцать': 14, 'четырнадцати': 14,
  'пятнадцать': 15, 'пятнадцати': 15,
  'шестнадцать': 16, 'шестнадцати': 16,
  'семнадцать': 17, 'семнадцати': 17,
  'восемнадцать': 18, 'восемнадцати': 18,
  'девятнадцать': 19, 'девятнадцати': 19,
}

const TENS: Record<string, number> = {
  'двадцать': 20, 'двадцати': 20,
  'тридцать': 30, 'тридцати': 30,
  'сорок': 40, 'сорока': 40,
  'пятьдесят': 50, 'пятидесяти': 50,
  'шестьдесят': 60, 'шестидесяти': 60,
  'семьдесят': 70, 'семидесяти': 70,
  'восемьдесят': 80, 'восьмидесяти': 80,
  'девяносто': 90, 'девяноста': 90,
}

const HUNDREDS: Record<string, number> = {
  'сто': 100, 'ста': 100,
  'двести': 200, 'двухсот': 200,
  'триста': 300, 'трёхсот': 300, 'трехсот': 300,
  'четыреста': 400, 'четырёхсот': 400, 'четырехсот': 400,
  'пятьсот': 500, 'пятисот': 500,
  'шестьсот': 600, 'шестисот': 600,
  'семьсот': 700, 'семисот': 700,
  'восемьсот': 800, 'восьмисот': 800,
  'девятьсот': 900, 'девятисот': 900,
}

const valueOf = (token: string): number | null => {
  const t = token.toLowerCase()
  if (t in HUNDREDS) return HUNDREDS[t]
  if (t in TENS) return TENS[t]
  if (t in TEENS) return TEENS[t]
  if (t in UNITS) return UNITS[t]
  return null
}

export const isNumeralWord = (token: string): boolean => valueOf(token) !== null

/**
 * Greedy reduce: starting at index i, consume consecutive numeral tokens
 * and sum them — "двести двадцать четыре" → 224.
 * Returns { value, consumed } or null when the first token isn't a numeral.
 */
export const consumeNumeralPhrase = (
  tokens: string[],
  i: number,
): { value: number; consumed: number } | null => {
  let acc = 0
  let consumed = 0
  while (i + consumed < tokens.length) {
    const v = valueOf(tokens[i + consumed])
    if (v === null) break
    acc += v
    consumed++
  }
  if (consumed === 0) return null
  return { value: acc, consumed }
}

/**
 * Try to read a number at position i — either a digit token like "14"
 * or a numeral phrase. Returns null if no number is here.
 */
export const readNumberAt = (
  tokens: string[],
  i: number,
): { value: number; consumed: number } | null => {
  const tok = tokens[i]
  if (tok === undefined) return null
  if (/^-?\d+(\.\d+)?$/.test(tok)) return { value: parseFloat(tok), consumed: 1 }
  return consumeNumeralPhrase(tokens, i)
}
