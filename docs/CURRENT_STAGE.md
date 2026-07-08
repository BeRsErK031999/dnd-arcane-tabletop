# Current Stage

## Текущий этап

Этап 14. Автосохранение, undo/redo, backup.

Статус: выполнено в этом этапе.

## Цель

Добавить локальный контур сохранности кампаний: debounced autosave раз в несколько секунд после изменений, видимый статус сохранения для мастера, простую историю undo/redo и ротацию 1-2 backup-копий JSON-файла.

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
- Manual combat tracker и public initiative overlay.

## Что можно использовать

- `JsonStorageService.saveCampaign`.
- `useCampaignsStore` как единый слой campaign mutations.
- `desktopApi.storage.saveCampaign`.
- `desktopApi.playerScreen.updateState`.
- Browser fallback storage для renderer smoke checks.

## Пробелы этапа

- JSON-файл кампании перезаписывался без backup-копии.
- Мастер видел только общий storage status, но не видел dirty/autosave/error состояние.
- Campaign mutations не имели общей истории undo/redo.
- При серии быстрых изменений не было отдельного debounced autosave-индикатора.

## Что реализовано

- `JsonStorageService` перед перезаписью кампании вращает две backup-копии в `data/campaigns/.backups`.
- Backup-файлы не попадают в `listCampaigns`, потому что лежат вне верхнего уровня campaign JSON.
- `useCampaignsStore` добавляет `CampaignSaveState`: `idle`, `dirty`, `saving`, `saved`, `error`, время последнего сохранения и текст ошибки.
- После изменений выбранной кампании store ставит dirty state и запускает autosave timer на 3.5 секунды.
- На закрытие renderer выполняется финальный flush текущего campaign snapshot.
- Store ведет ограниченную историю snapshots и экспортирует `undoSelectedCampaign` / `redoSelectedCampaign`.
- Undo/redo восстанавливают campaign snapshot, сохраняют JSON и синхронизируют `playerScreenState`.
- Master UI показывает Stage 14 save badge, autosave status, время последнего сохранения, счетчики Undo/Redo и кнопки управления историей.
- Unit test проверяет ротацию двух backup-копий и отсутствие backup-файлов в списке кампаний.

## Критерии готовности

- Изменения кампании сохраняются через общий status-aware save pipeline.
- Autosave status виден мастеру.
- Ошибка сохранения становится видимой в master UI.
- Undo/redo доступны для основных campaign mutations.
- Backup rotation хранит только две последние копии.
- Backup не засоряет список кампаний.
- `npm run lint` проходит.
- `npm run typecheck` проходит.
- `npm run test` проходит.
- `npm run dev:renderer` запускается.
- Master autosave/undo UI проверен в browser route.

## Не входит в этап

- Cloud version history.
- Collaborative history.
- Полноценный diff viewer между версиями.
- Recovery UI для ручного выбора backup-файла.
- Смена JSON storage на SQLite или другую базу.

## Следующий этап

Этап 15. Полировка и exe-сборка.

Он не начат.

## Риски и меры

- Риск повреждения JSON при аварийном завершении: перед перезаписью хранится до двух предыдущих копий файла.
- Риск слишком частых записей: UI autosave использует debounce 3.5 секунды, а текущие прямые сохранения сохранены как страховка от потери данных.
- Риск роста истории в памяти: undo history ограничена последними 30 snapshots.
- Риск рассинхронизации player screen при undo/redo: восстановленный snapshot синхронизирует `playerScreenState` через существующий typed player API.
