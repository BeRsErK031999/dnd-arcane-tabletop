# Roadmap

## Актуальный продуктовый план по `TRP game builder.docx`

Источник требований: Word-документ `TRP game builder.docx`, полученный 2026-07-15. Текст и 12 встроенных макетов сопоставлены с текущим приложением. Этапы 0-15 ниже остаются архивом уже созданного технического фундамента; текущая работа ведётся по этапам 16-27.

### Что уже есть и используется повторно

- Electron master/player windows и typed IPC.
- JSON-хранение кампаний, создание, открытие, сохранение и удаление.
- Сцены, карты, ассеты, canvas, сетка, токены, master-only данные, fog, заметки и инициатива.
- Player projection, autosave, undo/redo, backup и Windows installer.

### Главные расхождения с Word

- Приложение сразу открывало техническую рабочую панель вместо отдельного стартового экрана проектов.
- Список кампаний не был визуальной библиотекой с превью и явным выбранным состоянием.
- Базовый переносимый import/export уже добавлен, но общая индексируемая библиотека и content-addressed хранилище ассетов ещё не реализованы.
- Структура слоёв в коде шире требуемых трёх пользовательских режимов `Карта / ГМ / Токены`; нет простого переключателя активного слоя по макету.
- Master и player сейчас используют одну canvas viewport-проекцию, хотя Word требует независимый масштаб.
- Управление player window существует, но не собрано в компактный раскрывающийся блок `ON/OFF / Fullscreen / Clear`.
- Требуется отдельная финальная проверка, что player screen без задержки повторяет только слои `Карта` и `Токены` активной сцены.

## Целевая архитектура хранения ассетов

Для D&D-кампаний принимается гибридная модель: общая индексируемая библиотека, выбранные ассеты кампании и автономный экспортный пакет.

```text
Большая внешняя папка изображений
          ↓ рекурсивная фоновая индексация без массового копирования
SQLite-каталог + превью + теги + размеры + формат + SHA-256
          ↓ выбор или первое использование в кампании
Управляемое content-addressed хранилище по SHA-256
          ↓ сбор используемых и явно выбранных дополнительных ассетов
campaign.arcane-campaign
```

Границы хранения:

- **Внешняя библиотека** — одна или несколько подключённых папок пользователя. Приложение читает их рекурсивно, но не копирует всю библиотеку и не изменяет исходные файлы.
- **SQLite-каталог** — перестраиваемый индекс метаданных: canonical source path, размер файла, mtime, ширина/высота, MIME/формат, SHA-256, путь превью, пользовательские теги и статус доступности исходника. Бинарные оригиналы в SQLite не хранятся.
- **Управляемое хранилище** — content-addressed файлы, скопированные только при выборе/использовании в кампании. Один SHA-256 хранится физически один раз и может использоваться несколькими кампаниями.
- **Кампания** — ссылается на логический asset id и SHA-256, а не зависит от абсолютного пути внешней папки. Удаление кампании не должно автоматически удалять общую библиотеку или blob, пока он нужен другим кампаниям.
- **Экспорт** — versioned автономный `.arcane-campaign` с manifest, JSON кампании, checksum каждого файла, всеми реально используемыми ассетами и дополнительными ассетами, которые пользователь явно отметил для передачи.

Технические инварианты:

- индексация выполняется в фоне, поддерживает отмену/прогресс и не блокирует renderer;
- повторное сканирование использует размер и mtime для быстрого пути, но SHA-256 остаётся ключом дедупликации;
- превью и SQLite-каталог можно удалить и восстановить из подключённых папок и управляемого хранилища;
- импорт сначала проверяет manifest, версию, пути и SHA-256, затем атомарно подключает данные;
- потерянный внешний исходник не ломает кампанию, если использованный ассет уже находится в управляемом хранилище;
- первый формат `.arcane-campaign` из задачи 16.2 остаётся совместимым MVP и эволюционирует через version/schema marker.

## Этап 16. Стартовый экран и жизненный цикл проекта

Статус: выполнено.

Цель: сделать стартовый экран первым экраном master-приложения и перенести управление проектами из технической панели в визуальную библиотеку.

### Задача 16.1. Каталог, выбор и запуск проекта

Статус: выполнено.

Входит:

