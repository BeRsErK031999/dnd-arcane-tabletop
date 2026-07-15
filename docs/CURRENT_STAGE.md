# Current Stage

## Текущий этап

Этап 20. Управляемое SHA-256-хранилище.

Статус: выполнено и проверено.

## Результат

Гибридная модель хранения теперь работает целиком до границы экспорта: большая внешняя библиотека индексируется без массового копирования, а использованный кампанией файл один раз переносится в управляемое content-addressed хранилище.

## Реализовано в этапе 20

- Добавлен файловый `FileSystemManagedAssetStore` с layout `objects/<2>/<2>/<sha256>.<ext>`.
- Copy-on-use применяется при выборе индексированного ассета и при прямом импорте изображения.
- Staging-файл проверяется по размеру и SHA-256 до атомарной установки.
- Одинаковый контент дедуплицируется между файлами и кампаниями по SHA-256.
- Повреждённый managed blob можно восстановить из доступного индексированного источника.
- SQLite-каталог хранит blob metadata и campaign bindings; legacy references не нарушают managed foreign key.
- Сохранение, импорт и удаление кампании синхронизируют полный набор ссылок.
- Загрузка кампании разрешает managed references в runtime `fileUrl` без внешнего absolute path.
- При недоступной внешней папке уже сохранённый blob продолжает открываться и может повторно использоваться.
- Asset Manager получил явную двухшаговую очистку: preview, подтверждение, повторная проверка ссылок и отчёт.

## Инварианты безопасности

- Renderer не строит путь managed blob и не получает путь staging-каталога.
- Файл не публикуется, пока его checksum не совпал с индексом.
- Garbage collection никогда не удаляет blob с актуальной campaign binding.
- Preview-план одноразовый; устаревший или повторно использованный token отклоняется.
- Ошибка удаления физического файла восстанавливает запись blob в каталоге.
- Автоматическая очистка при старте или сохранении не выполняется.

## Критерии готовности

- Два одинаковых файла дают один стабильный managed path.
- Кампания работает после удаления исходного файла из подключённой папки.
- Изменившийся после индексации источник возвращает typed failure.
- Ссылка, добавленная после preview очистки, защищает blob от удаления.
- Legacy и managed campaign assets совместно сохраняются и загружаются.
- `npm run lint`, `npm run typecheck`, `npm run test`, `npm run build` и `npm run dist:win` проходят.
- Исходный Word и его временный lock-файл не входят в commit.

## Следующий этап

Этап 21 — умный автономный экспорт: вычисление реально используемых и явно выбранных ассетов, preview состава пакета, manifest с SHA-256 и импорт с дедупликацией непосредственно в managed store.

## Основные затронутые области

- `src/main/assets/FileSystemManagedAssetStore.ts`
- `src/main/assets/AssetLibraryService.ts`
- `src/main/assets/AssetImportService.ts`
- `src/main/assets/catalog/SqlJsAssetCatalog.ts`
- `src/main/ipc/assetLibraryIpc.ts`
- `src/main/ipc/storageIpc.ts`
- `src/preload`
- `src/renderer/stores`
- `src/renderer/widgets/AssetManagerPanel.tsx`
- `src/shared/types/assetStorage.ts`
- `docs/ROADMAP.md`
- `docs/ARCHITECTURE.md`

## Следующие риски

- Этап 21 должен включать в пакет каждый SHA-256 ровно один раз, даже если на blob ссылаются несколько сущностей.
- Export preview и фактическая запись обязаны использовать один валидируемый manifest contract.
- Импорт пакета должен сначала проверить все пути, размеры и checksums и только затем публиковать blobs и campaign JSON.
- Совместимость с package version 1 нельзя ломать при переходе на managed references.
