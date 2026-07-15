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

### Рабочая область renderer

С этапа 22 master renderer разделён на постоянную сцену и временные функциональные панели:

- `MasterShell` отвечает только за компактную навигацию `Сцены / Ассеты / Бой / Заметки / Игроки` и возврат в библиотеку проектов;
- `MasterDashboardPage` всегда держит сцену смонтированной, поэтому открытие инструмента не сбрасывает canvas, viewport или выбранный объект;
- `Ассеты`, `Бой`, `Заметки` и `Игроки` открываются как overlay drawer поверх сцены, а повторный выбор или `Escape` возвращает пользователя на сцену;
- навигация shell и dashboard синхронизируется renderer-событием `WORKSPACE_NAVIGATION_EVENT`; событие не пересекает preload/IPC boundary и не является persistence contract;
- состояние открытой панели и видимости материалов локально для UI, тогда как выбранный project, active scene и все доменные изменения остаются в `useCampaignsStore`;
- библиотека проектов является единственным владельцем project CRUD. Кнопка возврата сначала сохраняет выбранную кампанию и только затем меняет экран.

На desktop shell занимает фиксированную узкую колонку, а на ширине до 840 px становится горизонтальным dock. Utility drawer на мобильной ширине занимает всю рабочую область. Эти responsive-переходы меняют только представление и не создают отдельное мобильное состояние домена.

### Пользовательские слои сцены

С этапа 23 master workspace показывает три пользовательских режима поверх неизменного технического render stack:

- `Карта` агрегирует `map`, `grid` и `object`;
- `ГМ` соответствует `master` и всегда исключён из player projection;
- `Токены` соответствует `token`;
- `fog` и measurements остаются независимыми overlay-инструментами и не переключаются вместе с пользовательским слоем.

`SceneUserLayerId` является renderer-level режимом редактирования и не сохраняется в `SceneCanvasState`. `sceneCanvasFactory` предоставляет чистый адаптер для mapping, summary, opacity и render order. Поэтому выбор слоя не создаёт campaign mutation, autosave или undo history entry.

`assetFactory` получает выбранный user layer только в момент размещения. На `ГМ` объект получает technical layer `master` и `isPlayerVisible: false`; на `Токены` объект получает layer `token`, token state и размер текущей клетки; `Карта` использует background для map asset либо technical `object` для элемента окружения. Player projection по-прежнему строится только из `player-visible` technical layers и дополнительно сортирует объекты по user-layer order.

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

`ProjectTransferService` в main process записывает формат `campaign.arcane-campaign` версии 2 и сохраняет совместимый импорт версии 1.

Экспорт:

1. Загружает актуальный campaign JSON через `StorageService`.
2. `CampaignExportPlanner` обходит фоны и объекты сцен, токены, портреты, handouts и player projection, затем добавляет ассеты с `exportPolicy: always`.
3. Разрешает `managed`, legacy `file:` и встроенные `data:` источники, проверяет размер/SHA-256 и объединяет одинаковые blob по checksum.
4. Возвращает renderer одноразовый preview token, состав ассетов, число уникальных blob и общий размер.
5. После подтверждения повторно проверяет campaign revision и фактические bytes, строит portable campaign без неиспользуемых ассетов и absolute paths.
6. Записывает package version 2 через temporary file и rename. Manifest разделяет логические asset entries и уникальные blob entries, а payload хранит каждый SHA-256 один раз.

Импорт:

1. Выбирает versioned reader и до записи проверяет format/schema, campaign contract, уникальность id/SHA/path, безопасные относительные пути, base64, размер и checksum всех blob.
2. При конфликте существующего JSON создаёт новый campaign id.
3. Публикует проверенные bytes через `ManagedAssetStore`: существующий SHA-256 переиспользуется, новый устанавливается атомарно.
4. Перепривязывает asset references и campaign id во всех campaign-owned сущностях, сохраняет JSON и синхронизирует campaign bindings.
5. Возвращает отчёт о новых, дедуплицированных, пропущенных и повреждённых blob.
6. При ошибке удаляет неполную кампанию и только созданные unreferenced blob. Version 1 проходит тот же managed-store import path после legacy-валидации.

Preview является частью контракта записи, а не приблизительной оценкой. Token нельзя использовать повторно; изменение кампании, размера или checksum источника после preview возвращает `preview-outdated` и не создаёт пакет.

Renderer не читает файлы напрямую: native dialogs и transfer service доступны только через typed IPC/preload API.

## Целевая гибридная модель ассетов

RoadMap фиксирует три разных уровня, которые нельзя смешивать:

- внешние папки — read-only источник большой пользовательской библиотеки;
- SQLite — перестраиваемый каталог метаданных, превью и тегов, но не blob storage;
- managed store — content-addressed оригиналы по SHA-256, скопированные только при использовании.

