# Current Stage

## Текущий этап

Этап 3. JSON-хранение кампаний.

Статус: выполнено в этом этапе.

## Цель

Реализовать создание, открытие, сохранение и удаление кампаний через существующий `StorageService` и JSON-файлы, не добавляя SQLite, backend или реальные игровые сущности следующих этапов.

## Уже реализовано до начала этапа

- Electron + React + TypeScript + Vite scaffold.
- Master/player desktop shell.
- Typed IPC для player screen.
- Основной Stage 2 layout мастера.
- `StorageService` и `JsonStorageService`.
- Storage IPC и preload API для `list/load/save/delete`.

## Что можно использовать

- `desktopApi.storage`.
- `useCampaignsStore`.
- Shared `Campaign` / `CampaignSummary` types.
- `data/campaigns` для development JSON-файлов.
- `JsonStorageService` tests как гарантию безопасного чтения/записи.

## Пробелы этапа

- Renderer store умел только читать список кампаний.
- Не было фабрики пустой кампании с валидным domain shape.
- Master UI не мог создать, открыть, сохранить или удалить кампанию.
- Browser fallback API не позволял проверить campaign flow в Vite route.

## Что реализовано

- `createEmptyCampaign` для валидной пустой кампании.
- Обновление метаданных открытой кампании без изменения будущих scene/assets данных.
- `useCampaignsStore` с операциями `createCampaign`, `openCampaign`, `saveSelectedCampaign`, `deleteSelectedCampaign`.
- In-memory browser fallback storage для проверки renderer route без записи в repo.
- Campaign manager в master workspace: форма создания, открытая кампания, сохранение, удаление и список JSON-файлов.
- Тесты для campaign factory.

## Критерии готовности

- Кампания создается и сохраняется через storage API.
- Список кампаний обновляется после создания, сохранения и удаления.
- Кампанию можно открыть из списка.
- Метаданные открытой кампании можно сохранить.
- Пустая кампания содержит валидные `combatState` и `playerScreenState`.
- Невалидные и небезопасные имена файлов по-прежнему покрыты storage tests.
- Storage остается заменяемым через `StorageService`.
- `npm run lint` проходит.
- `npm run typecheck` проходит.
- `npm run test` проходит.
- `npm run dev` запускается.
- Campaign flow проверен в browser route.

## Не входит в этап

- Создание реальных сцен.
- Активная сцена и переключение сцен.
- Импорт изображений и asset library.
- Canvas.
- Токены.
- Fog of war.
- Карточки персонажей.
- SQLite, PostgreSQL, backend, cloud, online mode.

## Следующий этап

Этап 4. Сцены и переключение сцен.

Он не начат. Перед ним нужно отдельно подтвердить переход.

## Риски и меры

- Риск связать renderer с JSON-форматом: renderer работает через `desktopApi.storage`, а JSON остается деталью `JsonStorageService`.
- Риск начать Stage 4 раньше времени: campaign factory создает пустые массивы сцен/ассетов/персонажей без UI редактирования.
- Риск оставлять тестовые campaign files в repo: browser verification использует in-memory fallback, а storage tests используют temp directories.
