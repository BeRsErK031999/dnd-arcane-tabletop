# Current Stage

## Текущий этап

Этап 12. Заметки, handouts и показ артов.

Статус: выполнено в этом этапе.

## Цель

Дать мастеру панель заметок в кампании: приватные master-only записи, публичные handouts и быстрый показ выбранного handout на player screen.

## Уже реализовано до начала этапа

- Electron + React + TypeScript + Vite scaffold.
- Master/player desktop shell.
- Typed IPC для player screen.
- JSON campaign storage.
- Campaign CRUD.
- Scene creation, active scene switching и scene preview для player screen.
- Local image asset import, tags, search и asset preview.
- Canvas state, layers, grid, viewport, measurements и player projection.
- Object movement, duplicate/hide и master-only token state.
- Simple character cards для players/NPC/monster.
- Manual fog of war для master/player canvas.

## Что можно использовать

- `Campaign.notes`.
- `Note` и `NoteScope`.
- `PlayerScreenState.handoutPreview`.
- `desktopApi.storage.saveCampaign`.
- `desktopApi.playerScreen.updateState`.
- `desktopApi.playerScreen.hide`.
- Browser fallback storage для renderer smoke checks.

## Пробелы этапа

- Вкладка `Заметки` была placeholder без сохранения.
- `Campaign.notes` не имел renderer CRUD pipeline.
- Публичные заметки нельзя было отправить в `PlayerScreenState`.
- Secret notes не имели явной защиты от показа игрокам.

## Что реализовано

- `noteFactory` добавляет гидрацию, создание, обновление, удаление и сортировку заметок.
- Публичная заметка собирается в `PlayerScreenState` с `mode: 'image'` и `handoutPreview.kind: 'handout'`.
- Секретная заметка остается `scope: 'master'` и не отправляется игрокам.
- Удаление активной handout-заметки скрывает текущий player handout в campaign state.
- `useCampaignsStore` сохраняет заметки через существующий JSON pipeline и отправляет handout на player screen.
- Правая панель `Заметки` получила form/list/preview, secret checkbox, show/hide actions и статус текущего handout.
- `PlayerHandoutPreview.id` теперь может ссылаться на asset или note.
- Unit tests покрывают note CRUD, legacy hydration, public handout state и запрет отправки secret notes.

## Критерии готовности

- Заметки создаются, редактируются, удаляются и сохраняются в кампании.
- Публичный handout можно показать на player screen.
- Текущий handout можно скрыть на player screen.
- Secret notes не отправляются игрокам.
- Player state не содержит текст секретных заметок.
- `npm run lint` проходит.
- `npm run typecheck` проходит.
- `npm run test` проходит.
- `npm run dev:renderer` запускается.
- Notes/handout flow проверен в browser route.

## Не входит в этап

- Rich text editor как отдельный продукт.
- Markdown renderer и WYSIWYG.
- Онлайн-шаринг материалов.
- Права доступа для отдельных игроков.
- Drag-and-drop файлов в текст заметки.

## Следующий этап

Этап 13. Combat tracker и инициатива.

Он не начат.

## Риски и меры

- Риск утечки secret notes: `createCampaignWithNoteHandout` бросает `note-is-secret` для `scope: 'master'`, а UI не дает отправить секретную заметку.
- Риск устаревших JSON campaigns: `createCampaignWithHydratedNotes` нормализует старые заметки и привязывает их к текущей кампании.
- Риск смешать note ids и asset ids: `PlayerHandoutPreview.id` принимает оба типа, но `revealedAssetIds` не пополняется note id.
- Риск скрыть не только handout: Stage 12 использует общий `isHidden`, как уже работает player visibility flow.
