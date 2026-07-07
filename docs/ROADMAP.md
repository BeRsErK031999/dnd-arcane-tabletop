# Roadmap

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

Цель: реализовать ручное открытие и закрытие областей: полупрозрачный туман мастеру и черный слой игрокам.

Входит:
- Fog layer.
- Manual reveal/hide tools.
- Player projection без скрытых областей.
- Сохранение fog state в сцене.

Не входит:
- Dynamic lighting.
- Автоматическое зрение токенов.
- Line of sight.

Критерии готовности:
- Мастер видит управляемый fog layer.
- Игроки не видят скрытые области.
- Fog state сохраняется и восстанавливается.

Затрагивается:
- canvas layers
- player projection
- scene persistence

Риски:
- Утечки скрытой карты игрокам.
- Дорогой рендеринг больших масок.

## Этап 12. Заметки, handouts и показ артов

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

Затрагивается:
- `src/shared/types/note.ts`
- renderer panels
- player screen state
- storage layer

Риски:
- Смешивание публичных и приватных заметок.

## Этап 13. Инициатива

Цель: добавить ручной tracker инициативы, следующий ход, следующий раунд и показ игрокам с переключателем.

Входит:
- Список участников.
- Порядок хода.
- Следующий ход и следующий раунд.
- Флаг видимости инициативы игрокам.

Не входит:
- Автоматический импорт stats.
- Автоматические эффекты и условия.
- Rules engine.

Критерии готовности:
- Tracker можно вести вручную.
- Состояние сохраняется в кампании.
- Игрокам показывается только разрешенная часть.

Затрагивается:
- `src/shared/types/combat.ts`
- master UI
- player screen projection

Риски:
- Перегрузка tracker правилами вместо ручного инструмента мастера.

## Этап 14. Автосохранение, undo/redo, backup

Цель: добавить автосохранение раз в 3-5 секунд, финальное сохранение, статус сохранения и 1-2 backup-копии.

Входит:
- Dirty state.
- Debounced autosave.
- Save status.
- Simple backup rotation.
- Undo/redo для основных операций.

Не входит:
- Облачная история версий.
- Сложная collaborative history.

Критерии готовности:
- Изменения не теряются при обычном закрытии.
- Ошибки сохранения видны мастеру.
- Backup не засоряет проект бесконечными файлами.

Затрагивается:
- storage layer
- renderer stores
- campaign mutation APIs

Риски:
- Повреждение JSON при аварийном завершении.
- Слишком частая запись больших campaign files.

## Этап 15. Полировка и exe-сборка

Цель: довести UX, темы, горячие клавиши, стабильность, инструкцию пользователя и Windows installer.

Входит:
- UX polish.
- Keyboard shortcuts.
- Light/dark или рабочая тема.
- Error boundaries.
- User guide.
- `electron-builder` Windows installer.

Не входит:
- Mobile, web или marketplace.
- Онлайн-сервисы.

Критерии готовности:
- Приложение стабильно собирается в installer.
- Основные сценарии мастера проверены вручную.
- Документация пользователя соответствует фактическому UI.

Затрагивается:
- весь desktop app
- docs
- build configuration

Риски:
- Installer не учитывает локальные пути Windows.
- Позднее выявление UX-проблем из ранних этапов.
