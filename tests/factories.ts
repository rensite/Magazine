import { emptySchema, makeImageElement, makeTextElement } from '@/utils/elementFactory'
import type { ImageElement, SpreadSchema, TextElement } from '@/types/element'

export const aText = (overrides: Partial<TextElement> = {}): TextElement =>
  makeTextElement(overrides)

export const anImage = (overrides: Partial<ImageElement> = {}): ImageElement =>
  makeImageElement({
    src: 'user/spread/full.jpg',
    thumb: 'user/spread/thumb.jpg',
    naturalWidth: 800,
    naturalHeight: 600,
    ...overrides,
  })

export const aSchema = (overrides: Partial<SpreadSchema> = {}): SpreadSchema => ({
  ...emptySchema(),
  ...overrides,
})