- отдельный стартовый экран без master sidebar;
- прокручиваемая сетка карточек проектов;
- превью из карты активной сцены и понятная заглушка без карты;
- название, описание, количество сцен/ассетов и дата изменения;
- выбор карточки с явной подсветкой;
- disabled-состояния действий без выбранного проекта;
- создание пустого проекта с немедленным переходом в рабочую область;
- запуск выбранного проекта отдельной кнопкой;
- удаление с подтверждением, при котором локальная папка ассетов не удаляется;
- возврат по кнопке с логотипом в рабочей области с сохранением проекта;
- общий store между стартовым экраном и рабочей областью без повторной загрузки состояния.

Критерии готовности:

- master route всегда начинается со стартового экрана;
- выбор карточки включает `Запустить проект` и `Удалить проект`;
- создание, запуск, возврат и удаление проходят без перезагрузки Electron renderer;
- карточка проекта показывает карту активной сцены, если она назначена;
- `npm run lint`, `npm run typecheck`, `npm run test`, `npm run build` проходят;
- flow проверен через реальный browser route.

### Задача 16.2. Переносимый import/export

Статус: выполнено.

Входит:

- автономный файл `campaign.arcane-campaign` с version/schema marker;
- JSON кампании и все прикреплённые к ней локальные ассеты;
- SHA-256 каждого бинарного ассета с проверкой целостности при импорте;
- выбор файла через native Electron dialog;
- безопасный импорт с новым id при конфликте;
- перепривязка asset paths после импорта;
- атомарная запись и понятные ошибки битого/несовместимого пакета;
- функциональные кнопки `Импорт проекта` и `Экспорт проекта` на стартовом экране.

Не входит:

- сторонние VTT-форматы;
- облако и синхронизация;
- удаление общей библиотеки ассетов при удалении проекта.

## Этап 17. Контракты гибридного хранилища

Статус: выполнено.

Цель: отделить логический ассет кампании от внешнего пути и подготовить безопасную миграцию текущих JSON-кампаний.

Входит:

- typed contracts для library source, indexed asset, managed blob и campaign asset reference;
- стабильная связь `asset id -> SHA-256 -> managed blob`;
- схема SQLite-каталога и versioned migrations;
- сервисные границы `AssetIndexService`, `ManagedAssetStore` и `CampaignAssetResolver`;
- миграция текущих `file:`/`data:` ссылок без потери совместимости;
- правила жизненного цикла, дедупликации и безопасной очистки неиспользуемых blob.

Реализовано:

- shared contracts `AssetLibrarySource`, `IndexedAsset`, `ManagedAssetBlob`, `CampaignAssetStorageReference` и `CampaignAssetBinding`;
- необязательный `Asset.storageRef`, совместимый с существующим обязательным `filePath`, и export policy `when-used / always`;
- lossless migration текущих `file:` и `data:` ссылок при чтении/записи campaign JSON;
- driver-neutral `AssetIndexService`, `ManagedAssetStore` и `CampaignAssetResolver`;
- resolver для embedded, legacy и managed references с явными ошибками отсутствующего blob;
- детерминированный content-addressed layout `objects/<2>/<2>/<sha256>.<ext>`;
- SQLite schema versions 1-2 для sources, indexed assets, tags, managed blobs и campaign bindings;
- транзакционный migration runner на `PRAGMA user_version` с rollback и отказом открывать более новую схему;
- защита `.arcane-campaign` от утечки legacy absolute path через новый `storageRef`.

Критерии готовности:

- legacy JSON загружается без изменения видимого URL ассета;
- managed reference разрешается только через `ManagedAssetStore` и валидный SHA-256;
- DDL проходит реальную SQLite syntax/foreign-key проверку;
- migrations применяются последовательно, откатываются при ошибке и не запускаются повторно;
- lint, typecheck, unit/integration tests и production build проходят.

## Этап 18. Подключение папок и фоновая индексация

Статус: запланировано следующим.

Входит:

- действие `Подключить папку` и реестр источников библиотеки;
- рекурсивный поиск поддерживаемых изображений без копирования оригиналов;
- фоновая очередь с прогрессом, отменой и возобновлением;
- вычисление размеров, формата, MIME, mtime и SHA-256;
- генерация дисковых миниатюр;
- инкрементальное повторное сканирование и отметка недоступных исходников;
- SQLite-каталог с миграциями и тестами на большую библиотеку.

## Этап 19. Asset Manager

Статус: запланировано.

Входит:

- виртуализированная сетка превью;
- поиск по имени, пути и тегам;
- фильтры по источнику, формату, размеру и доступности;
- редактирование пользовательских тегов без изменения исходного файла;
- выбор ассета для кампании и отдельная отметка дополнительных файлов для экспорта;
- понятные состояния индексации, отсутствующего исходника и ошибки превью.

