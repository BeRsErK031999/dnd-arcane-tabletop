# Architecture

## Общая модель

D&D Arcane Tabletop - локальное desktop-приложение. Оно состоит из Electron main process, secure preload bridge, React renderer и shared contracts.

Проект не использует backend, аккаунты, cloud sync, online player connections или PostgreSQL. Кампании сейчас сохраняются в JSON; SQLite запланирован только как локальный перестраиваемый индекс общей библиотеки ассетов.

## Main Process

Main process отвечает за desktop-обязанности:

- создание `BrowserWindow`;
- регистрацию IPC handlers;
- доступ к локальному storage layer;
- управление player window;
- хранение последнего `PlayerScreenState` в памяти на этапе 1.

Main process не должен содержать React UI-логику. Renderer не должен напрямую управлять Electron API.

## Master Window

Master window - основное окно мастера. Оно загружает renderer route `/?screen=master`.

Задачи master window:

- показывать master UI;
- вызывать методы preload `DesktopApi`;
- быть источником команд для player screen;
- отправлять typed player screen state через IPC.

Master window не должен напрямую создавать `BrowserWindow` и не должен импортировать Electron API.

## Player Window

Player window - отдельное Electron-окно для второго монитора, телевизора или проектора. Оно загружает renderer route `/?screen=player`.

Задачи player window:

- отображать полученный `PlayerScreenState`;
- поддерживать режимы `blank`, `scene`, `image`, `split`;
- показывать скрытый экран при `isHidden = true`;
- не показывать инструменты мастера;
- быть пригодным для fullscreen.

Player window является display-only слоем. Он не принимает пользовательское управление сценой.

## Preload

Preload предоставляет безопасный API через `contextBridge`.

Master renderer получает методы:

- `playerScreen.open`;
- `playerScreen.close`;
- `playerScreen.focus`;
- `playerScreen.setFullscreen`;
- `playerScreen.toggleFullscreen`;
- `playerScreen.getStatus`;
- `playerScreen.getState`;
- `playerScreen.updateState`;
- `playerScreen.resetState`;
- `playerScreen.hide`;
- `playerScreen.show`.

Player renderer получает методы:

- `playerScreen.getState`;
- `playerScreen.onStateUpdated`.

Renderer не получает прямой доступ к Node.js и Electron modules.

## Shared Types

Shared-типы находятся в `src/shared/types`.

`PlayerScreenState` должен быть единым объектом, потому что player screen отображает snapshot состояния, а не набор несвязанных команд. Это упрощает:

- повторное открытие player window;
- reset state;
- скрытие и повторный показ;
- будущую сериализацию состояния в campaign JSON;
- тестирование контракта master -> main -> player.

На этапе 1 `PlayerScreenState` содержит:

- `mode`;
- `isHidden`;
- `title`;
- `message`;
- `scenePreview`;
- `sceneCanvas`;
- `handoutPreview`;
- `initiativeVisible`;
- `updatedAt`;
- будущие связи с campaign, scene, token и asset ids.

На этапе 6 `Scene` получает `canvas` как typed state рабочей поверхности. Canvas state хранит размер сцены, стек слоев и позиционируемые объекты. Слои имеют visibility:

- `player-visible`;
- `master-only`;
- `disabled`.

Player window не получает raw `Scene.canvas`. Master renderer строит `PlayerSceneCanvasProjection`, в которую попадают только `player-visible` слои и объекты с `isPlayerVisible = true`. Это сохраняет границу между заметками/слоем мастера и тем, что видят игроки.

На этапе 7 canvas state дополнительно хранит `viewport` и `measurements`, а `SceneGrid` хранит игровые параметры сетки: `distancePerCell`, `unitLabel` и `snapToGrid`. Эти поля нормализуются фабриками перед сохранением и входят в `PlayerSceneCanvasProjection` только как display-ready данные. Измерения фильтруются по `isPlayerVisible`, поэтому player window получает ruler/area overlays без master-only записей.

На этапе 8 `Asset` хранит локальные library tags, а renderer строит фильтрованное представление через `createAssetLibraryView`. Использование ассета в сцене не передает raw campaign data игрокам: canvas object хранит `assetId`, а `PlayerSceneCanvasProjection` добавляет только embedded preview `{ id, name, filePath }` для объектов, которые уже прошли `player-visible` фильтр.

