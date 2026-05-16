import type { SpreadElement, TextElement, ImageElement } from '@/types/element'

export type VoicePatch = Partial<TextElement> & Partial<ImageElement>
import { readNumberAt } from './numerals'
import { colorFromWord, hexFromWord } from './colors'
import { consumeFontPhrase } from './fontSynonyms'

const LINKERS = new Set(['на', 'в', 'до', 'к', 'по'])
const readNumberSkippingLinkers = (
  tokens: string[],
  start: number,
): { value: number; consumed: number } | null => {
  let offset = 0
  while (LINKERS.has(tokens[start + offset])) offset++
  const found = readNumberAt(tokens, start + offset)
  return found ? { value: found.value, consumed: offset + found.consumed } : null
}

export interface ParsedCommand {
  patch: VoicePatch
  actions: Array<'delete' | 'duplicate' | 'undo' | 'redo' | 'reset' | 'lock' | 'unlock' | 'hide' | 'show' | 'front' | 'back' | 'fitFrame' | 'fitText'>
  recognized: string[] // human-readable phrases applied
  unknown: string[]    // tokens we could not classify
}

const tokenize = (raw: string): string[] => {
  return raw
    .toLowerCase()
    .replace(/ё/g, 'ё') // keep ё
    .replace(/[,.;:!?"«»()]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
}

const WEIGHT_WORDS: Record<string, number> = {
  'тонкий': 300, 'тонкого': 300, 'светлый': 300, 'лайт': 300, 'light': 300, 'thin': 100,
  'обычный': 400, 'регуляр': 400, 'regular': 400, 'normal': 400, 'нормальный': 400,
  'медиум': 500, 'medium': 500, 'средний': 500,
  'полужирный': 600, 'семибольд': 600, 'semibold': 600, 'демибольд': 600,
  'жирный': 700, 'жирным': 700, 'жирного': 700, 'болд': 700, 'bold': 700,
  'чёрный': 900, 'черный': 900, 'блэк': 900, 'black': 900, 'heavy': 900,
}

const ALIGN_WORDS: Record<string, 'left' | 'center' | 'right'> = {
  'слева': 'left', 'влево': 'left', 'налево': 'left', 'left': 'left',
  'центру': 'center', 'центр': 'center', 'посередине': 'center', 'center': 'center',
  'справа': 'right', 'вправо': 'right', 'направо': 'right', 'right': 'right',
}

const SIZE_TRIGGERS = new Set(['шрифт', 'размер', 'кегль', 'кеглем', 'size'])
const COLOR_TRIGGERS = new Set(['цвет', 'цветом', 'color', 'fill', 'заливка'])
const LINE_HEIGHT_TRIGGERS = new Set(['межстрочный', 'интерлиньяж', 'линия', 'leading', 'lineheight'])
const TRACKING_TRIGGERS = new Set(['трекинг', 'разрядка', 'tracking', 'letterspacing'])
const OPACITY_TRIGGERS = new Set(['прозрачность', 'opacity', 'непрозрачность', 'альфа'])
const ROTATE_TRIGGERS = new Set(['поверни', 'повернуть', 'наклон', 'наклони', 'rotate', 'угол'])
const WIDTH_TRIGGERS = new Set(['ширина', 'ширину', 'w', 'width'])
const HEIGHT_TRIGGERS = new Set(['высота', 'высоту', 'h', 'height'])
const ITALIC_WORDS = new Set(['курсив', 'курсивом', 'наклонный', 'италик', 'italic'])
const UNDERLINE_WORDS = new Set(['подчеркнуть', 'подчёркнутый', 'подчеркнутый', 'underline', 'подчерк'])
const DELETE_WORDS = new Set(['удали', 'удалить', 'убери', 'убрать', 'delete', 'remove'])
const DUP_WORDS = new Set(['продублируй', 'дублировать', 'копир', 'duplicate'])
const UNDO_WORDS = new Set(['отмени', 'отменить', 'назад', 'undo'])
const REDO_WORDS = new Set(['верни', 'повтори', 'redo'])
const RESET_WORDS = new Set(['сбрось', 'сбросить', 'reset'])
const LOCK_WORDS = new Set(['заблокируй', 'lock', 'залочь'])
const UNLOCK_WORDS = new Set(['разблокируй', 'unlock', 'отлочь'])
const HIDE_WORDS = new Set(['скрой', 'скрыть', 'hide'])
const SHOW_WORDS = new Set(['покажи', 'show'])
const FRONT_WORDS = new Set(['наверх', 'вперёд', 'вперед', 'front'])
const BACK_WORDS = new Set(['вниз', 'назадслой', 'back'])
const FIT_FRAME_WORDS = new Set(['обтяни', 'пофрейми', 'fitframe'])
const FIT_TEXT_WORDS = new Set(['заполни', 'fittext'])

const SKIP = new Set([
  'и', 'а', 'но', 'или', 'сделай', 'поставь', 'установи', 'выставь',
  'дай', 'давай', 'будет', 'будь', 'на', 'до', 'это', 'пожалуйста',
  'теперь', 'затем', 'потом', 'мне', 'тут', 'этот', 'этого',
])

const SHIFT_DIRECTION: Record<string, { axis: 'x' | 'y'; sign: 1 | -1 }> = {
  'вправо': { axis: 'x', sign: 1 },
  'направо': { axis: 'x', sign: 1 },
  'влево': { axis: 'x', sign: -1 },
  'налево': { axis: 'x', sign: -1 },
  'вниз': { axis: 'y', sign: 1 },
  'вверх': { axis: 'y', sign: -1 },
}

const SHIFT_TRIGGERS = new Set(['сдвинь', 'подвинь', 'смести', 'move', 'двинь'])

export interface ParseContext {
  selected: SpreadElement | null
}

export const parseCommand = (raw: string, ctx: ParseContext): ParsedCommand => {
  const tokens = tokenize(raw)
  const patch: Record<string, unknown> = {}
  const actions: ParsedCommand['actions'] = []
  const recognized: string[] = []
  const unknown: string[] = []
  const selectedType = ctx.selected?.type

  let i = 0
  while (i < tokens.length) {
    const t = tokens[i]
    if (SKIP.has(t)) { i++; continue }

    // ---- Triggered numeric slots ----
    if (SIZE_TRIGGERS.has(t)) {
      const num = readNumberSkippingLinkers(tokens, i + 1)
      if (num) {
        patch.fontSize = num.value
        recognized.push(`размер ${num.value}`)
        i += 1 + num.consumed
        continue
      }
    }
    if (LINE_HEIGHT_TRIGGERS.has(t)) {
      const num = readNumberSkippingLinkers(tokens, i + 1)
      if (num) {
        patch.lineHeight = num.value
        recognized.push(`межстрочный ${num.value}`)
        i += 1 + num.consumed
        continue
      }
    }
    if (TRACKING_TRIGGERS.has(t)) {
      const num = readNumberSkippingLinkers(tokens, i + 1)
      if (num) {
        patch.letterSpacing = num.value
        recognized.push(`трекинг ${num.value}`)
        i += 1 + num.consumed
        continue
      }
    }
    if (OPACITY_TRIGGERS.has(t)) {
      const num = readNumberSkippingLinkers(tokens, i + 1)
      if (num) {
        const v = num.value > 1 ? num.value / 100 : num.value
        patch.opacity = Math.max(0, Math.min(1, v))
        recognized.push(`прозрачность ${Math.round(v * 100)}%`)
        i += 1 + num.consumed
        continue
      }
    }
    if (ROTATE_TRIGGERS.has(t)) {
      const num = readNumberSkippingLinkers(tokens, i + 1)
      if (num) {
        patch.rotate = num.value
        recognized.push(`поворот ${num.value}°`)
        i += 1 + num.consumed
        continue
      }
    }
    if (WIDTH_TRIGGERS.has(t)) {
      const num = readNumberSkippingLinkers(tokens, i + 1)
      if (num) {
        patch.width = num.value
        recognized.push(`ширина ${num.value}`)
        i += 1 + num.consumed
        continue
      }
    }
    if (HEIGHT_TRIGGERS.has(t)) {
      const num = readNumberSkippingLinkers(tokens, i + 1)
      if (num) {
        patch.height = num.value
        recognized.push(`высота ${num.value}`)
        i += 1 + num.consumed
        continue
      }
    }
    if (SHIFT_TRIGGERS.has(t)) {
      const dirTok = tokens[i + 1]
      const dir = dirTok ? SHIFT_DIRECTION[dirTok] : undefined
      const numTok = dir ? readNumberSkippingLinkers(tokens, i + 2) : null
      if (dir && numTok && ctx.selected) {
        const delta = numTok.value * dir.sign
        if (dir.axis === 'x') patch.x = (ctx.selected.x ?? 0) + delta
        else patch.y = (ctx.selected.y ?? 0) + delta
        recognized.push(`сдвиг ${dirTok} ${numTok.value}`)
        i += 2 + numTok.consumed
        continue
      }
    }

    // ---- Color triggers ----
    if (COLOR_TRIGGERS.has(t)) {
      const next = tokens[i + 1]
      if (next) {
        const hex = hexFromWord(next) ?? colorFromWord(next)
        if (hex) {
          patch.color = hex
          recognized.push(`цвет ${hex}`)
          i += 2
          continue
        }
      }
    }

    // ---- Standalone color word ----
    {
      const hex = hexFromWord(t) ?? colorFromWord(t)
      if (hex) {
        patch.color = hex
        recognized.push(`цвет ${hex}`)
        i++
        continue
      }
    }

    // ---- Weight ----
    if (t in WEIGHT_WORDS) {
      patch.fontWeight = WEIGHT_WORDS[t]
      recognized.push(`вес ${WEIGHT_WORDS[t]}`)
      i++
      continue
    }

    // ---- Italic / underline ----
    if (ITALIC_WORDS.has(t)) {
      patch.italic = true
      recognized.push('курсив')
      i++
      continue
    }
    if (UNDERLINE_WORDS.has(t)) {
      patch.underline = true
      recognized.push('подчёркнутый')
      i++
      continue
    }

    // ---- Align ----
    if (selectedType === 'text' && (t === 'по' || t === 'выровняй') && tokens[i + 1]) {
      const align = ALIGN_WORDS[tokens[i + 1]]
      if (align) {
        patch.align = align
        recognized.push(`выравнивание ${align}`)
        i += 2
        continue
      }
    }
    if (selectedType === 'text' && ALIGN_WORDS[t]) {
      patch.align = ALIGN_WORDS[t]
      recognized.push(`выравнивание ${ALIGN_WORDS[t]}`)
      i++
      continue
    }

    // ---- Bare number near "размер"/"шрифт" elsewhere: skip — only via trigger ----

    // ---- Font family phrase ----
    const family = consumeFontPhrase(tokens, i)
    if (family) {
      patch.fontFamily = family.name
      recognized.push(`шрифт ${family.name}`)
      i += family.consumed
      continue
    }

    // ---- Actions ----
    if (DELETE_WORDS.has(t)) { actions.push('delete'); recognized.push('удалить'); i++; continue }
    if (DUP_WORDS.has(t)) { actions.push('duplicate'); recognized.push('дублировать'); i++; continue }
    if (UNDO_WORDS.has(t)) { actions.push('undo'); recognized.push('отменить'); i++; continue }
    if (REDO_WORDS.has(t)) { actions.push('redo'); recognized.push('повторить'); i++; continue }
    if (RESET_WORDS.has(t)) { actions.push('reset'); recognized.push('сбросить'); i++; continue }
    if (LOCK_WORDS.has(t)) { actions.push('lock'); recognized.push('блокировка'); i++; continue }
    if (UNLOCK_WORDS.has(t)) { actions.push('unlock'); recognized.push('разблокировка'); i++; continue }
    if (HIDE_WORDS.has(t)) { actions.push('hide'); recognized.push('скрыть'); i++; continue }
    if (SHOW_WORDS.has(t)) { actions.push('show'); recognized.push('показать'); i++; continue }
    if (FRONT_WORDS.has(t)) { actions.push('front'); recognized.push('наверх'); i++; continue }
    if (BACK_WORDS.has(t)) { actions.push('back'); recognized.push('вниз'); i++; continue }
    if (FIT_FRAME_WORDS.has(t)) { actions.push('fitFrame'); recognized.push('подогнать рамку'); i++; continue }
    if (FIT_TEXT_WORDS.has(t)) { actions.push('fitText'); recognized.push('подогнать текст'); i++; continue }

    unknown.push(t)
    i++
  }

  return { patch: patch as VoicePatch, actions, recognized, unknown }
}
