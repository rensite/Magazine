# Stan Book Editor (`magazina`)

Веб-редактор книжных разворотов: две страницы, текст и картинки, drag/resize/rotate, undo, авто-сохранение в Supabase + локальный кэш.

Stack: **Vue 3** (Composition API, `<script setup>`) + **Pinia** + **Immer** (patches) + **Vite** + **TypeScript** + **Tailwind** + **Supabase** (Auth, Postgres, Storage). Тесты — **Vitest** (`tests/utils`, `tests/stores`) + **Playwright** (e2e, конфиг ещё не виден).

---

## Архитектура — поток данных

```
Supabase (postgres jsonb + storage)
        ↑ saveAuto / saveVersion / signedUrls
        │
[ services/spreadService ]   [ services/imageUpload ]
        │                              │
        ↑                              ↑
[ composables/usePersistence ]   [ Toolbar.vue ]
        │
        ↓  watch(store.dirty)
[ stores/spreadStore (Pinia) ]   ←— immer patches (undo/redo/transactions)
        │
        ↓
[ EditorCanvas → SvgLayer / HtmlLayer / OverlayLayer / Guides ]
        │
        ↓ pointer events
[ composables/useDragResize, useViewport, useCanvasPointer ]
```

### Источник истины
`useSpreadStore` (`src/stores/spreadStore.ts`) хранит `SpreadSchema` v2 (`src/types/element.ts`) — единый JSON-документ разворота:
- `pages: { left, right }` (PageSettings: width/height/margins/bleed)
- `gutter`, `mirrorPages`, `orientation`, `units`, `background`, `showGuides`
- `elements: SpreadElement[]` — `TextElement | ImageElement` (плоский массив, z-order = индекс)

### История (undo/redo)
`apply(label, recipe)` → `produceWithPatches` (immer) → пушим `{patches, inverse}` в `past`, `HISTORY_LIMIT = 200`. `future` чистится при новой мутации.

**Транзакции для drag/resize/rotate:**
- `beginInteraction(label)` запоминает `txInitial = schema`.
- `updateInteraction(recipe)` мутирует schema БЕЗ записи в history (быстрые pointer-move).
- `commitInteraction()` пишет ОДИН patch от initial→final в history.
- `rollbackInteraction()` (на Esc / window blur / orphan tx) возвращает к initial.

`setLayout()` — обходит history целиком (используется auto-size текста, где размеры — следствие контента, а не намерения).

### Координаты
- **Canvas-space**: пиксели от верх-лево разворота. Все x/y элементов в этой системе.
- **Screen→canvas**: `useCanvasPointer.screenToCanvas(clientX, clientY)` через `containerRef.getBoundingClientRect()`, `store.zoom`, `store.pan`. Это единственный источник истины для pointer math (см. recent commit 2c4c1ff).
- `useViewport` управляет zoom/pan: wheel = pan, ⌘+wheel = zoom в точку, Space+drag / middle-click = pan, ⌘0 = fit, ⌘1 = 100%.

### Drag/Resize/Rotate (`useDragResize.ts`)
- Слушатели вешаются на `window` (commit b178954) → не теряем pointer при выходе за canvas.
- Стартовый снапшот элемента — `JSON.parse(JSON.stringify(el))` (commit a048c8f: `structuredClone` ломался на Pinia-прокси).
- Resize: `geometry.resizeBox(box, handle, dx, dy, shift)`. Текст при resize теряет `autoWidth`.
- Rotate: angle от центра элемента; без shift — `snapAngle` к 15°.

### Persistence (`composables/usePersistence.ts`)
Двухуровневое сохранение, привязанное к `store.dirty`:
1. **Local (IndexedDB через `idb-keyval`)** — debounce 500мс, `cachePut(spreadId, schema)` в `services/localCache.ts`.
2. **Remote (Supabase)** — heartbeat 60с (`flushRemote`), вызывает `service.saveAuto` (просто UPDATE schema).
3. **Force save (⌘S / `forceSave`)** — local + remote + `saveVersion` (RPC `save_spread_version`, инкремент `current_version`, запись в `spread_versions`).
4. На старте `openSpread` сравнивает `cache.savedAt` vs `record.updated_at` (`isCacheNewer`) — если cache новее (offline edits), грузим его.
5. `beforeunload` вешает confirm если есть несохранённое.

### Изображения
- `services/imageUpload.ts`: `loadImage` → canvas resize до `MAX_FULL=2000` и `MAX_THUMB=300`, JPEG q=0.9.
- `uploadImage(file, userId, spreadId)` → Supabase Storage bucket `spread-assets`, путь `{userId}/{spreadId}/{uuid}.jpg`. RLS на storage.objects по первому сегменту пути.
- В schema хранятся **storage paths**, не URL. `useImageUrls` собирает уникальные `src/thumb` со всех `ImageElement`-ов и батчем запрашивает `signedUrls` (1 час). HTML/SVG-слои потребляют через provide/inject `imageUrls`.
- Fallback: если auth/upload падает — `prepareLocalImage` инлайнит data URL (тяжелит JSONB, для прототипирования).

---

## Supabase схема (`supabase/schema.sql`)

**Таблицы:**
- `spreads(id, owner_id, title, schema jsonb, current_version, created_at, updated_at)`
- `spread_versions(id, spread_id, version, schema jsonb, label, created_at)` — уникально по `(spread_id, version)`.