На этапе 9 управление размещенными объектами остается в renderer store/factory слое. `SceneCanvasObject` может хранить мастерское `tokenState` с HP, AC и заметкой, но `PlayerSceneCanvasProjection` не включает это поле. Move, duplicate, hide/show и token state update проходят через `sceneToolsFactory`, поэтому координаты нормализуются с учетом grid snap/clamp, а player window получает только display-ready объекты, разрешенные через `isPlayerVisible`.

На этапе 10 `CharacterCard` остается простой campaign-сущностью для player/NPC/monster без rules engine. Renderer хранит операции создания, обновления, удаления и гидрации в `characterCardFactory`, а `useCampaignsStore` сохраняет их через существующий JSON pipeline. Связь с размещенным токеном хранится в `SceneCanvasObject.tokenState.characterCardId`, остается master-only и очищается при удалении карточки. `PlayerSceneCanvasProjection` не получает raw `tokenState`, поэтому карточки, заметки и служебные ссылки не раскрываются player window.

На этапе 11 fog of war хранится внутри `SceneCanvasState.fog`, а не в отдельном runtime-only состоянии. Fog содержит включение, плотность и простые rectangle/circle regions, которые renderer сохраняет через `sceneToolsFactory` и `useCampaignsStore`. Master canvas рисует эти regions полупрозрачно, а player screen получает только `PlayerSceneCanvasProjection.fog` с display-ready координатами без мастерских labels и рисует их черным overlay. Stage 11 не добавляет dynamic lighting, line of sight или автоматическое зрение токенов.

На этапе 12 `Note` хранится в `Campaign.notes` как JSON-сущность кампании. `scope: 'master'` остается master-only и не может быть отправлен игрокам через `createCampaignWithNoteHandout`; `scope: 'players'` превращается в display-ready `PlayerScreenState.handoutPreview` с `kind: 'handout'`. Player screen получает только публичный snapshot заголовка и текста handout, без доступа к полному массиву заметок кампании.

На этапе 13 `CombatState` хранит ручной tracker инициативы в campaign JSON. Renderer управляет участниками, раундами и текущим ходом через `combatFactory`, а player screen получает только `PlayerInitiativeTracker`: имя, инициативу, флаги active/player/defeated и номер раунда. `tokenId`, `characterCardId`, HP, AC и любые master-only заметки остаются в master/campaign слое и не входят в public projection.

## IPC

IPC channel names хранятся централизованно в `src/shared/constants/ipc.ts`.

Player screen channels используют группу `player:*`:

- `player:open`;
- `player:close`;
- `player:focus`;
- `player:fullscreen:set`;
- `player:fullscreen:toggle`;
- `player:status:get`;
- `player:status:changed`;
- `player:state:get`;
- `player:state:update`;
- `player:state:reset`;
- `player:state:changed`;
- `player:visibility:hide`;
- `player:visibility:show`.

Renderer не должен использовать строковые IPC channel names напрямую. Он работает только через preload `DesktopApi`.

## PlayerScreenController

`PlayerScreenController` в main process является владельцем player window control flow.

Он отвечает за:

- live-ссылку на player `BrowserWindow`;
- создание player window;
- фокусировку существующего window вместо создания второго;
- закрытие window;
- fullscreen state;
- последнее `PlayerScreenState`;
- отправку state в player renderer;
- broadcast status updates в renderer windows;
- graceful handling закрытого или уничтоженного window.

Такое разделение не размазывает управление player window по разным React-компонентам, IPC handlers и window factory.

## Передача Состояния Master -> Player

Поток данных:

1. Master renderer создает новый `PlayerScreenState`.
2. Master renderer вызывает `desktopApi.playerScreen.updateState(state)`.
3. Preload отправляет typed payload в main process через IPC.
4. `PlayerScreenController` сохраняет состояние в памяти.
5. Controller отправляет `player:state:changed` в live player window.
6. Player renderer обновляет React state и перерисовывает экран.
7. Если player window было закрыто, состояние остается в main process.
8. При повторном открытии player renderer запрашивает `player:state:get` и получает последний snapshot.

## Storage Layer