## Этап 20. Управляемое SHA-256-хранилище

Статус: запланировано.

Входит:

- copy-on-use: файл копируется в управляемое хранилище только при добавлении в кампанию;
- content-addressed layout по SHA-256 и дедупликация между кампаниями;
- атомарная запись через staging и проверка checksum;
- разрешение campaign asset reference без зависимости от внешнего absolute path;
- учёт ссылок и безопасная отдельная команда garbage collection;
- восстановление кампании при недоступной внешней папке.

## Этап 21. Умный автономный экспорт

Статус: запланировано.

Цель: развить MVP-пакет задачи 16.2 до экспорта из гибридного хранилища.

Входит:

- обход сцен, токенов, handouts и player projection для определения реально используемых ассетов;
- добавление явно выбранных пользователем дополнительных ассетов;
- manifest с логическими id, SHA-256, размером, MIME и относительным безопасным путём;
- упаковка каждого уникального blob один раз;
- preview состава и размера пакета до записи;
- импорт с дедупликацией в managed store и отчётом о пропущенных/повреждённых файлах;
- совместимость с пакетом версии 1 из задачи 16.2.

## Этап 22. Рабочая область по макету

Статус: запланировано.

Цель: приблизить существующий master UI к редактору сцены из Word, сохранив готовые инструменты.

Входит:

- центральная сетка как главный визуальный фокус;
- сворачиваемые функциональные панели без потери доступности;
- компактная кнопка возврата к проектам;
- устранение дублирующего полного CRUD кампании внутри рабочей области;
- сохранение активной сцены и проекта при возврате.

## Этап 23. Пользовательские слои `Карта / ГМ / Токены`

Статус: запланировано.

Цель: поверх существующего typed canvas дать мастеру три понятных режима редактирования из Word.

Входит:

- несворачиваемый переключатель активного пользовательского слоя;
- порядок отображения `Карта -> ГМ -> Токены`;
- редактируется только один активный слой;
- слой `Карта` виден игрокам;
- слой `ГМ` полностью исключён из player projection и имеет 50% opacity в неактивном состоянии мастера;
- слой `Токены` виден игрокам, новые токены по умолчанию имеют размер клетки;
- адаптер к существующим техническим слоям `map/grid/object/token/master/fog`, без потери fog и measurements.

Риск: нельзя механически удалить технические слои — нужно отделить пользовательский режим редактирования от внутреннего render stack.

## Этап 24. Независимые viewport и масштаб

Статус: запланировано.

Цель: разделить положение/масштаб master workspace и player screen.

Входит:

- zoom `+ / -`, процент и `Центр` в рабочей области;
- zoom колесом мыши с ограничениями;
- центрирование сетки без изменения координат объектов;
- отдельный player viewport;
- сохранение master viewport в сцене и player viewport в player screen state;
- тесты, что масштаб не мутирует изображения и объекты слоёв.

## Этап 25. Управление экраном игроков

Статус: запланировано.

Цель: собрать существующие IPC-команды в компактный блок по макету.

Входит:

- раскрытие/сворачивание блока `Экран игрока`;
- `ON/OFF` открывает или закрывает player window;
- `Fullscreen` переключает полный экран;
- `Clear` снимает активную сцену и показывает blank state;
- `Активная сцена` отправляет выбранную сцену;
- одновременно активна только одна сцена;
- для уже активной сцены action заменяется надписью `Сцена активна`.

## Этап 26. Экран игроков и live-проекция

Статус: запланировано.

Цель: гарантировать display-only экран без инструментов мастера.

Входит:

- отображение только области сетки и player viewport controls;
- live-обновление карты и токенов активной сцены;
- полное исключение слоя ГМ, master notes и приватного token state;
- корректное восстановление последнего публичного состояния после повторного открытия окна;
- smoke-проверка на втором мониторе/fullscreen.

## Этап 27. Регрессия, UX и релиз

Статус: запланировано.

Входит:

- keyboard/focus/accessibility pass;
- проверка длинных русских названий, пустых библиотек и больших наборов проектов;
- миграция legacy JSON без новых полей;
- lint, typecheck, unit/integration tests, production build и installer;
- обновление `USER_GUIDE.md`, README и скриншотов.

## Архив выполненного технического Roadmap

Проект развивается по этапам. Каждый этап должен завершаться проверками, коммитом и остановкой перед переходом к следующему крупному блоку.

## Этап 0. Базовая архитектура проекта

Статус: выполнено.

Цель: создать Electron + React + TypeScript + Vite приложение с базовыми окнами, shared-типами и заменяемым storage layer.

