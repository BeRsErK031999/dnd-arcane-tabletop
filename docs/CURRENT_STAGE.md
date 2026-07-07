# Current Stage

## Текущий этап

Этап 4. Сцены и переключение сцен.

Статус: выполнено в этом этапе.

## Цель

Добавить создание сцен внутри открытой кампании, выбор активной сцены, сохранение active scene state в JSON-кампании и отправку preview активной сцены на экран игроков.

## Уже реализовано до начала этапа

- Electron + React + TypeScript + Vite scaffold.
- Master/player desktop shell.
- Typed IPC для player screen.
- Основной Stage 2 layout мастера.
- `StorageService` и `JsonStorageService`.
- Campaign CRUD через `useCampaignsStore`.
- Валидная пустая `Campaign` shape с `combatState` и `playerScreenState`.

## Что можно использовать

- `Campaign.scenes`.
- Shared `Scene` / `SceneGrid` / `SceneId` types.
- `PlayerScreenState.activeSceneId` и `scenePreview`.
- `desktopApi.storage` для сохранения кампании.
- `desktopApi.playerScreen.updateState` для отправки preview.
- Master workspace и scene strip из Stage 2.

## Пробелы этапа

- Scene strip был демонстрационным и не был связан с открытой кампанией.
- Не было фабрики пустой сцены с валидной grid/tokens shape.
- Store не умел создавать сцену, активировать сцену и сохранять это в кампанию.
- Экран игроков мог получать только тестовую scene preview, не сцену из campaign state.
- Browser fallback для player state не повторял поведение main process `updateState`.

## Что реализовано

- `createEmptyScene` с пустыми tokens и базовой grid shape.
- Campaign scene helpers для добавления первой/следующих сцен, переключения active scene и сборки player scene preview.
- `useCampaignsStore` получил операции `createScene`, `activateScene`, `sendActiveSceneToPlayers`.
- Scene strip показывает реальные сцены открытой кампании.
- Первая созданная сцена автоматически становится активной.
- Workspace показывает активную сцену, grid summary, token count и статус синхронизации с player preview.
- Активную сцену можно отправить игрокам через существующий player screen contract.
- Browser fallback player state теперь обновляется через `updateState`, `hide`, `show`, `resetState`.
- Добавлены тесты для scene factory.

## Критерии готовности

- Сцены создаются внутри открытой кампании.
- Первая сцена становится активной автоматически.
- Активную сцену можно переключить из scene strip.
- Active scene state сохраняется в JSON-кампании.
- Player screen получает preview активной сцены через `PlayerScreenState`.
- Canvas, карта, токены и fog of war не реализованы в этом этапе.
- `npm run lint` проходит.
- `npm run typecheck` проходит.
- `npm run test` проходит.
- `npm run dev` запускается.
- Scene flow проверен в browser route.

## Не входит в этап

- Реальная карта сцены.
- Canvas.
- Импорт изображений.
- Asset binding к сцене.
- Создание или перемещение токенов.
- Fog of war.
- Измерения, масштаб, pan и grid editing.
- Карточки персонажей.
- SQLite, PostgreSQL, backend, cloud, online mode.

## Следующий этап

Этап 5. Карты и изображения.

Он не начат. Перед ним нужно отдельно подтвердить переход.

## Риски и меры

- Риск начать canvas раньше времени: Stage 4 хранит только `Scene` metadata, пустые `tokens` и базовую `grid`.
- Риск разойтись с player screen contract: preview строится через существующий `PlayerScreenState.scenePreview`.
- Риск несохраненного active scene state: scene operations всегда сохраняют обновленную кампанию через `desktopApi.storage`.
