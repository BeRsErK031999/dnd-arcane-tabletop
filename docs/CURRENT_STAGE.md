# Current Stage

## Текущий этап

Этап 2. Основной UI мастера.

Статус: выполнено в этом этапе.

## Цель

Собрать рабочую поверхность мастера, которая станет основой для следующих этапов: сцены, инструменты, центральная рабочая область, правая панель сущностей и сохраненное управление экраном игроков из Stage 1.

## Уже реализовано до начала этапа

- Electron + React + TypeScript + Vite scaffold.
- Master window и player window.
- JSON storage через `StorageService`.
- Shared-типы доменных сущностей.
- Typed IPC для master/player режима.
- `PlayerScreenController` в main process.
- Базовый player screen renderer для режимов `blank`, `scene`, `image`, `split`.
- Панель управления player screen.

## Что можно использовать

- `MasterShell` как внешний desktop shell.
- `MasterDashboardPage` как текущую master route.
- `desktopApi.playerScreen` для сохранения Stage 1 controls.
- Campaign summaries из `useCampaignsStore`.
- Существующие CSS primitives: `panel`, `button`, `status-badge`, `stack`.

## Пробелы этапа

- Master screen все еще выглядел как стартовый dashboard, а не как рабочее место мастера.
- Не было верхней полосы сцен.
- Не было левой панели инструментов.
- Не было центральной рабочей области под будущий canvas.
- Не было правой панели assets/characters/notes.
- Stage 1 player controls занимали отдельную dashboard card и не были встроены в общий master workspace.

## Что реализовано

- Верхняя полоса сцен с активной сценой и будущими scene placeholders.
- Левая панель инструментов с группами будущих master tools.
- Центральная рабочая область с placeholder canvas, session metrics и понятным состоянием Stage 2.
- Правая панель с tabs: assets, characters, notes.
- Компактный блок кампаний и статуса storage.
- Блок управления экраном игроков сохранен и встроен в workspace.
- Документация обновлена под завершение Stage 1 и Stage 2.

## Критерии готовности

- Master window открывается.
- На master route видны верхняя сцена strip, tool rail, центральная workspace и правая panel.
- Правая panel переключается между assets, characters и notes.
- Player screen controls остаются доступными.
- Stage 1 player flow не сломан.
- Нет реализации реальных карт, токенов, fog of war, asset import или карточек персонажей.
- `npm run lint` проходит.
- `npm run typecheck` проходит.
- `npm run test` проходит.
- `npm run dev` запускается.
- Renderer route `/?screen=master` проверен в браузере.

## Не входит в этап

- Создание и сохранение реальных сцен.
- Реальный canvas.
- Импорт изображений.
- Drag-and-drop assets.
- Токены и объекты на карте.
- Fog of war.
- Редактор карточек персонажей.
- Реальная инициатива как gameplay-модуль.
- Backend, SQLite, PostgreSQL, cloud, online mode.

## Следующий этап

Этап 3. JSON-хранение кампаний.

Он не начат. Перед ним нужно отдельно подтвердить переход.

## Риски и меры

- Риск превратить Stage 2 в функциональный canvas: все scene/canvas/assets элементы остаются UI placeholders.
- Риск сломать player screen controls: Stage 1 control flow сохранен через тот же `desktopApi.playerScreen`.
- Риск перегрузить интерфейс: панели сделаны плотными и рабочими, без landing page и декоративной витрины.