Входит:
- Electron main process, preload и renderer.
- Master window и подготовленный player window.
- Shared-типы для основных доменных сущностей.
- `StorageService` и JSON-реализация.
- README и базовые правила проекта.

Не входит:
- Полноценный canvas.
- Реальные карты, токены, ассеты и fog of war.
- Онлайн-режим, backend, авторизация или облако.

Критерии готовности:
- Приложение запускается через `npm run dev`.
- Master window открывается.
- JSON storage доступен через абстракцию.
- `npm run lint`, `npm run typecheck`, `npm run test` проходят.

Затрагивается:
- `src/main`
- `src/preload`
- `src/renderer`
- `src/shared`
- `src/main/storage`

Риски:
- Смешивание Electron main, preload и renderer обязанностей.
- Слишком раннее добавление внешней инфраструктуры.

## Этап 1. Полноценный двухэкранный режим master/player

Статус: выполнено.

Цель: сделать так, чтобы мастер управлял отдельным окном игроков через централизованный typed IPC.

Входит:
- Централизованные IPC-каналы `player:*`.
- Расширенный `PlayerScreenState`.
- Открытие, фокусировка и закрытие player window.
- Fullscreen управление player window.
- Хранение последнего состояния player screen в main process.
- Отправка тестовой сцены и тестового изображения игрокам.
- Скрытие, повторный показ и сброс player screen.
- Базовый player UI для режимов `blank`, `scene`, `image`, `split`.
- Временная панель управления player screen в master UI.

Не входит:
- Реальные карты и импорт изображений.
- Canvas, токены, fog of war и измерения.
- Полноценный tracker инициативы.
- Хранение player screen state в файле кампании как финальный UX.

Критерии готовности:
- Master window открывает player window.
- Повторное открытие фокусирует существующее player window.
- Закрытие player window не ломает master window.
- Player window получает последнее актуальное состояние при повторном открытии.
- Master window может показать тестовую сцену, тестовое изображение, скрыть, показать и сбросить player screen.
- Fullscreen можно включить и выключить.
- IPC-каналы централизованы в shared constants.
- `npm run lint`, `npm run typecheck`, `npm run test`, `npm run dev` проходят или блокеры явно описаны.

Затрагивается:
- `src/shared/types/playerScreen.ts`
- `src/shared/constants/ipc.ts`
- `src/main/playerScreen`
- `src/main/ipc/playerScreenIpc.ts`
- `src/preload`
- `src/renderer/pages`
- `src/renderer/app/styles.css`

Риски:
- Потеря состояния при закрытии или повторном открытии player window.
- Отправка IPC-события в уничтоженное окно.
- Расползание строковых IPC-каналов по renderer и main process.

## Этап 2. Основной UI мастера

Статус: выполнено.

Цель: собрать рабочую поверхность мастера: список сцен сверху, левая панель инструментов, правая панель ассетов/персонажей/заметок и центральная рабочая область.

Входит:
- Layout master console.
- Пустые, но типизированные области будущих сцен, ассетов, заметок и персонажей.
- Состояния загрузки, пустые состояния и базовая навигация.
- Сохранение Stage 1 player screen controls внутри рабочего shell.
- Верхняя scene strip, left tool rail, central workspace и right context panel.

Не входит:
- Реальный canvas.
- Drag-and-drop ассетов.
- Редактор карточек персонажей.
- Создание и сохранение реальных сцен.
- Импорт изображений.
- Токены, fog of war и gameplay automation.

Критерии готовности:
- Master UI пригоден для дальнейшего наращивания features.
- Панели не ломают существующий player-control.
- UI не содержит онлайн- или backend-сценариев.
- Master route проверен в браузере.
- `npm run lint`, `npm run typecheck`, `npm run test`, `npm run dev` проходят или блокеры явно описаны.

Затрагивается:
- `src/renderer/widgets`
- `src/renderer/pages`
- `src/renderer/app/styles.css`

Риски:
- Перегрузить интерфейс до появления реальных данных.
- Смешать временные заглушки с финальными feature modules.

## Этап 3. JSON-хранение кампаний

Статус: выполнено.

Цель: реализовать создание, открытие и сохранение кампаний в локальных папках и JSON-файлах.

Входит:
- Команды создания кампании.
- Открытие существующей кампании.
- Сохранение доменной модели кампании.
- Ошибки чтения и записи.
- Минимальные fixtures для разработки.
- Удаление кампании через существующий storage API.
- Валидная пустая campaign shape с `combatState` и `playerScreenState`.