Storage layer находится в `src/main/storage`.

`StorageService` остается заменяемым контрактом. `JsonStorageService` сейчас хранит кампании в JSON-файлах. Stage 1 не должен добавлять SQLite или менять persistence stack.

На будущих этапах campaign persistence сможет хранить `playerScreenState`, активные сцены, ассеты, заметки и combat state. Управление player window при этом останется desktop-обязанностью main process.

На этапе 14 контур сохранности разделен между renderer и main process. `useCampaignsStore` остается точкой входа для campaign mutations, ведет `CampaignSaveState`, ставит dirty state, запускает debounced autosave через 3.5 секунды после изменения selected campaign и держит ограниченную undo/redo историю в памяти renderer. `JsonStorageService` перед каждой перезаписью campaign JSON переносит предыдущие версии в `data/campaigns/.backups` и хранит только `backup-1` / `backup-2`, поэтому backup-файлы не попадают в `listCampaigns`. Это не меняет `StorageService`: backup rotation является деталью JSON-реализации.

На этапе 15 React entrypoint обернут в `AppErrorBoundary`, чтобы renderer при runtime error показывал контролируемый fallback вместо пустого окна. Горячие клавиши master UI остаются renderer-level поведением: `Ctrl+S` вызывает сохранение выбранной кампании, `Ctrl+Z` / `Ctrl+Y` используют историю `useCampaignsStore`, но campaign undo/redo не перехватывает события внутри редактируемых полей.

## Перенос проектов

`ProjectTransferService` в main process реализует первый versioned формат `campaign.arcane-campaign`.

Экспорт:

1. Загружает актуальный campaign JSON через `StorageService`.
2. Читает прикреплённые локальные `file:` ассеты, вычисляет SHA-256 и заменяет absolute paths внутренними `arcane-project-asset:` ссылками.
3. Сохраняет встроенные `data:` ассеты непосредственно в JSON кампании.
4. Записывает пакет через temporary file и rename.

Импорт:

1. Проверяет format/version, минимальный campaign contract, безопасные имена, base64 и SHA-256.
2. При конфликте существующего JSON или папки создаёт новый campaign id.
3. Пишет файлы в staging directory и только затем подключает папку ассетов.
4. Перепривязывает пути и campaign id во всех campaign-owned сущностях.
5. При ошибке удаляет staging и неполные результаты.

Renderer не читает файлы напрямую: native dialogs и transfer service доступны только через typed IPC/preload API.

## Целевая гибридная модель ассетов

RoadMap фиксирует три разных уровня, которые нельзя смешивать:

- внешние папки — read-only источник большой пользовательской библиотеки;
- SQLite — перестраиваемый каталог метаданных, превью и тегов, но не blob storage;
- managed store — content-addressed оригиналы по SHA-256, скопированные только при использовании.

Целевой campaign asset reference содержит логический asset id и SHA-256. Absolute source path остаётся свойством записи библиотечного индекса и не является обязательным для открытия кампании. Managed blob физически хранится один раз независимо от числа кампаний, но его удаление допускается только отдельной безопасной garbage-collection операцией после проверки ссылок.

Фоновый indexer живёт в main process/worker boundary, рекурсивно сканирует подключённые папки, строит миниатюры и обновляет SQLite транзакциями. Renderer получает только состояние очереди и страницы результатов для Asset Manager, поэтому большая библиотека не блокирует UI.

Развитый экспорт определяет транзитивно используемые сценами, токенами, handouts и player projection ассеты, добавляет явно отмеченные дополнительные файлы и кладёт каждый уникальный SHA-256 в пакет один раз. Package manifest хранит только относительные безопасные пути и checksums; импорт сначала валидирует весь manifest, а затем дедуплицирует файлы в managed store.

## Почему нельзя размазывать управление player window

Если open/close/fullscreen/state будут жить в разных React-компонентах и строковых IPC-вызовах, появятся риски:

- несколько player windows;
- потеря последнего состояния;
- разные компоненты будут спорить за fullscreen;
- закрытое окно начнет получать события;
- IPC channel names разойдутся между main, preload и renderer.

Поэтому Stage 1 закрепляет правило: renderer вызывает только preload API, preload вызывает централизованные IPC channels, main process делегирует player flow одному controller.
