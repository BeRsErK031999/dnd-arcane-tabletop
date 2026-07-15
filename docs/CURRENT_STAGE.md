# Current Stage

## Текущий этап

Этап 21. Умный автономный экспорт.

Статус: выполнено и проверено.

## Результат

Гибридная модель хранения завершена до автономного обмена кампаниями: экспорт собирает только реально используемые и явно добавленные материалы, а импорт полностью валидирует пакет и дедуплицирует его содержимое непосредственно в managed store.

## Реализовано в этапе 21

- `CampaignExportPlanner` строит транзитивный граф использования по сценам, canvas, токенам, портретам, handouts и player projection.
- Политика `always` добавляет в пакет выбранные пользователем материалы независимо от текущего использования.
- Package version 2 разделяет логические asset entries и уникальные blob entries.
- Каждый SHA-256 записывается в payload ровно один раз; absolute source paths в пакет не попадают.
- Одноразовый preview показывает состав, размер и причины включения до выбора целевого файла.
- Фактический экспорт повторно проверяет campaign revision, размер и checksum относительно preview.
- Импорт валидирует весь manifest и payload до публикации, затем использует атомарный `ManagedAssetStore`.
- Повторный импорт переиспользует существующие blob и сообщает статистику дедупликации.
- Импорт package version 1 сохранён и мигрирует legacy assets в managed store.
- Стартовый экран получил адаптивное окно состава экспорта с клавиатурным закрытием и прокруткой на малой высоте.

## Инварианты безопасности

- Renderer не читает файлы и не вычисляет managed paths: preview и запись проходят через typed IPC/preload API.
- Небезопасный относительный путь, неизвестный asset/blob, несовпадающий размер или checksum отклоняются до публикации кампании.
- Preview token нельзя использовать повторно или после изменения кампании/источника.
- Import rollback удаляет неполную кампанию и не удаляет ранее существовавшие либо уже используемые blob.
- Неиспользуемый `when-used` asset отсутствует и в manifest, и в portable campaign JSON.
- Version 1 остаётся только совместимым входным форматом; новый экспорт всегда создаёт version 2.

## Критерии готовности

- Две логические ссылки на одинаковый контент дают один blob entry.
- Повторный импорт не создаёт физический дубль managed blob.
- Повреждённый payload сообщает число повреждённых blob и не оставляет проект.
- Конфликт campaign id создаёт новую независимую кампанию с перепривязанными сущностями.
- Browser smoke подтверждает preview, Escape и адаптивность на 1440, 768 и 360 px без console errors.
- `npm run lint`, `npm run typecheck`, `npm run test`, `npm run build` и `npm run dist:win` проходят.
- Исходный Word и его временный lock-файл не входят в commit.

## Следующий этап

Этап 22 — рабочая область по макету: усилить центральную сцену, упростить панели и убрать дублирующий CRUD кампаний без потери уже готовых инструментов.

## Основные затронутые области

- `src/main/projects/CampaignExportPlanner.ts`
- `src/main/projects/projectPackageContracts.ts`
- `src/main/projects/ProjectTransferService.ts`
- `src/main/ipc/storageIpc.ts`
- `src/preload`
- `src/renderer/pages/ProjectStartPage.tsx`
- `src/renderer/stores/useCampaignsStore.ts`
- `src/shared/types/projectTransfer.ts`
- `docs/ROADMAP.md`
- `docs/ARCHITECTURE.md`
- `docs/USER_GUIDE.md`

## Следующие риски

- Перестройка рабочей области не должна ослабить keyboard/focus accessibility готовых панелей.
- Центральная сцена должна оставаться usable на 1366x768 и при открытых боковых инструментах.
- Удаление дублирующего campaign CRUD нельзя смешивать с изменением persistence contract.
- Возврат к списку проектов обязан сохранить выбранные campaign и scene.