Не входит:
- SQLite.
- Синхронизация, облако или multi-user доступ.
- Импорт сторонних campaign formats.
- Создание реальных сцен, asset import, токены или canvas.

Критерии готовности:
- Кампания создается и сохраняется в JSON.
- Кампанию можно открыть, обновить и удалить из master UI.
- Невалидные файлы не ломают список кампаний.
- Storage остается заменяемым через `StorageService`.
- `npm run lint`, `npm run typecheck`, `npm run test`, `npm run dev` проходят или блокеры явно описаны.

Затрагивается:
- `src/main/storage`
- `src/main/ipc/storageIpc.ts`
- `src/preload`
- `src/renderer/stores`
- `src/renderer/pages`
- `data/campaigns`

Риски:
- Небезопасные имена файлов.
- Сильная привязка renderer к JSON-формату.

## Этап 4. Сцены и переключение сцен

Статус: выполнено.

Цель: добавить создание сцен, список сцен, активную сцену и отправку выбранной сцены игрокам.

Входит:
- Модель scene list.
- Активная сцена кампании.
- UI выбора сцены.
- Передача preview активной сцены в `PlayerScreenState`.
- Сохранение active scene state через существующий JSON storage.
- Browser fallback для проверки player screen state в renderer route.

Не входит:
- Реальная карта сцены.
- Canvas tokens.
- Fog of war.
- Импорт изображений и asset binding.

Критерии готовности:
- Сцены создаются и переключаются.
- Активная сцена сохраняется в кампании.
- Игрокам отправляется scene preview.
- Первая сцена становится активной автоматически.
- `npm run lint`, `npm run typecheck`, `npm run test`, `npm run dev` проходят или блокеры явно описаны.

Затрагивается:
- `src/shared/types/scene.ts`
- `src/renderer/pages`
- `src/renderer/stores`
- storage layer
- player screen fallback

Риски:
- Смешать сцену как доменную сущность с будущим canvas состоянием.

## Этап 5. Карты и изображения

Статус: выполнено.

Цель: загрузка PNG/JPG/JPEG/WEBP/JFIF, копирование в assets и отображение карты у мастера и игроков.

Входит:
- Выбор файла изображения.
- Копирование в локальную папку assets кампании.
- Типизированная запись asset.
- Preview карты или handout.
- Привязка map asset к активной сцене.
- Отправка imported image preview через `PlayerScreenState`.

Не входит:
- Token art library.
- Редактирование изображений.
- Canvas layers.
- Drag-and-drop assets.
- Grid calibration, pan и zoom.

Критерии готовности:
- Поддерживаемые форматы импортируются.
- Исходные пути не требуются после копирования в assets.
- Player screen может показать image state.
- Map asset отображается в workspace активной сцены.
- `npm run lint`, `npm run typecheck`, `npm run test`, `npm run dev` проходят или блокеры явно описаны.

Затрагивается:
- `src/shared/types/asset.ts`
- storage layer
- main IPC
- renderer UI
- `src/main/assets`
- `src/preload`

Риски:
- Потеря файлов при переносе кампании.
- Невалидные или слишком большие изображения.

## Этап 6. Canvas / слои сцены

Статус: выполнено.

Цель: добавить основу canvas: карта, сетка, объекты, токены, слой мастера и fog of war как будущий слой.

Входит:
- Shared canvas state у `Scene`.
- Дефолтный стек слоев `map`, `grid`, `object`, `token`, `master`, `fog`.
- Canvas workspace в master UI.
- Отдельная player-visible projection.
- Разделение `master-only`, `player-visible` и `disabled` данных.
- Базовое позиционирование объектов в модели и рендерере.
- Гидрация legacy-сцен без `canvas`.

Не входит:
- Полная логика fog of war.
- Pan/zoom.
- Snap-to-grid.
- Продвинутые измерения.
- Drag-and-drop объектов.
- Автоматизация правил D&D.

Критерии готовности:
- Canvas стабильно отображает сцену.
- Master-only слой не попадает игрокам.
- Архитектура допускает новые слои.
- Player screen получает canvas projection для режима `scene`.
- Старые JSON-сцены без `canvas` не ломают открытие кампании.
- `npm run lint`, `npm run typecheck`, `npm run test`, `npm run dev` проходят или блокеры явно описаны.

