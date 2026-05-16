// Top-level orchestrator for the editorial generator. Wires Layers 1–5
// to the Pinia store, surfaces an abort handle, and exposes the actions
// the UI invokes step-by-step.

import { computed, ref } from 'vue'
import { useGeneratorStore } from '@/stores/generatorStore'
import { runAnalyst, analyzeImageLocally } from '@/generator/analyst'
import { generateAngles } from '@/generator/angles'
import { runEditorsForAngles } from '@/generator/editors'
import { compile, validate } from '@/generator/layout'
import type {
  Brief,
  MediaTechMeta,
} from '@/generator/schemas/brief'
import type { StoryAngle } from '@/generator/schemas/angle'
import type { EditorOutput } from '@/generator/schemas/editorOutput'
import type { ValidationIssue } from '@/generator/layout/validate'
import type { SpreadSchema } from '@/types/element'
import type { RawMaterial } from '@/types/generation'

export interface ImageUploadInput {
  id: string
  blob: Blob
  filename: string
  url: string
  userHint?: string
  tech?: MediaTechMeta
}

export interface CompiledVariant {
  angleId: string
  output: EditorOutput
  schema: SpreadSchema
  issues: ValidationIssue[]
}

export const useGenerator = () => {
  const store = useGeneratorStore()

  /** Currently-active abort controller, lets the UI cancel long ops. */
  const abortController = ref<AbortController | null>(null)

  const isWorking = computed(
    () =>
      store.status === 'uploading' ||
      store.status === 'analyzing' ||
      store.status === 'generating-angles' ||
      store.status === 'compiling',
  )

  const cancel = (): void => {
    abortController.value?.abort()
    abortController.value = null
  }

  /** Step 1: kickoff. Creates a Pinia + Supabase session row. */
  const startSession = async (title: string): Promise<void> => {
    await store.createSession(title || 'Untitled session')
  }

  /**
   * Add an image to the session. Runs local analysis on the blob to extract
   * tech metadata, then records a RawMaterial entry. The blob upload to
   * Supabase Storage is the caller's responsibility (use useImageImport).
   */
  const addImage = async (input: ImageUploadInput): Promise<void> => {
    const tech = input.tech ?? (await analyzeImageLocally(input.blob))
    const material: RawMaterial = {
      id: input.id,
      kind: 'image',
      storagePath: input.url,
      filename: input.filename,
      size: input.blob.size,
      userHint: input.userHint,
      createdAt: new Date().toISOString(),
    }
    store.addMaterial(material)
    // Cache the tech blob next to the material id so vision step can find it.
    const techBag = (store.session as { __imageTech?: Record<string, MediaTechMeta> } | null) ?? {}
    if (!techBag.__imageTech) techBag.__imageTech = {}
    techBag.__imageTech[input.id] = tech
  }

  const addInlineText = (text: string, filename = 'pasted-text.txt'): void => {
    const material: RawMaterial = {
      id: `t-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      kind: 'text',
      inlineText: text,
      filename,
      size: text.length,
      createdAt: new Date().toISOString(),
    }
    store.addMaterial(material)
  }

  /** Step 2: run Layer 1 (analyst). */
  const runAnalysis = async (uiLanguage = 'ru'): Promise<Brief> => {
    if (!store.session) throw new Error('No active session')
    store.setStatus('analyzing')
    const ctrl = new AbortController()
    abortController.value = ctrl
    try {
      const rawText = store.materials
        .filter((m) => m.kind === 'text' && m.inlineText)
        .map((m) => m.inlineText!)
        .join('\n\n')
      const techBag =
        (store.session as { __imageTech?: Record<string, MediaTechMeta> } | null)?.__imageTech ?? {}
      const images = store.materials
        .filter((m) => m.kind === 'image' && m.storagePath)
        .map((m) => ({
          id: m.id,
          url: m.storagePath!,
          tech: techBag[m.id] ?? {
            width: 1,
            height: 1,
            aspectRatio: 1,
            palette: [],
          },
          userHint: m.userHint,
        }))
      const brief = await runAnalyst({
        rawText,
        images,
        uiLanguage,
        signal: ctrl.signal,
      })
      store.setBrief(brief)
      return brief
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') throw err
      store.setError(err instanceof Error ? err.message : String(err))
      throw err
    } finally {
      abortController.value = null
    }
  }

  /** Step 3: generate story angles. */
  const runAngles = async (count = 4, uiLanguage = 'ru'): Promise<StoryAngle[]> => {
    if (!store.session?.brief) throw new Error('No brief')
    store.setStatus('generating-angles')
    const ctrl = new AbortController()
    abortController.value = ctrl
    try {
      const angles = await generateAngles(store.session.brief as Brief, {
        count,
        uiLanguage,
        signal: ctrl.signal,
      })
      store.setAngles(angles, angles.map((a) => a.id))
      return angles
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') throw err
      store.setError(err instanceof Error ? err.message : String(err))
      throw err
    } finally {
      abortController.value = null
    }
  }

  /**
   * Steps 4 + 5: run editors for the selected angles, compile each partitura
   * into a SpreadSchema, validate, and return the bundle.
   */
  const runEditorsAndCompile = async (
    uiLanguage = 'ru',
  ): Promise<CompiledVariant[]> => {
    if (!store.session?.brief || !store.session.angles) {
      throw new Error('Brief/angles not ready')
    }
    store.setStatus('compiling')
    const ctrl = new AbortController()
    abortController.value = ctrl
    try {
      const angles = store.session.angles as StoryAngle[]
      const selected = angles.filter((a) => store.session!.selectedAngleIds.includes(a.id))
      const brief = store.session.brief as Brief
      const editorResults = await runEditorsForAngles(brief, selected, uiLanguage, ctrl.signal)
      const variants: CompiledVariant[] = []
      for (const r of editorResults) {
        if (!r.output) continue
        const schema = compile({ brief, output: r.output })
        const validation = validate(schema, { autoCorrect: true })
        variants.push({
          angleId: r.angleId,
          output: r.output,
          schema: validation.schema,
          issues: validation.issues,
        })
        store.setVariant(r.angleId, {
          output: r.output,
          schema: validation.schema,
          issues: validation.issues,
        })
      }
      store.setStatus('variants-ready')
      return variants
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') throw err
      store.setError(err instanceof Error ? err.message : String(err))
      throw err
    } finally {
      abortController.value = null
    }
  }

  return {
    store,
    isWorking,
    cancel,
    startSession,
    addImage,
    addInlineText,
    runAnalysis,
    runAngles,
    runEditorsAndCompile,
  }
}
