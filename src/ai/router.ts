// Per-task default routing + fallback chain.
//
// Routing matches the spec's §2.2 table:
//   vision           → gemini  (fallback claude → grok)
//   analyst          → claude  (fallback grok)
//   angles           → claude  (fallback grok)
//   editor           → claude  (fallback grok)
//   gaps             → claude  (fallback grok)
//   image-generation → grok    (fallback gemini)
//   classify         → grok    (fallback gemini)

import { claudeProvider } from './providers/claude'
import { geminiProvider } from './providers/gemini'
import { grokProvider } from './providers/grok'
import { type AiTask, type Provider, type ProviderId } from './types'

const PROVIDERS: Record<ProviderId, Provider> = {
  claude: claudeProvider,
  gemini: geminiProvider,
  grok: grokProvider,
}

const ROUTING: Record<AiTask, ProviderId[]> = {
  vision: ['gemini', 'claude', 'grok'],
  analyst: ['claude', 'grok'],
  angles: ['claude', 'grok'],
  editor: ['claude', 'grok'],
  gaps: ['claude', 'grok'],
  'image-generation': ['grok', 'gemini'],
  classify: ['grok', 'gemini'],
}

/** Resolve a Provider instance by id. Exposed for tests. */
export const providerById = (id: ProviderId): Provider => PROVIDERS[id]

/**
 * Returns the ordered chain of providers to try for a task.
 * If `forced` is set, returns [forced]. Otherwise returns the routing
 * default. Callers can pass `enableFallback: false` to use only the first.
 */
export const chainForTask = (task: AiTask, forced?: ProviderId): ProviderId[] => {
  if (forced) return [forced]
  return ROUTING[task]
}
