import { ref } from 'vue'
import { useSpreadStore } from '@/stores/spreadStore'
import { makeImageElement } from '@/utils/elementFactory'
import { prepareLocalImage, uploadImage } from '@/services/imageUpload'

export interface ImportContext {
  spreadId: string | null
  userId: string | null
}

export const useImageImport = (ctx: () => ImportContext) => {
  const store = useSpreadStore()
  const importing = ref(false)
  const importError = ref<string | null>(null)

  const importOne = async (file: File) => {
    const { userId, spreadId } = ctx()
    if (userId && spreadId) {
      try {
        return await uploadImage(file, userId, spreadId)
      } catch (err) {
        console.warn('Storage upload failed, falling back to local data URL', err)
      }
    }
    return prepareLocalImage(file)
  }

  const importFiles = async (files: FileList | File[], anchor?: { x: number; y: number }) => {
    const list = Array.from(files).filter((f) => f.type.startsWith('image/'))
    if (list.length === 0) return
    importing.value = true
    importError.value = null
    try {
      let offsetX = anchor?.x ?? 200
      const baseY = anchor?.y ?? 200
      for (const file of list) {
        const data = await importOne(file)
        const ratio = data.naturalWidth / data.naturalHeight
        const width = Math.min(400, data.naturalWidth)
        const height = width / ratio
        store.addElement(
          makeImageElement({ ...data, x: offsetX, y: baseY, width, height }),
        )
        offsetX += 24
      }
    } catch (err) {
      importError.value = (err as Error).message
      console.error('Image import failed', err)
    } finally {
      importing.value = false
    }
  }

  return { importing, importError, importFiles }
}