**Триггер** `touch_spread_updated_at` обновляет `updated_at` на UPDATE.

**RPC (security definer, всегда проверяет `auth.uid() = owner_id`):**
- `save_spread_version(spread_id, schema, label)` — инкрементирует `current_version`, апдейтит `spreads.schema`, инсёртит снапшот в `spread_versions`.
- `restore_spread_version(spread_id, version_id)` — копирует исторический schema обратно в spreads + сохраняет новую версию с label `'restored'`.

**RLS:** на `spreads` и `spread_versions` — owner only (через join). На storage `spread-assets` — owner определяется первым сегментом path.

**Env (`.env.local`):**
```
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_SUPABASE_ASSETS_BUCKET=spread-assets
```

---

## Компоненты

| Файл | Роль |
|---|---|
| `App.vue` | Auth gate, список разворотов, открытие/создание/удаление, header со статусом сохранения. |
| `EditorCanvas.vue` | Контейнер canvas. Рисует две страницы (paper-texture / plain), монтирует слои, `stageStyle` = pan+zoom transform. Build SHA в правом нижнем углу. |
| `SvgLayer.vue` | SVG-рендер элементов (для будущих масок/векторов). |
| `HtmlLayer.vue` | HTML-рендер (текст, картинки) для GPU-композитинга. |
| `OverlayLayer.vue` | `SelectionHandles` поверх выбранного. |
| `Guides.vue` | Margins/bleed/gutter направляющие (toggle через `store.showGuides`). |
| `SelectionHandles.vue` | 8 ручек resize + ручка rotate, маршрутизирует pointer events в `useDragResize`. |
| `Toolbar.vue` | + Text, + Image, undo/redo, шрифт/размер/цвет (для текста), opacity, front/back, delete. |
| `PageSettingsPanel.vue` | Правый сайдбар: размер страниц, margins, bleed, gutter, mirror, фон, units, ориентация. |
| `SpreadsMenu.vue` | Дропдаун: список, переименование, удаление, sign out. |
| `AuthGate.vue` | Email/password (Supabase Auth). |
| `elements/TextElementNode.vue` | Contenteditable, авто-измерение → `setLayout` (без history). Углы получили corner-handles в недавнем коммите 96d1b56. |
| `elements/ImageElementNode.vue` | `<img>` с подмененным `src` через `imageUrls` (signed URLs). |

## Composables

| Файл | Роль |
|---|---|
| `useCanvasPointer.ts` | `screenToCanvas` через provided `containerRef` — единый источник pointer math. |
| `useDragResize.ts` | drag / resize / rotate с window-listeners и transactional history. |
| `useViewport.ts` | zoom/pan, fit, ⌘0/⌘1, Space-pan, wheel. |
| `useElementTransform.ts` | Helpers для CSS/SVG transform. |
| `usePersistence.ts` | Local debounce + remote heartbeat + force save. |
| `useImageUrls.ts` | Батч signed URLs для всех картинок в schema. |
| `useKeyboardShortcuts.ts` | ⌘S (save), ⌘Z / ⌘⇧Z (undo/redo), Delete. |
| `useTextDefaults.ts` | Sticky-стиль для нового текста (запоминает последний font/size/color). |

## Utils

- `utils/units.ts` — `toPx(value, unit)` для mm/in/px.
- `utils/pagePresets.ts` — A4/A5/B5/letter/square/etc.
- `utils/geometry.ts` — `resizeBox(box, handle, dx, dy, lockAspect)`, `snapAngle`.
- `utils/transform.ts` — `Box`, `toCssTransform/toSvgTransform`, `rotatePoint`, `localToCanvas`.
- `utils/elementFactory.ts` — `makeTextElement`, `makeImageElement`, `emptySchema`, `cloneElement`, `migrateSchema` (v1→v2), `spreadCanvasSize`, `rightPageX`.

---

## Build / scripts

- `npm run dev` — Vite.
- `npm run build` — `vue-tsc -b && vite build`. Vite инжектит `__BUILD_SHA__` (git short hash или `GITHUB_SHA`) и `__BUILD_TIME__`.
- `npm run typecheck`, `npm run test` (vitest), `npm run test:e2e` (playwright).
- Алиас `@/` → `src/`.

---

## Что покрыто тестами

- `tests/utils/{geometry,transform,units,migration}.test.ts` — чистые функции.
- `tests/stores/spreadStore.test.ts` — store actions, history, transactions.
- `tests/factories.ts` — фабрики для тестов.

Не покрыто: persistence, imageUpload, composables, компоненты, e2e (playwright не сконфигурирован?).

---

## Известные нюансы / "почему так"

- **`JSON.parse(JSON.stringify(el))` вместо `structuredClone`** в `useDragResize` — Pinia-прокси не переживают structuredClone (commit a048c8f).
- **Window-listeners для drag** — pointer не теряется при выходе за canvas (commit b178954).
- **Один `screenToCanvas`** — раньше pointer math дублировалась в нескольких местах с расхождениями (commit 2c4c1ff).
- **Schema v1 → v2 migration** в `migrateSchema`: одна страница `pageWidth × pageHeight` → две page settings с дефолтными margins.
- **`setLayout` без history** — auto-size текста не должен засорять undo-стек.
- **`mirrorPages: true`** — правая страница = JSON-клон левой при любых изменениях settings.
