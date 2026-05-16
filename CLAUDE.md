# Magazina — project notes for Claude Code

## AI provider constraints

### Gemini: version 3 ONLY, flash by default
**Не использовать Gemini 2.0** — endpoints `gemini-2.0-*` возвращают ошибки против текущего Google Generative Language API.

Текущий дефолт в [src/ai/providers/gemini.ts](src/ai/providers/gemini.ts):
- `TEXT_MODEL = 'gemini-3-flash-preview'`
- `VISION_MODEL = 'gemini-3-flash-preview'`
- `IMAGE_MODEL = 'imagen-3.0-generate-002'`

**Почему flash а не pro:** `gemini-3-pro-preview` имеет квоту ~5 RPM на free tier и 429-ит под нормальной нагрузкой пайплайна. Flash даёт ×30–50 квоту и достаточен для vision-задач (editorial-классификация кадров, palette, caption).

**Если хочется pro-качества** для одного запуска — пользователь может ввести `gemini-3-pro-preview` в Settings → поле «Модель» под Gemini. Override живёт в localStorage (`stan:ai-models/v1`), бьётся над хардкод-дефолтом.

**Никогда** не откатываться на `gemini-2.x` — даже flash-варианты семейства 2 не работают на текущем API.

### Claude / Grok
Без специальных ограничений. Текущие defaults — `claude-3-5-sonnet-latest` и `grok-2-latest`. Можно обновлять при выходе новых релизов.

## API keys policy
Ключи вводятся пользователем в Settings UI (🔑 кнопка в header) и хранятся в `localStorage` (`stan:ai-keys/v1`). `VITE_*_API_KEY` в `.env.local` — только dev fallback. Подробности — в комментарии в [src/ai/keys.ts](src/ai/keys.ts).
