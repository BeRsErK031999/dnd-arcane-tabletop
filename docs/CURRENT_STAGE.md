# Current Stage

## Текущий этап

Этап 6. Canvas / слои сцены.

Статус: выполнено в этом этапе.

## Цель

Добавить основу canvas для сцены: typed canvas state, слои карты/сетки/объектов/токенов/master-only/fog, отображение активной сцены в master workspace и безопасную player-visible projection без утечки master-only данных.

## Уже реализовано до начала этапа

- Electron + React + TypeScript + Vite scaffold.
- Master/player desktop shell.
- Typed IPC для player screen.
- JSON campaign storage.
- Campaign CRUD.
- Scene creation, active scene switching и scene preview для player screen.
- Local image asset import.
- Map asset binding через `Scene.backgroundAssetId`.

## Что можно использовать

- `Scene`, `SceneGrid`, `Asset`.
- `PlayerScreenState.scenePreview`.
- `desktopApi.storage.saveCampaign`.
- `desktopApi.playerScreen.updateState`.
- `Campaign.scenes`, `Campaign.assets`.
- `Scene.backgroundAssetId`.

## Пробелы этапа

- У сцены не было отдельного canvas state.
- Master workspace показывал карточку-превью, а не слойную рабочую поверхность.
- Player scene mode получал только текстовый `scenePreview`, без canvas projection.
- Не было явной границы между `master-only` и `player-visible` слоями.
- Старые JSON-сцены не имели поля `canvas`.

## Что реализовано

- Shared-типы `SceneCanvasState`, `SceneCanvasLayer`, `SceneCanvasObject` и `PlayerSceneCanvasProjection`.
- Поле `Scene.canvas` с дефолтными слоями: `map`, `grid`, `object`, `token`, `master`, `fog`.
- `sceneCanvasFactory` для создания canvas, гидрации legacy-сцен, сводки слоев и player projection.
- Player projection фильтрует `master-only` и `disabled` слои, а также объекты с `isPlayerVisible: false`.
- `sceneFactory` создает новые сцены с canvas и добавляет `sceneCanvas` в `PlayerScreenState` при отправке сцены игрокам.
- `useCampaignsStore` гидрирует старые сцены при открытии кампании.
- `SceneCanvas` в master workspace показывает карту, сетку, объекты, метрики и стек слоев.
- Player screen отрисовывает `sceneCanvas` projection в режиме `scene`.
- Тесты для canvas defaults, legacy hydration и фильтрации master-only данных.

## Критерии готовности

- Canvas стабильно отображает активную сцену в master workspace.
- Карта, если она привязана к активной сцене, используется как нижний слой canvas.
- Сетка отображается как отдельный overlay.
- Слои сцены видны в master UI и имеют typed visibility.
- `master-only` и `disabled` слои не попадают в player projection.
- Существующие кампании без `Scene.canvas` гидрируются без падения.
- Player screen в режиме `scene` умеет отрисовывать `sceneCanvas`.
- `npm run lint` проходит.
- `npm run typecheck` проходит.
- `npm run test` проходит.
- `npm run dev` запускается.
- Master/player canvas flow проверен в browser route.

## Не входит в этап

- Pan/zoom.
- Snap-to-grid.
- Редактирование grid settings.
- Drag-and-drop объектов.
- Реальные token placement tools.
- Полная fog of war логика.
- Измерения и area templates.
- Автоматизация правил D&D.

## Следующий этап

Этап 7. Сетка, масштаб и измерения.

Он не начат.

## Риски и меры

- Риск преждевременно усложнить canvas state: Stage 6 хранит только базовые размеры, слои и позиционируемые объекты.
- Риск утечки master-only данных игрокам: projection строится отдельной функцией и покрыта тестом.
- Риск сломать старые campaign JSON: legacy-сцены гидрируются при чтении и перед сценическими мутациями.
