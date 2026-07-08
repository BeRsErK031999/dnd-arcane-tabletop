# Current Stage

## Текущий этап

Этап 13. Combat tracker и инициатива.

Статус: выполнено в этом этапе.

## Цель

Дать мастеру ручной tracker инициативы: список участников, порядок хода, старт/стоп, следующий ход, следующий раунд и переключатель показа инициативы игрокам.

## Уже реализовано до начала этапа

- Electron + React + TypeScript + Vite scaffold.
- Master/player desktop shell.
- Typed IPC для player screen.
- JSON campaign storage.
- Campaign CRUD.
- Scene creation, active scene switching и scene preview для player screen.
- Local image asset import, tags, search и asset preview.
- Canvas state, layers, grid, viewport, measurements и player projection.
- Object movement, duplicate/hide и master-only token state.
- Simple character cards для players/NPC/monster.
- Manual fog of war для master/player canvas.
- Notes panel, secret notes и публичные handouts.

## Что можно использовать

- `Campaign.combatState`.
- `CombatState` и `CombatParticipant`.
- `PlayerScreenState.initiativeVisible`.
- `desktopApi.storage.saveCampaign`.
- `desktopApi.playerScreen.updateState`.
- Browser fallback storage для renderer smoke checks.

## Пробелы этапа

- `CombatState` существовал только как пустое поле кампании.
- Master UI не позволял вести порядок инициативы.
- `PlayerScreenState.initiativeVisible` был флагом без public tracker snapshot.
- Player screen не показывал участникам порядок хода.

## Что реализовано

- `combatFactory` добавляет гидрацию, нормализацию, сортировку участников по инициативе и безопасный player projection.
- Мастер может вручную добавить, выбрать, редактировать и удалить участника инициативы.
- Tracker поддерживает старт/стоп, следующий ход и следующий раунд.
- Следующий ход пропускает выбывших участников, если есть доступные участники.
- Переключатель `Показывать инициативу игрокам` сохраняет `PlayerScreenState.initiativeVisible` и синхронизирует player screen.
- Player screen показывает public initiative overlay с именем, инициативой, активным ходом и простым статусом игрок/мастер.
- Public projection не содержит `tokenId`, `characterCardId`, HP, AC или master notes.
- Browser fallback clone безопасно копирует `initiativeTracker`.
- Unit tests покрывают порядок инициативы, раунды, defeated skip, legacy hydration и player-safe projection.

## Критерии готовности

- Tracker можно вести вручную.
- Состояние сохраняется в кампании.
- Можно перейти к следующему ходу.
- Можно перейти к следующему раунду.
- Инициативу можно показать и скрыть на player screen.
- Игрокам показывается только разрешенная часть.
- `npm run lint` проходит.
- `npm run typecheck` проходит.
- `npm run test` проходит.
- `npm run dev:renderer` запускается.
- Master/player initiative flow проверен в browser route.

## Не входит в этап

- Автоматический импорт stats.
- Автоматические эффекты и условия.
- Rules engine.
- HP/AC damage automation.
- Индивидуальная видимость инициативы для разных игроков.

## Следующий этап

Этап 14. Автосохранение, undo/redo, backup.

Он не начат.

## Риски и меры

- Риск утечки token/card ids: player projection содержит только `PlayerInitiativeParticipant` без `tokenId` и `characterCardId`.
- Риск превратить tracker в rules engine: Stage 13 ограничен ручным порядком хода, раундами и defeated toggle.
- Риск устаревших JSON campaigns: отсутствующий или некорректный `combatState` гидрируется в безопасный пустой state.
- Риск рассинхрона player screen: combat mutations пушат `PlayerScreenState`, когда инициатива видна игрокам.
