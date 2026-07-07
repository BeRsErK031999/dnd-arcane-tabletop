# Current Stage

## Текущий этап

Этап 1. Полноценный двухэкранный режим master/player.

## Цель

Сделать так, чтобы окно мастера могло открывать, закрывать, обновлять и управлять отдельным окном игроков через типизированный IPC.

## Уже реализовано до начала этапа

- Electron + React + TypeScript + Vite scaffold.
- Master window.
- Подготовленный player window.
- Shared-типы доменных сущностей.
- `StorageService` и `JsonStorageService`.
- Базовый preload API.
- Централизованный файл `src/shared/constants/ipc.ts`.

## Что можно использовать

- `createMasterWindow` и `createPlayerWindow`.
- `loadRendererWindow` с query-параметром `screen`.
- `IPC_CHANNELS` как место для всех IPC channel names.
- `DesktopApi` в preload как безопасный renderer bridge.
- Existing renderer routing через `/?screen=master` и `/?screen=player`.
- JSON storage без изменения persistence stack.

## Пробелы этапа

- Player screen был только placeholder.
- `PlayerScreenState` не описывал режимы `blank`, `scene`, `image`, `split`.
- IPC для player screen умел только открывать окно.
- Main process не хранил последнее состояние player screen.
- Master UI не имел панели проверки open/close/fullscreen/state/visibility.

## Что должно быть реализовано

- Кнопка открытия окна игроков.
- Защита от открытия нескольких одинаковых player windows.
- Повторное открытие фокусирует существующее player window.
- Закрытие player window из master UI.
- Fullscreen и выход из fullscreen.
- Отправка тестового состояния на экран игроков.
- Скрытие player screen.
- Повторный показ player screen.
- Player window отображает актуальное состояние.
- Закрытое player window не ломает master window.
- Повторно открытое player window получает последнее состояние.
- `PlayerScreenState` типизирован.
- Канал master -> player централизован.
- Строковые IPC-каналы не размазаны по проекту.

## Критерии готовности

- Приложение запускается.
- Master window открывается.
- Из master window можно открыть player window.
- Player window можно вручную перенести на второй экран и развернуть fullscreen.
- Master window может отправить тестовую сцену или сообщение в player window.
- Master window может скрыть экран игроков.
- Master window может снова показать экран игроков.
- Закрытие player window не ломает master window.
- Повторное открытие player window работает корректно.
- `npm run lint` проходит.
- `npm run typecheck` проходит.
- `npm run test` проходит.
- `npm run dev` запускается.
- Двухэкранный режим вручную проверен настолько, насколько позволяет текущая среда.

## Не входит в этап

- Реальный импорт карт.
- Токены.
- Canvas scene layers.
- Fog of war.
- Реальная инициатива как отдельный модуль.
- Asset library.
- Карточки персонажей.
- Backend, SQLite, PostgreSQL, cloud, online mode.

## План реализации этапа

1. Расширить `PlayerScreenState` в shared types.
2. Централизовать все player IPC channels в `IPC_CHANNELS`.
3. Добавить main-process controller для player window и player state.
4. Расширить `playerScreenIpc`.
5. Расширить preload `DesktopApi`.
6. Добавить master panel для ручного управления player screen.
7. Реализовать player renderer для режимов `blank`, `scene`, `image`, `split`.
8. Добавить или обновить тесты.
9. Выполнить lint, typecheck, tests и dev smoke check.
10. Создать commit `feat(player-screen): add typed two-window control flow`.

## Риски и меры

- Состояние может потеряться при закрытии окна: main process хранит последнее `PlayerScreenState` в памяти.
- IPC может уйти в закрытое окно: отправка проверяет live `BrowserWindow`.
- Fullscreen может быть вызван при закрытом окне: handler возвращает typed result с причиной.
- Player renderer может загрузиться после IPC-события: при загрузке он дополнительно запрашивает текущее состояние.
- Строковые IPC-каналы могут расползтись: все names остаются в `src/shared/constants/ipc.ts`.
