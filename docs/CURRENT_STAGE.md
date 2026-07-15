# Current Stage

## Текущий этап

Этап 17. Контракты гибридного хранилища.

Статус: выполнено и проверено.

## Основание

Целевая модель: большая внешняя библиотека индексируется без массового копирования, выбранные ассеты переходят в managed store по SHA-256, а кампания экспортируется автономным `.arcane-campaign` пакетом.

## Реализовано в этапе 17

- Добавлены typed contracts для library source, indexed asset, managed blob и campaign binding.
- `Asset.storageRef` разделяет embedded, legacy file и managed references.
- `Asset.exportPolicy` готовит выбор дополнительных ассетов для будущего умного экспорта.
- Legacy `file:`/`data:` ссылки lossless мигрируются при чтении и записи campaign JSON.
- Новые локальные импорты сразу получают `legacy-file` reference.
- `CampaignAssetResolver` разрешает runtime URL через `ManagedAssetStore` и валидирует SHA-256.
- Content-addressed путь стабильно строится как `objects/<2>/<2>/<sha256>.<ext>`.
- Добавлены service boundaries `AssetIndexService`, `ManagedAssetStore` и `CampaignAssetResolver`.
- SQLite schema version 1 создаёт sources, indexed assets и tags.
- SQLite schema version 2 создаёт managed blobs и campaign asset bindings.
- Migration runner применяет версии транзакционно, использует `PRAGMA user_version` и выполняет rollback при ошибке.
- Portable export удаляет legacy absolute path из `storageRef` и восстанавливает новый локальный reference после импорта.

## Архитектурное решение по SQLite

Текущий Node 20 runtime не предоставляет `node:sqlite`. На этапе 17 не добавляется native addon, который потребовал бы разные ABI-сборки для Node tests и Electron. DDL и migration runner отделены от драйвера небольшим adapter-контрактом. Конкретный SQLite driver подключается на этапе 18 вместе с background indexer.

## Критерии готовности

- Legacy campaign JSON остаётся читаемым и не теряет исходные пути.
- Managed reference не содержит absolute source path.
- Некорректный SHA-256 и отсутствующий blob возвращают typed failure.
- SQLite DDL проходит syntax и foreign-key проверку.
- Миграции применяются последовательно и откатываются при ошибке.
- `npm run lint`, `npm run typecheck`, `npm run test`, `npm run build` проходят.
- Git diff не содержит временных файлов и исходный Word не попадает в commit.

## Следующий этап

Этап 18 — подключение папок, реальный SQLite adapter, background indexer, метаданные изображений и дисковые превью.

## Затрагиваемые области

- `src/shared/types/asset.ts`
- `src/shared/types/assetStorage.ts`
- `src/shared/assetStorage.ts`
- `src/main/assets/hybridStorageContracts.ts`
- `src/main/assets/CampaignAssetResolver.ts`
- `src/main/assets/catalog/assetCatalogMigrations.ts`
- `src/main/storage/JsonStorageService.ts`
- `src/main/projects/ProjectTransferService.ts`
- `docs/ROADMAP.md`
- `docs/ARCHITECTURE.md`

## Риски и меры

- Риск сломать legacy renderer: `filePath` сохраняется до этапа managed-store migration.
- Риск утечки absolute path в export: portable rewrite удаляет `legacy-file storageRef`.
- Риск дублирования blob: SHA-256 является primary key каталога и частью managed reference.
- Риск случайного удаления общего файла: FK использует `ON DELETE RESTRICT`; garbage collection остаётся отдельной операцией этапа 20.
- Риск несовместимого каталога: приложение отказывается открывать schema version новее поддерживаемой.
