# Current Stage

## Текущий этап

Этап 5. Карты и изображения.

Статус: выполнено в этом этапе.

## Цель

Добавить импорт PNG/JPG/JPEG/WEBP/JFIF изображений, копирование выбранного файла в папку assets кампании, создание typed `Asset` записи, привязку map asset к активной сцене и показ импортированного изображения игрокам через `PlayerScreenState`.

## Уже реализовано до начала этапа

- Electron + React + TypeScript + Vite scaffold.
- Master/player desktop shell.
- Typed IPC для player screen.
- JSON campaign storage.
- Campaign CRUD.
- Scene creation, active scene switching и scene preview для player screen.
- Shared `Asset` type уже входил в `Campaign.assets`.

## Что можно использовать

- `Asset`, `AssetKind`, `PlayerHandoutPreview`.
- `desktopApi.storage.saveCampaign`.
- `desktopApi.playerScreen.updateState`.
- `Campaign.assets`.
- `Scene.backgroundAssetId`.
- `data/campaigns/<campaignId>/assets` для development asset copies.

## Пробелы этапа

- Не было native image picker IPC.
- Main process не копировал изображения в campaign asset folder.
- Renderer не мог добавить imported asset в открытую кампанию.
- Активная сцена не могла получить map asset.
- Player screen image mode показывал только тестовый handout.
- Browser fallback не позволял проверить asset flow без Electron dialog.

## Что реализовано

- `AssetImportService` в main process для выбора/копирования поддерживаемых изображений.
- IPC/preload contract `desktopApi.assets.importImageAsset`.
- `ImportImageAssetRequest` / `ImportImageAssetResult` shared-типы.
- Renderer `assetFactory` для добавления imported asset в кампанию и сборки player image preview.
- Map asset автоматически привязывается к активной сцене через `backgroundAssetId`.
- Assets panel в правой панели мастера: тип, имя, импорт, список изображений и показ игрокам.
- Workspace активной сцены показывает связанную карту.
- Browser fallback создает demo image asset с data URL для проверки renderer route.
- Тесты для `AssetImportService` и `assetFactory`.

## Критерии готовности

- Поддерживаемые изображения импортируются через native desktop dialog.
- Файл копируется в campaign asset folder.
- В кампании создается typed `Asset`.
- Map asset привязывается к активной сцене.
- Импортированное изображение видно в assets panel и workspace preview.
- Игрокам можно отправить imported image preview.
- Canvas layers, токены и image editing не реализованы в этом этапе.
- `npm run lint` проходит.
- `npm run typecheck` проходит.
- `npm run test` проходит.
- `npm run dev` запускается.
- Asset flow проверен в browser route.

## Не входит в этап

- Canvas rendering карты как редактируемого слоя.
- Drag-and-drop assets.
- Token art library.
- Редактирование изображений.
- Масштаб, pan, grid calibration.
- Fog of war.
- Online asset catalog.
- Marketplace.

## Следующий этап

Этап 6. Canvas / слои сцены.

Он не начат. Перед ним нужно отдельно подтвердить переход.

## Риски и меры

- Риск хранить внешние пути вместо локальных копий: main process копирует файл в папку assets кампании и сохраняет `file://` URL.
- Риск смешать asset import с canvas: Stage 5 только импортирует и показывает preview, без canvas state.
- Риск невозможности проверить Electron dialog в браузере: browser fallback возвращает demo data URL asset для renderer smoke.