Целевой campaign asset reference содержит логический asset id и SHA-256. Absolute source path остаётся свойством записи библиотечного индекса и не является обязательным для открытия кампании. Managed blob физически хранится один раз независимо от числа кампаний, но его удаление допускается только отдельной безопасной garbage-collection операцией после проверки ссылок.

Фоновый indexer живёт в main process/worker boundary, рекурсивно сканирует подключённые папки, строит миниатюры и обновляет SQLite транзакциями. Renderer получает только состояние очереди и страницы результатов для Asset Manager, поэтому большая библиотека не блокирует UI.

Экспорт версии 2 определяет транзитивно используемые сценами, токенами, handouts и player projection ассеты, добавляет явно отмеченные дополнительные файлы и кладёт каждый уникальный SHA-256 в пакет один раз. Package manifest хранит только относительные безопасные пути и checksums; импорт сначала валидирует весь manifest, а затем дедуплицирует файлы в managed store.

### Фундамент этапа 17

`Asset.filePath` временно остаётся обязательным display/runtime URL, чтобы существующий renderer и legacy campaign JSON продолжали работать. Новый необязательный `Asset.storageRef` становится typed источником происхождения ассета:

- `embedded-data` ссылается на существующий `data:` URL в `filePath`, не дублируя base64 в campaign JSON;
- `legacy-file` сохраняет текущий `file:` URL до copy-on-use миграции;
- `managed` хранит SHA-256 и переносимые метаданные без absolute path.

`migrateLegacyCampaignAssetReferences` lossless добавляет `storageRef` и default export policy `when-used` при чтении и записи JSON. Исходный `filePath` при этом не меняется. Новый экспорт версии 2 преобразует выбранные legacy references в переносимые managed references без absolute path. Reader версии 1 сохраняется только для обратной совместимости и после импорта также создаёт managed references.

Main process использует три driver-neutral контракта:

- `AssetIndexService` управляет источниками, индексированными ассетами, поиском и тегами;
- `ManagedAssetStore` кладёт, находит, проверяет и разрешает content-addressed blob;
- `CampaignAssetResolver` превращает campaign reference в runtime `fileUrl` и не позволяет renderer самостоятельно вычислять managed paths.

Физический layout managed store зафиксирован как `objects/<sha[0..2]>/<sha[2..4]>/<sha256>.<ext>`. Это ограничивает число файлов в одной папке и не зависит от исходного имени.

SQLite catalog имеет три последовательные миграции:

1. `asset_library_sources`, `indexed_assets`, `indexed_asset_tags` и поисковые индексы.
2. `managed_asset_blobs`, `campaign_asset_references` и индексы для SHA-256/export policy.
3. scan marker `last_seen_scan_id` для атомарного определения отсутствующих после полного сканирования файлов.

Migration runner включает foreign keys, использует `BEGIN IMMEDIATE`, `PRAGMA user_version`, отдельную транзакцию на версию и rollback при ошибке. С этапа 18 каталог работает через `sql.js`: это сохраняет один SQLite-файл без native addon и отдельной ABI-сборки под Node и Electron.

### Реализация этапа 20

`FileSystemManagedAssetStore` хранит оригиналы под каталогом приложения в `managed-store/objects`. Операция `put` сериализована внутри процесса и выполняет следующий протокол:

1. Проверяет входной SHA-256, размер, MIME и абсолютный source path.
2. Если зарегистрированный blob существует и проходит checksum-проверку, возвращает его без чтения внешнего источника.
3. Иначе копирует источник в уникальный файл `staging`, повторно вычисляет размер и SHA-256 и только затем устанавливает blob через `rename`.
4. Повреждённый target временно отводится в backup и восстанавливается при ошибке установки.
5. Метаданные публикуются в `managed_asset_blobs` после успешной файловой операции.

Выбор ассета и прямой импорт сначала создают managed blob и предварительную campaign binding. Последующее сохранение campaign JSON заменяет полный набор ссылок кампании. Загрузка JSON разрешает каждый `managed` reference в локальный runtime `fileUrl`; исходный путь индексированной библиотеки для этого не нужен.

Garbage collection не запускается автоматически. Asset Manager сначала получает одноразовый preview token со списком unreferenced blobs, затем после подтверждения передаёт token на выполнение. Перед физическим удалением каждого файла SQLite ещё раз атомарно проверяет отсутствие ссылок; появившийся после preview reference приводит к пропуску, а не к удалению.

## Почему нельзя размазывать управление player window

Если open/close/fullscreen/state будут жить в разных React-компонентах и строковых IPC-вызовах, появятся риски:

- несколько player windows;
- потеря последнего состояния;
- разные компоненты будут спорить за fullscreen;
- закрытое окно начнет получать события;
- IPC channel names разойдутся между main, preload и renderer.

Поэтому Stage 1 закрепляет правило: renderer вызывает только preload API, preload вызывает централизованные IPC channels, main process делегирует player flow одному controller.
