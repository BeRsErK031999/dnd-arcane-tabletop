# Current Stage

## Текущий этап

Этап 7. Сетка, масштаб и измерения.

Статус: выполнено в этом этапе.

## Цель

Добавить управляемые настройки сетки сцены, viewport для pan/zoom и простые измерения, которые сохраняются в `Scene.canvas` и попадают в player-visible projection без master-only данных.

## Уже реализовано до начала этапа

- Electron + React + TypeScript + Vite scaffold.
- Master/player desktop shell.
- Typed IPC для player screen.
- JSON campaign storage.
- Campaign CRUD.
- Scene creation, active scene switching и scene preview для player screen.
- Local image asset import and map binding.
- Stage 6 canvas state, layer stack and player-visible canvas projection.

## Что можно использовать

- `Scene`, `SceneGrid`, `SceneCanvasState`, `PlayerSceneCanvasProjection`.
- `desktopApi.storage.saveCampaign`.
- `desktopApi.playerScreen.updateState`.
- `Campaign.scenes`, `Campaign.assets`.
- `Scene.backgroundAssetId`.
- `Scene.canvas.viewport`, `Scene.canvas.measurements`.

## Пробелы этапа

- Grid settings хранили только базовые `enabled`, `size`, `color`, `opacity`.
- Canvas не имел сохраненного viewport для pan/zoom.
- Master UI не давал менять размер клетки, дистанцию, единицы измерения или snap-to-grid.
- У сцены не было typed measurements и area templates.
- Player scene mode не отрисовывал viewport transform и измерения.
- Browser fallback копировал `sceneCanvas` без новых вложенных полей.

## Что реализовано

- `SceneGrid` расширен полями `distancePerCell`, `unitLabel`, `snapToGrid`.
- `SceneCanvasState` получил `viewport` и `measurements`.
- `PlayerSceneCanvasProjection` получил `viewport`, расширенный grid projection и отфильтрованные player-visible measurements.
- `sceneCanvasFactory` гидрирует legacy canvas, нормализует viewport/measurements, добавляет ruler/circle/cone/square templates и форматирует distance labels.
- `sceneToolsFactory` добавляет mutation-фабрики для активной сцены: grid, viewport, add measurement, clear measurements.
- `useCampaignsStore` сохраняет Stage 7 операции через существующий JSON storage flow.
- `SceneCanvas` получил панель настроек сетки, zoom/pan controls и кнопки измерений.
- Player screen применяет canvas viewport transform и отрисовывает measurement layer.
- Browser fallback state clone копирует `viewport` и `measurements`.
- Добавлены unit tests для Stage 7 defaults, projection filtering, scene tools mutations и legacy hydration.

## Критерии готовности

- Сетка масштабируется и панорамируется вместе с картой.
- Настройки grid сохраняются в активной сцене.
- Snap-to-grid участвует в создании шаблонных измерений.
- Ruler и area templates отображаются мастеру.
- Player projection получает только player-visible measurements.
- Player screen показывает тот же viewport и measurement layer.
- Legacy scenes без новых полей гидрируются без падения.
- `npm run lint` проходит.
- `npm run typecheck` проходит.
- `npm run test` проходит.
- `npm run dev` запускается.
- Master/player canvas flow проверен в browser route.

## Не входит в этап

- Drag-and-drop и ручное редактирование measurement endpoints.
- Продвинутые D&D rules calculations.
- Hex или isometric grid.
- Token placement tools.
- Fog of war logic.
- Undo/redo для операций canvas.

## Следующий этап

Этап 8. Библиотека ассетов.

Он не начат.

## Риски и меры

- Риск несинхронности master/player viewport: viewport хранится в canvas state и включен в player projection.
- Риск утечки master-only данных: projection продолжает фильтровать layers, objects и measurements по player-visible контракту.
- Риск сломать старые JSON campaigns: canvas/grid гидрация добавляет безопасные defaults при чтении и перед сценическими мутациями.
- Риск неконтролируемых значений zoom/grid: фабрики clamp'ят zoom, pan, grid size, opacity и distance.
