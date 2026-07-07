# Current Stage

## Текущий этап

Этап 8. Библиотека ассетов.

Статус: выполнено в этом этапе.

## Цель

Добавить локальную библиотеку карт, токенов, портретов, handouts и прочих изображений с поиском, тегами, preview и быстрым использованием ассета в активной сцене.

## Уже реализовано до начала этапа

- Electron + React + TypeScript + Vite scaffold.
- Master/player desktop shell.
- Typed IPC для player screen.
- JSON campaign storage.
- Campaign CRUD.
- Scene creation, active scene switching и scene preview для player screen.
- Local image asset import and map binding.
- Stage 6 canvas state, layer stack and player-visible canvas projection.
- Stage 7 grid settings, viewport, measurements and player projection.

## Что можно использовать

- `Asset`, `AssetKind`, `ImageAssetKind`.
- `Campaign.assets`.
- `Scene.backgroundAssetId`.
- `Scene.canvas.objects`.
- `desktopApi.assets.importImageAsset`.
- `desktopApi.storage.saveCampaign`.
- `desktopApi.playerScreen.updateState`.

## Пробелы этапа

- Импортированные ассеты не имели тегов.
- Правая панель показывала только плоский список без поиска и фильтров.
- Нельзя было сохранить metadata библиотеки после импорта.
- Существующий map asset нельзя было повторно применить к активной сцене из библиотеки.
- Token/portrait/handout assets нельзя было быстро добавить как объект canvas.
- Player projection не несла display-ready данные ассета внутри canvas object.

## Что реализовано

- `Asset` получил обязательное поле `tags`.
- `ImportImageAssetRequest` поддерживает `tags`.
- `AssetImportService` и browser fallback создают ассеты с нормализованными тегами.
- `assetFactory` добавляет `createAssetLibraryView`, `normalizeAssetTags`, tag mutation и применение ассета к активной сцене.
- Map asset из библиотеки привязывается как `Scene.backgroundAssetId`.
- Non-map image asset добавляется в активную сцену как player-visible canvas object с `assetId`.
- `PlayerSceneCanvasObject` получил embedded `asset` preview для player projection.
- Master canvas и player canvas отрисовывают asset-backed objects с изображением.
- Правая панель получила search, kind filter, tag chips, per-asset tag editor и действия `В сцену`, `Теги`, `Показать`.
- Unit tests покрывают import tags, library filtering, tag save, scene placement и projection asset payload.

## Критерии готовности

- Ассеты можно импортировать с тегами.
- Ассеты можно искать по названию, типу, тегам и original filename.
- Библиотека фильтруется по типу и выбранным тегам.
- Теги ассета сохраняются в campaign JSON state.
- Map asset можно применить к активной сцене как карту.
- Token/portrait/handout/other image asset можно добавить в активную сцену как объект.
- Player screen получает asset-backed canvas object без raw campaign state.
- `npm run lint` проходит.
- `npm run typecheck` проходит.
- `npm run test` проходит.
- `npm run dev` запускается.
- Master/player asset library flow проверен в browser route.

## Не входит в этап

- Полноценный drag-and-drop с координатами указателя.
- Move, duplicate и hide для размещённых объектов.
- Индексация большой библиотеки в отдельном хранилище.
- Marketplace или online catalog.
- Генерация ассетов.
- Audio asset import.

## Следующий этап

Этап 9. Токены и объекты на карте.

Он не начат.

## Риски и меры

- Риск размыть Stage 8 до полноценного token editor: этап добавляет только первичное размещение ассета, а перемещение и управление объектами остаётся Stage 9.
- Риск сломать старые JSON campaigns: фабрики нормализуют отсутствующие `tags` в пустой массив.
- Риск утечки campaign state игрокам: player projection получает только display-ready `asset` на already player-visible canvas objects.
- Риск неудобного поиска: `createAssetLibraryView` фильтрует по name, kind, tags и `metadata.originalFileName`.
