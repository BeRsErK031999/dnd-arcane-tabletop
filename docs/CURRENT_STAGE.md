# Current Stage

## Текущий этап

Этап 11. Туман войны.

Статус: выполнено в этом этапе.

## Цель

Дать мастеру ручной fog layer для активной сцены: включение тумана, настройку плотности, закрытие прямоугольных и круглых областей, открытие последней области и очистку тумана с player projection, где скрытые области закрыты черным слоем.

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
- Stage 9 object selection, movement, duplicate/hide and master-only token state.
- Stage 10 simple character cards, NPC/monster kinds and token links.

## Что можно использовать

- `Campaign.characterCards`.
- `CharacterCard`.
- `Scene.canvas.objects`.
- `SceneCanvasObject.assetId`.
- `SceneCanvasObject.isPlayerVisible`.
- `SceneCanvasObject.tokenState`.
- `SceneCanvasState.fog`.
- `PlayerSceneCanvasProjection.fog`.
- `SceneGrid.snapToGrid`.
- `createPlayerSceneCanvasProjection`.
- `desktopApi.storage.saveCampaign`.
- `desktopApi.playerScreen.updateState`.

## Пробелы этапа

- Слой `fog` существовал в canvas layer stack, но был отключенной заглушкой без состояния.
- Мастер не мог закрывать или открывать области карты вручную.
- Player screen получал карту, объекты и измерения без черного fog overlay.
- Старые JSON campaigns не имели поля `canvas.fog`, которое нужно безопасно гидрировать.

## Что реализовано

- `SceneCanvasState` получил `fog` с `enabled`, `opacity` и списком скрытых областей.
- `sceneCanvasFactory` гидрирует legacy scenes, нормализует fog regions и синхронизирует видимость слоя `fog`.
- `sceneToolsFactory` добавляет операции включения/плотности тумана, закрытия rectangle/circle, открытия последней области и очистки тумана.
- `useCampaignsStore` сохраняет fog operations через существующий JSON storage pipeline.
- `SceneCanvas` показывает мастерский полупрозрачный fog overlay и отдельный блок управления туманом.
- `PlayerScreenPlaceholderPage` рисует player fog projection черными областями поверх карты, объектов и измерений.
- `PlayerSceneCanvasProjection.fog` содержит только display-ready regions без мастерских labels.
- Unit tests покрывают fog hydration, projection, active-scene mutations и очистку fog layer.

## Критерии готовности

- Мастер может включить и выключить туман войны.
- Мастер может настроить плотность тумана.
- Мастер может закрыть прямоугольную или круглую область.
- Мастер может открыть последнюю область или очистить весь туман.
- Fog state сохраняется в scene canvas JSON.
- Player screen получает черные fog regions без мастерских labels.
- `npm run lint` проходит.
- `npm run typecheck` проходит.
- `npm run test` проходит.
- `npm run dev` запускается.
- Master/player fog flow проверен в browser route.

## Не входит в этап

- Dynamic lighting.
- Автоматическое зрение токенов.
- Line of sight.
- Полигональные маски и freehand drawing.
- Drag-and-drop редактирование границ fog regions.
- Индивидуальная видимость тумана для разных игроков.

## Следующий этап

Этап 12. Заметки, handouts и показ артов.

Он не начат.

## Риски и меры

- Риск утечки скрытых областей игрокам: player projection получает только координаты черных fog regions без мастерских labels.
- Риск сломать старые JSON campaigns: отсутствующий `canvas.fog` гидрируется в disabled state с пустым списком regions.
- Риск дорогого рендера больших масок: Stage 11 ограничен простыми absolutely positioned regions без сложного mask engine.
- Риск слишком рано перейти к dynamic lighting: Stage 11 не добавляет LOS, vision radius и автоматические источники света.
