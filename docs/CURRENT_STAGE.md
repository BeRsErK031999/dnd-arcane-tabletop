# Current Stage

## Текущий этап

Этап 15. Полировка и exe-сборка.

Статус: выполнено в этом этапе.

## Цель

Довести приложение до финального локального desktop-среза: добавить базовую устойчивость renderer, горячие клавиши для основных операций мастера, пользовательскую инструкцию и проверить production build / Windows installer.

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
- Notes panel, secret notes и публичные handouts.
- Manual combat tracker и public initiative overlay.
- Autosave status, undo/redo и две backup-копии JSON.

## Что можно использовать

- `electron-builder` и `npm run dist:win`.
- `AppErrorBoundary` как renderer fallback.
- `useCampaignsStore` для save/undo/redo.
- `docs/USER_GUIDE.md` как пользовательскую инструкцию.

## Пробелы этапа

- Renderer не имел error boundary и мог показывать пустой экран при runtime error.
- Keyboard shortcuts для save/undo/redo не были подключены на уровне master UI.
- README не ссылался на фактическую пользовательскую инструкцию.
- Финальный этап еще не фиксировал production build и Windows installer как проверку.

## Что реализовано

- Добавлен `AppErrorBoundary` вокруг React-приложения с понятным fallback и кнопкой перезагрузки интерфейса.
- Master UI получил document-level shortcuts: `Ctrl+S`, `Ctrl+Z`, `Ctrl+Y` и `Ctrl+Shift+Z`.
- `Ctrl+Z` не перехватывается, когда фокус находится в input, textarea, select или contenteditable.
- Undo/Redo кнопки получили shortcut hints через `title`.
- Добавлен `docs/USER_GUIDE.md` с фактическими сценариями кампаний, autosave, player screen, ассетов, заметок, инициативы и сборки installer.
- README ссылается на user guide и обновляет local verification checklist.
- Roadmap и architecture docs фиксируют финальный Stage 15.

## Критерии готовности

- `npm run lint` проходит.
- `npm run typecheck` проходит.
- `npm run test` проходит.
- `npm run build` проходит.
- `npm run dist:win` собирает Windows installer через локальный `node_modules/electron/dist`.
- Master route проверен в browser smoke.
- Документация пользователя соответствует текущему UI.

## Не входит в этап

- Mobile, web или marketplace.
- Онлайн-сервисы.
- Новая система тем поверх текущего рабочего оформления.
- Новые игровые mechanics после Stage 14.

## Следующий этап

Финальный roadmap-срез выполнен. Следующие задачи можно выбирать отдельно: расширение игровых инструментов, полноценный recovery UI для backup, импорт/экспорт кампаний или релизная QA-процедура.

## Риски и меры

- Риск пустого renderer-экрана: error boundary показывает fallback с перезагрузкой.
- Риск конфликтов shortcuts с редактированием текста: campaign undo/redo не перехватывает редактируемые элементы.
- Риск устаревшей инструкции: user guide описывает текущие кнопки, маршруты и команды.
- Риск installer-проблем: Stage 15 требует фактического запуска `npm run dist:win`; сборка использует локальный Electron dist и не перекачивает Electron на шаге packaging.
