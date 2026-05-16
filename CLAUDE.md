# Magazina — project notes for Claude Code

## AI provider constraints

### Gemini: version 3 ONLY
**Не использовать Gemini 2.0** — endpoints `gemini-2.0-*` возвращают ошибки против текущего Google Generative Language API. Все `gemini-*-latest` aliases в [src/ai/providers/gemini.ts](src/ai/providers/gemini.ts) должны быть на серии **3**:

- `TEXT_MODEL = 'gemini-3-pro-latest'`
- `VISION_MODEL = 'gemini-3-pro-latest'`
- `IMAGE_MODEL` — Imagen, отдельная семья, остаётся на текущей рабочей версии

Если когда-то понадобится поменять модель Gemini — поменять ТОЛЬКО на другую `gemini-3-*-latest` (например `gemini-3-flash-latest` для дешевле/быстрее), но **не** откатываться на 2.x.

### Claude / Grok
Без специальных ограничений. Текущие defaults — `claude-3-5-sonnet-latest` и `grok-2-latest`. Можно обновлять при выходе новых релизов.

## API keys policy
Ключи вводятся пользователем в Settings UI (🔑 кнопка в header) и хранятся в `localStorage` (`stan:ai-keys/v1`). `VITE_*_API_KEY` в `.env.local` — только dev fallback. Подробности — в комментарии в [src/ai/keys.ts](src/ai/keys.ts).