Затрагивается:
- `src/shared/types/sceneCanvas.ts`
- `src/shared/types/scene.ts`
- `src/shared/types/playerScreen.ts`
- `src/renderer/stores/sceneCanvasFactory.ts`
- `src/renderer/widgets/SceneCanvas.tsx`
- `src/renderer/pages/MasterDashboardPage.tsx`
- `src/renderer/pages/PlayerScreenPlaceholderPage.tsx`

Риски:
- Слишком ранняя сложность canvas state.
- Утечки master-only данных в player projection.

## Этап 7. Сетка, масштаб и измерения

Статус: выполнено.

Цель: реализовать квадратную сетку, размер клетки, 5 условных футов по умолчанию, snap-to-grid, линейку и области заклинаний.

Входит:
- Grid settings: `enabled`, `size`, `color`, `opacity`, `distancePerCell`, `unitLabel`, `snapToGrid`.
- Canvas viewport: `zoom`, `panX`, `panY`.
- Snap-to-grid для шаблонных измерений.
- Ruler tool.
- Простые area templates: circle, cone, square.
- Player-visible projection для viewport и measurements.
- Legacy hydration для старых сцен без новых canvas/grid полей.

Не входит:
- Автоматический расчет правил.
- Изометрическая или hex-сетка.
- Drag-and-drop редактирование endpoints измерений.

Критерии готовности:
- Сетка масштабируется вместе с картой.
- Измерения понятны мастеру.
- Настройки сохраняются в сцене.
- Player screen получает тот же viewport и measurement layer.
- Master-only данные не попадают в player projection.
- `npm run lint`, `npm run typecheck`, `npm run test`, `npm run dev` проходят или блокеры явно описаны.

Затрагивается:
- `src/shared/types/scene.ts`
- `src/shared/types/sceneCanvas.ts`
- `src/renderer/stores/sceneCanvasFactory.ts`
- `src/renderer/stores/sceneToolsFactory.ts`
- `src/renderer/stores/useCampaignsStore.ts`
- `src/renderer/widgets/SceneCanvas.tsx`
- `src/renderer/pages/PlayerScreenPlaceholderPage.tsx`
- `src/renderer/app/styles.css`

Риски:
- Нечеткие координаты между master и player view.
- Неконтролируемые значения zoom/grid settings без clamp.

## Этап 8. Библиотека ассетов

Статус: выполнено.

Цель: добавить библиотеку карт, токенов, артов, handouts и объектов с поиском, тегами и drag-and-drop.

Входит:
- Asset browser.
- Теги и поиск.
- Быстрое добавление ассета в активную сцену.
- Preview ассета.
- Редактирование тегов после импорта.
- Player projection для asset-backed canvas objects.

Не входит:
- Marketplace.
- Онлайн-каталог.
- Генерация ассетов.
- Полноценный drag-and-drop с координатами указателя.
- Move, duplicate и hide для размещённых объектов.

Критерии готовности:
- Ассеты можно найти и использовать в сцене.
- Библиотека работает локально.
- Метаданные сохраняются в JSON.
- Map asset можно применить к активной сцене.
- Non-map image asset можно добавить как canvas object.
- `npm run lint`, `npm run typecheck`, `npm run test`, `npm run dev` проходят или блокеры явно описаны.

Затрагивается:
- `src/shared/types/asset.ts`
- `src/shared/types/sceneCanvas.ts`
- `src/main/assets/AssetImportService.ts`
- `src/renderer/stores/assetFactory.ts`
- `src/renderer/stores/useCampaignsStore.ts`
- `src/renderer/pages/MasterDashboardPage.tsx`
- `src/renderer/widgets/SceneCanvas.tsx`
- `src/renderer/pages/PlayerScreenPlaceholderPage.tsx`
- `src/renderer/app/styles.css`

Риски:
- Слишком тяжелая библиотека без индексации.
- Неочевидное различие map/token/handout.
- Слишком раннее расширение Stage 8 до полноценного token editor.

## Этап 9. Токены и объекты на карте

Статус: выполнено.

Цель: добавить, перемещать, дублировать, скрывать токены и объекты на карте, а также хранить простые состояния.

Входит:
- Выбор размещенного объекта на master canvas.
- Move, duplicate, hide/show для объектов активной сцены.
- Basic token state: HP, AC, заметка.
- Token card preview/editor в панели canvas.
- Сохранение объектных операций в campaign JSON.
- Защита player projection от master-only `tokenState`.

Не входит:
- Полный character sheet.
- Автоматические атаки и заклинания.
- Сетевой ход игроков.
- Drag-and-drop перемещение мышью.
- Multi-select и массовые операции.

