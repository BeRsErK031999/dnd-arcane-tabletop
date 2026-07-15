# Current Stage

## Текущий этап

Этап 23. Пользовательские слои `Карта / ГМ / Токены`.

Статус: выполнено и проверено.

## Результат

Master workspace получил постоянный пользовательский layer switcher поверх существующего typed render stack. Активным и редактируемым остаётся один слой, а player-safe границы технических слоёв сохранены.

## Реализовано в этапе 23

- Порядок пользовательских слоёв зафиксирован как `Карта -> ГМ -> Токены`.
- `Карта` адаптирует `map/grid/object`, `ГМ` — `master`, `Токены` — `token`.
- Fog и measurements не входят в переключатель и продолжают работать независимо.
- Layer selection является UI-only состоянием и не меняет JSON, autosave или undo/redo history.
- Неактивные объекты исключены из pointer/keyboard editing.
- Сетка редактируется только при активном слое `Карта`.
- Asset placement учитывает текущий слой.
- `ГМ` всегда master-only и становится 50% opacity в неактивном состоянии.
- `Токены` используют размер клетки независимо от исходного типа изображения.
- Player projection исключает ГМ и сохраняет render order карты перед токенами.

## Проверка

- Unit tests покрывают adapter mapping, order, opacity, projection и asset placement.
- Browser flow проверен на 1440, 768 и 360 px без horizontal overflow.
- Проверены placement на ГМ/Токены, запрет редактирования inactive layer и восстановление selection.
- Browser console не содержит errors/warnings.
- `npm run lint`, `npm run typecheck`, `npm run test` и `npm run build` проходят.
- Исходный Word и его lock-файл остаются вне commit.

## Следующий этап

Этап 24 — независимые viewport и масштаб: разделить master/player viewport, добавить wheel zoom и явное центрирование без изменения размеров объектов.

## Основные затронутые области

- `src/renderer/stores/sceneCanvasFactory.ts`
- `src/renderer/stores/assetFactory.ts`
- `src/renderer/stores/useCampaignsStore.ts`
- `src/renderer/widgets/SceneCanvas.tsx`
- `src/renderer/pages/MasterDashboardPage.tsx`
- `src/renderer/app/styles.css`
- `docs/ROADMAP.md`
- `docs/ARCHITECTURE.md`
- `docs/USER_GUIDE.md`

## Следующие риски

- Master viewport и player viewport нельзя хранить в одном поле.
- Wheel zoom должен быть ограничен и не менять object width/height или layer data.
- Центрирование должно сбрасывать только pan, не мутируя сцену целиком.
- Legacy scenes без player viewport должны получить безопасный default при hydration.
