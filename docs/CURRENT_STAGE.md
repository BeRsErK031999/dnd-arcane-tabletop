# Current Stage

## Текущий этап

Этап 10. Карточки персонажей, NPC и монстров.

Статус: выполнено в этом этапе.

## Цель

Дать мастеру простые карточки персонажей, NPC и монстров без полноценного character sheet и rules automation: имя, тип, краткое описание, HP/AC/initiative, портрет, заметки и связь карточки с токеном на карте.

## Уже реализовано до начала этапа

- Electron + React + TypeScript + Vite scaffold.
- Master/player desktop shell.
- Typed IPC для player screen.
- JSON campaign storage.
- Campaign CRUD.
- Scene creation, active scene switching и scene preview для player screen.
- Local image asset import and map binding.
- Stage 6 canvas state, layer stack and player-visible canvas projection.
- Stage 7 grid settings, viewport, measurements and player projection.
- Stage 8 asset library, tags, search, asset preview and asset-backed canvas objects.
- Stage 9 object selection, movement, duplicate/hide and master-only token state.

## Что можно использовать

- `Campaign.characterCards`.
- `CharacterCard`.
- `Scene.canvas.objects`.
- `SceneCanvasObject.assetId`.
- `SceneCanvasObject.isPlayerVisible`.
- `SceneCanvasObject.tokenState`.
- `SceneGrid.snapToGrid`.
- `createPlayerSceneCanvasProjection`.
- `desktopApi.storage.saveCampaign`.
- `desktopApi.playerScreen.updateState`.

## Пробелы этапа

- Правый раздел "Персонажи" оставался заглушкой без сохранения данных.
- `CharacterCard` не различал player/NPC/monster и не имел timestamps для безопасной гидрации старых JSON campaigns.
- Токен мог хранить HP/AC/заметку, но не мог ссылаться на отдельную карточку персонажа.
- Удаление будущей карточки не очищало бы ссылку из размещенных токенов.

## Что реализовано

- `CharacterCard` получил тип `player | npc | monster`, краткое описание, timestamps и простые боевые поля.
- `characterCardFactory` создает, обновляет, сортирует и гидрирует карточки, нормализует HP/AC/initiative и валидирует портреты только из `portrait`/`token` ассетов.
- Удаление карточки очищает `tokenState.characterCardId` у объектов сцен и сохраняет остальное состояние токена.
- `useCampaignsStore` добавил create/update/delete операции для карточек через существующий JSON storage pipeline.
- `MasterDashboardPage` показывает рабочую панель "Персонажи" с формой создания/редактирования, списком карточек и быстрым preview.
- `SceneCanvas` позволяет привязать выбранный token object к карточке через master-only поле `tokenState.characterCardId`.
- `sceneCanvasFactory` и `sceneToolsFactory` сохраняют связь карточки с токеном при нормализации token state.
- Player projection по-прежнему не получает raw `tokenState`, поэтому заметки и ссылки карточек остаются на стороне мастера.
- Unit tests покрывают нормализацию карточек, update/delete flow, очистку token links и защиту player projection от `tokenState`.

## Критерии готовности

- Карточки player/NPC/monster создаются из правой панели и сохраняются в campaign JSON state.
- Карточку можно выбрать, отредактировать и удалить.
- Простые поля HP, max HP, temporary HP, AC и initiative нормализуются без rules automation.
- Карточка может ссылаться на portrait/token asset.
- Token object может ссылаться на карточку через `tokenState.characterCardId`.
- Удаление карточки очищает ссылки из токенов.
- Player projection не содержит `tokenState`.
- `npm run lint` проходит.
- `npm run typecheck` проходит.
- `npm run test` проходит.
- `npm run dev` запускается.
- Master card flow проверен в browser route.

## Не входит в этап

- Полноценный character sheet.
- Автоматические атаки, заклинания, spell slots, inventory и D&D rules engine.
- Импорт из D&D Beyond или сторонних character builders.
- Расчет модификаторов и проверок.
- Drag-and-drop перемещение мышью.
- Multi-select и массовые операции.
- Fog of war.

## Следующий этап

Этап 11. Туман войны.

Он не начат.

## Риски и меры

- Риск утечки мастерских заметок игрокам: связь карточки хранится только в `tokenState`, а `PlayerSceneCanvasProjection` не включает это поле.
- Риск сломать старые JSON campaigns: отсутствующие поля карточек гидрируются с безопасными defaults и timestamps.
- Риск невалидных portrait links: фабрика принимает только assets с kind `portrait` или `token`.
- Риск слишком рано перейти к character sheet: Stage 10 ограничен простыми карточками и явно не добавляет rules automation.