Критерии готовности:
- Токены сохраняют позицию и видимость.
- Игрокам видны только разрешенные токены.
- Закрытие и повторное открытие приложения сохраняет сцену.
- Master UI позволяет выбрать, переместить, дублировать, скрыть и снова показать объект.
- Token state хранит HP, AC и заметку, но не попадает в `PlayerSceneCanvasProjection`.
- `npm run lint`, `npm run typecheck`, `npm run test`, `npm run dev` проходят или блокеры явно описаны.

Затрагивается:
- `src/shared/types/sceneCanvas.ts`
- `src/renderer/stores/sceneCanvasFactory.ts`
- `src/renderer/stores/sceneToolsFactory.ts`
- `src/renderer/stores/useCampaignsStore.ts`
- `src/renderer/widgets/SceneCanvas.tsx`
- `src/renderer/pages/MasterDashboardPage.tsx`
- `src/renderer/app/styles.css`
- player projection

Риски:
- Несогласованность координат и видимости.
- Утечка мастерской карточки токена игрокам.
- Слишком ранний переход к полноценному character sheet вместо простого token state.

## Этап 10. Карточки персонажей, NPC и монстров

Статус: выполнено.

Цель: реализовать простые карточки без полноценного character sheet.

Входит:
- Имя, тип, краткое описание.
- HP, max HP, temporary HP, AC и initiative modifier как простые числовые поля.
- Связь карточки с токеном через master-only `tokenState.characterCardId`.
- Портрет из portrait/token assets.
- Создание, редактирование, удаление и быстрый preview в правой панели.

Не входит:
- Полная автоматизация D&D 5e.
- Импорт из D&D Beyond.
- Расчет spell slots и inventory.
- Полноценный character sheet и rules engine.

Критерии готовности:
- Карточки создаются, редактируются и сохраняются.
- Токен может ссылаться на карточку.
- Удаление карточки очищает ссылки из токенов.
- Player projection не содержит `tokenState`.
- UI не притворяется полноценным VTT character sheet.
- `npm run lint`, `npm run typecheck` и `npm run test` проходят.
- Master card flow проверен в browser route.

Затрагивается:
- `src/shared/types/characterCard.ts`
- `src/shared/types/sceneCanvas.ts`
- `src/renderer/stores/characterCardFactory.ts`
- `src/renderer/stores/useCampaignsStore.ts`
- `src/renderer/widgets/SceneCanvas.tsx`
- `src/renderer/pages/MasterDashboardPage.tsx`
- `src/renderer/app/styles.css`
- storage layer через существующий campaign JSON pipeline

Риски:
- Разрастание фичи в полноценный rules engine.
- Утечка мастерских заметок или ссылок карточек игрокам через player projection.
- Ссылки токенов на удаленные карточки.

## Этап 11. Туман войны

Статус: выполнено.

Цель: реализовать ручное открытие и закрытие областей: полупрозрачный туман мастеру и черный слой игрокам.

Входит:
- Fog layer.
- Manual reveal/hide tools.
- Player projection без скрытых областей.
- Сохранение fog state в сцене.
- Настройка плотности тумана.
- Rectangle/circle regions как простой ручной формат.

Не входит:
- Dynamic lighting.
- Автоматическое зрение токенов.
- Line of sight.
- Freehand masks и polygon editor.

Критерии готовности:
- Мастер видит управляемый fog layer.
- Игроки не видят скрытые области.
- Fog state сохраняется и восстанавливается.
- Player projection получает только display-ready fog regions без мастерских labels.
- `npm run lint`, `npm run typecheck` и `npm run test` проходят.
- Master/player fog flow проверен в browser route.

Затрагивается:
- `src/shared/types/sceneCanvas.ts`
- `src/renderer/stores/sceneCanvasFactory.ts`
- `src/renderer/stores/sceneToolsFactory.ts`
- `src/renderer/stores/useCampaignsStore.ts`
- `src/renderer/widgets/SceneCanvas.tsx`
- `src/renderer/pages/PlayerScreenPlaceholderPage.tsx`
- canvas layers
- player projection
- scene persistence

Риски:
- Утечки скрытой карты игрокам.
- Дорогой рендеринг больших масок.
- Разрастание Stage 11 в dynamic lighting вместо ручного инструмента мастера.

## Этап 12. Заметки, handouts и показ артов

Статус: выполнено.

Цель: добавить заметки мастера, секретные заметки и показ письма, арта или изображения игрокам.

Входит:
- Notes panel.
- Secret notes.
- Handout preview.
- Отправка handout в `PlayerScreenState`.

