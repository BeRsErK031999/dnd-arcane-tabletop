# Current Stage

## Текущий этап

Этап 24. Независимые viewport и масштаб.

Статус: выполнено и проверено.

## Результат

Рабочая область мастера и экран игроков получили независимые сохранённые виды. Масштаб и центрирование меняют только viewport и не затрагивают изображения, координаты или размеры объектов.

## Реализовано в этапе 24

- `Scene.canvas.viewport` остаётся единственным master viewport.
- `PlayerScreenState.playerViewport` хранит отдельный player viewport.
- Player projection получает player viewport явно и не наследует master zoom/pan.
- В master workspace доступны `Вид мастера` и `Вид игроков` с `− / +`, процентом и `Центр`.
- Canvas мастера и player screen поддерживают wheel zoom в диапазоне `50–300%`.
- `Центр` сбрасывает только pan и сохраняет процент масштаба.
- Player screen сохраняет свой viewport через typed API; master renderer синхронизирует его с campaign state.
- Legacy player state гидратируется из старого projection viewport или безопасного default.

## Проверка

- Unit tests проверяют независимость master/player viewport, clamp и неизменность scene objects.
- Browser flow подтвердил независимые значения `110%` и `120%`.
- Центрирование на master/player screen сохранило значение `110%`.
- Player page восстановил сохранённый player viewport и показал собственные controls.
- Typecheck и профильные tests проходят; полный regression suite выполняется перед commit.
- Исходный Word остаётся вне commit.

## Следующий этап

Этап 25 — компактное управление экраном игроков: collapsible block, `ON/OFF`, `Fullscreen`, `Clear` и состояние `Сцена активна`.

## Основные затронутые области

- `src/shared/types/playerScreen.ts`
- `src/renderer/stores/sceneCanvasFactory.ts`
- `src/renderer/stores/sceneToolsFactory.ts`
- `src/renderer/stores/campaignFactory.ts`
- `src/renderer/stores/useCampaignsStore.ts`
- `src/renderer/widgets/SceneCanvas.tsx`
- `src/renderer/pages/MasterDashboardPage.tsx`
- `src/renderer/pages/PlayerScreenPlaceholderPage.tsx`
- `src/renderer/app/styles.css`

## Следующие риски

- `ON/OFF` должен управлять окном, а не только скрывать содержимое.
- `Clear` должен сохранять blank state и снимать active scene на player screen, не удаляя сцену кампании.
- Повторная отправка уже активной сцены должна быть заменена понятным read-only состоянием.
- Управление fullscreen должно отражать фактический IPC status.
