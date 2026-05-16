import { onBeforeUnmount, ref } from 'vue'

// Minimal Web Speech API types — TS lib.dom doesn't ship them yet.
interface SpeechRecognitionAlternative { transcript: string; confidence: number }
interface SpeechRecognitionResult {
  isFinal: boolean
  readonly length: number
  item(i: number): SpeechRecognitionAlternative
  [i: number]: SpeechRecognitionAlternative
}
interface SpeechRecognitionResultList {
  readonly length: number
  item(i: number): SpeechRecognitionResult
  [i: number]: SpeechRecognitionResult
}
interface SpeechRecognitionEvent extends Event {
  readonly resultIndex: number
  readonly results: SpeechRecognitionResultList
}
interface SpeechRecognitionErrorEvent extends Event {
  readonly error: string
  readonly message: string
}
interface SpeechRecognition extends EventTarget {
  lang: string
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  start(): void
  stop(): void
  abort(): void
  onresult: ((e: SpeechRecognitionEvent) => void) | null
  onerror: ((e: SpeechRecognitionErrorEvent) => void) | null
  onend: (() => void) | null
  onstart: (() => void) | null
}
interface SpeechRecognitionCtor {
  new (): SpeechRecognition
}

const getCtor = (): SpeechRecognitionCtor | null => {
  if (typeof window === 'undefined') return null
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor
    webkitSpeechRecognition?: SpeechRecognitionCtor
  }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

export interface VoiceOptions {
  lang?: string
  onTranscript: (transcript: string) => void
  onInterim?: (transcript: string) => void
  onError?: (message: string) => void
}

export const useVoiceCommand = (opts: VoiceOptions) => {
  const supported = getCtor() !== null
  const listening = ref(false)
  const interim = ref('')
  const error = ref<string | null>(null)

  let recognition: SpeechRecognition | null = null
  let didReceiveFinal = false

  const teardown = () => {
    if (!recognition) return
    recognition.onresult = null
    recognition.onerror = null
    recognition.onend = null
    recognition.onstart = null
    try { recognition.abort() } catch { /* ignore */ }
    recognition = null
  }

  const start = () => {
    if (listening.value) return
    const Ctor = getCtor()
    if (!Ctor) {
      error.value = 'Браузер не поддерживает распознавание речи'
      opts.onError?.(error.value)
      return
    }
    error.value = null
    interim.value = ''
    didReceiveFinal = false
    recognition = new Ctor()
    recognition.lang = opts.lang ?? 'ru-RU'
    recognition.continuous = false
    recognition.interimResults = true
    recognition.maxAlternatives = 1
    recognition.onstart = () => { listening.value = true }
    recognition.onresult = (e: SpeechRecognitionEvent) => {
      let final = ''
      let partial = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i]
        const t = r[0]?.transcript ?? ''
        if (r.isFinal) final += t
        else partial += t
      }
      if (partial) {
        interim.value = partial
        opts.onInterim?.(partial)
      }
      if (final.trim()) {
        didReceiveFinal = true
        opts.onTranscript(final.trim())
      }
    }
    recognition.onerror = (e: SpeechRecognitionErrorEvent) => {
      error.value = e.message || e.error
      opts.onError?.(error.value)
    }
    recognition.onend = () => {
      listening.value = false
      if (!didReceiveFinal && interim.value.trim()) {
        // Some implementations end without firing isFinal; salvage the
        // last partial so the user isn't ignored.
        opts.onTranscript(interim.value.trim())
      }
      interim.value = ''
      recognition = null
    }
    try {
      recognition.start()
    } catch (err) {
      error.value = (err as Error).message
      opts.onError?.(error.value)
      teardown()
    }
  }

  const stop = () => {
    if (!recognition) return
    try { recognition.stop() } catch { /* ignore */ }
  }

  onBeforeUnmount(teardown)

  return { supported, listening, interim, error, start, stop }
}