Не входит:
- Rich text editor как отдельный продукт.
- Онлайн-шаринг материалов.

Критерии готовности:
- Заметки сохраняются в кампании.
- Handout можно показать и скрыть на player screen.
- Secret notes не отправляются игрокам.
- Player state не содержит текст secret notes.
- `npm run lint`, `npm run typecheck` и `npm run test` проходят.
- Notes/handout flow проверен в browser route.

Затрагивается:
- `src/shared/types/note.ts`
- `src/shared/types/playerScreen.ts`
- `src/renderer/stores/noteFactory.ts`
- `src/renderer/stores/useCampaignsStore.ts`
- `src/renderer/pages/MasterDashboardPage.tsx`
- `src/renderer/app/styles.css`
- renderer panels
- player screen state
- storage layer

Риски:
- Утечка secret notes игрокам через handout state.
- Смешение asset handouts и note handouts.
- Непредсказуемое поведение старых JSON campaigns без нормализованных notes.
- Смешивание публичных и приватных заметок.

## Этап 13. Инициатива

Статус: выполнено.

Цель: добавить ручной tracker инициативы, следующий ход, следующий раунд и показ игрокам с переключателем.

Входит:
- Список участников.
- Порядок хода.
- Следующий ход и следующий раунд.
- Флаг видимости инициативы игрокам.
- Public initiative overlay на player screen.

Не входит:
- Автоматический импорт stats.
- Автоматические эффекты и условия.
- Rules engine.

Критерии готовности:
- Tracker можно вести вручную.
- Состояние сохраняется в кампании.
- Игрокам показывается только разрешенная часть.
- `tokenId`, `characterCardId`, HP/AC и master notes не попадают в player projection.
- `npm run lint`, `npm run typecheck` и `npm run test` проходят.
- Master/player initiative flow проверен в browser route.

Затрагивается:
- `src/shared/types/combat.ts`
- `src/shared/types/playerScreen.ts`
- `src/renderer/stores/combatFactory.ts`
- `src/renderer/stores/useCampaignsStore.ts`
- `src/renderer/pages/MasterDashboardPage.tsx`
- `src/renderer/pages/PlayerScreenPlaceholderPage.tsx`
- `src/renderer/app/styles.css`
- master UI
- player screen projection

Риски:
- Утечка master-only combat links игрокам.
- Перегрузка tracker правилами вместо ручного инструмента мастера.

## Этап 14. Автосохранение, undo/redo, backup

Статус: выполнено.

Цель: добавить автосохранение раз в 3-5 секунд, финальное сохранение, статус сохранения и 1-2 backup-копии.

Входит:
- Dirty state.
- Debounced autosave.
- Save status.
- Simple backup rotation.
- Undo/redo для основных операций.
- Видимый save status и счетчики history в master UI.

Не входит:
- Облачная история версий.
- Сложная collaborative history.
- UI восстановления конкретного backup-файла.

Критерии готовности:
- Изменения не теряются при обычном закрытии.
- Ошибки сохранения видны мастеру.
- Backup не засоряет проект бесконечными файлами.
- Backup-файлы не попадают в список кампаний.

Затрагивается:
- storage layer
- renderer stores
- campaign mutation APIs
- master UI
- unit tests

Риски:
- Повреждение JSON при аварийном завершении.
- Слишком частая запись больших campaign files.
- Рост истории undo/redo в памяти.

## Этап 15. Полировка и exe-сборка

Статус: выполнено.

Цель: довести UX, темы, горячие клавиши, стабильность, инструкцию пользователя и Windows installer.

Входит:
- UX polish.
- Keyboard shortcuts.
- Light/dark или рабочая тема.
- Error boundaries.
- User guide.
- `electron-builder` Windows installer.
- Production build verification.
- Local Electron distribution for reproducible Windows packaging.

Не входит:
- Mobile, web или marketplace.
- Онлайн-сервисы.
- Новые игровые mechanics.

Критерии готовности:
- Приложение стабильно собирается в installer.
- `npm run dist:win` использует локальный `node_modules/electron/dist` вместо повторной загрузки Electron.
- Основные сценарии мастера проверены вручную.
- Документация пользователя соответствует фактическому UI.
- Renderer показывает fallback вместо пустого экрана при runtime error.
- Save/undo/redo shortcuts работают в master UI.

Затрагивается:
- весь desktop app
- docs
- build configuration
- renderer shell

Риски:
- Installer не учитывает локальные пути Windows.
- Позднее выявление UX-проблем из ранних этапов.
- Горячие клавиши конфликтуют с редактированием текста.
