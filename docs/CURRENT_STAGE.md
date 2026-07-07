# Current Stage

## Текущий этап

Этап 9. Токены и объекты на карте.

Статус: выполнено в этом этапе.

## Цель

Дать мастеру базовое управление размещенными объектами активной сцены: выбор объекта на canvas, перемещение по сетке, дублирование, скрытие от игроков и простую карточку токена с HP, AC и заметкой.

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
- Stage 8 asset library, tags, search, asset preview and asset-backed canvas objects.

## Что можно использовать

- `Scene.canvas.objects`.
- `SceneCanvasObject.assetId`.
- `SceneCanvasObject.isPlayerVisible`.
- `SceneGrid.snapToGrid`.
- `createPlayerSceneCanvasProjection`.
- `desktopApi.storage.saveCampaign`.
- `desktopApi.playerScreen.updateState`.

## Пробелы этапа

- Размещенные объекты нельзя было выбрать и управлять ими из canvas UI.
- Token/portrait/handout объекты можно было добавить в сцену, но нельзя было перемещать, дублировать или скрывать.
- У токенов не было простого мастерского состояния HP/AC/заметки.
- Player projection не имела теста, который защищает от утечки мастерского `tokenState`.

## Что реализовано

- `SceneCanvasObject` получил опциональное поле `tokenState`.
- `sceneCanvasFactory` нормализует token state и не включает его в `PlayerSceneCanvasProjection`.
- `sceneToolsFactory` добавляет операции move, duplicate, visibility и token state update для объекта активной сцены.
- `useCampaignsStore` сохраняет объектные операции через существующий JSON storage pipeline.
- `MasterDashboardPage` хранит выбранный объект, выбирает новый объект после добавления ассета в сцену и показывает Stage 9 metadata.
- `SceneCanvas` получил кликабельные объекты, selected outline, список объектов, кнопки перемещения, duplicate/hide и форму HP/AC/заметки для токенов.
- Player screen продолжает получать только player-visible объекты без raw campaign state и без мастерской карточки токена.
- Unit tests покрывают перемещение со snap, дублирование, видимость, нормализацию token state и отсутствие `tokenState` в player projection.

## Критерии готовности

- Объект на master canvas можно выбрать кликом.
- Выбранный объект можно переместить вверх/вниз/влево/вправо с учетом snap-to-grid.
- Выбранный объект можно дублировать.
- Выбранный объект можно скрыть от игроков и снова показать.
- Token object хранит HP, AC и заметку в campaign JSON state.
- Игрокам видны только разрешенные объекты.
- Player projection не содержит `tokenState`.
- `npm run lint` проходит.
- `npm run typecheck` проходит.
- `npm run test` проходит.
- `npm run dev` запускается.
- Master/player object flow проверен в browser route.

## Не входит в этап

- Полноценный character sheet.
- Автоматические атаки, заклинания и D&D rules engine.
- Связь token state с отдельной карточкой персонажа.
- Drag-and-drop перемещение мышью.
- Multi-select и массовые операции.
- Fog of war.

## Следующий этап

Этап 10. Карточки персонажей, NPC и монстров.

Он не начат.

## Риски и меры

- Риск утечки мастерских заметок игрокам: `tokenState` остается только в `SceneCanvasObject` и не попадает в `PlayerSceneCanvasProjection`.
- Риск рассинхронизации координат: перемещение идет через фабрику и использует `snapCanvasValue`, clamp и размеры canvas.
- Риск сломать старые JSON campaigns: отсутствующий `tokenState` нормализуется как `undefined`.
- Риск слишком рано перейти к character sheet: Stage 9 ограничен HP/AC/заметкой без rules automation.
