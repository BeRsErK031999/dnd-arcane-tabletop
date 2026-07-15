# D&D Arcane Tabletop

Локальное desktop-приложение для мастера D&D. Мастер работает в основном окне, а экран игроков готовится как отдельное Electron-окно для второго монитора, телевизора или проектора.

Проект не является онлайн-сервисом: здесь нет backend, аккаунтов, облака, web-версии, мобильной версии и сетевого подключения игроков.

## Stack

- Electron
- React
- TypeScript
- Vite
- JSON-файлы для локального хранения кампаний
- electron-builder для Windows exe-сборки

## Scripts

```bash
npm install
npm run dev
npm run lint
npm run typecheck
npm run test
npm run build
npm run dist:win
```

`npm run dev` запускает Vite renderer и Electron master window. `npm run dist:win` собирает Windows installer через electron-builder и локальный `node_modules/electron/dist`.

## Structure

```text
src/
  main/
    windows/      Electron windows
    ipc/          IPC handlers
    storage/      StorageService and JSON implementation
  preload/        Secure bridge between Electron and renderer
  renderer/
    app/          React entrypoint and styles
    features/     Feature modules
    pages/        Screen-level React pages
    services/     Renderer service adapters
    shared/       Renderer-local shared helpers
    stores/       Client state hooks
    widgets/      Reusable app widgets
  shared/
    constants/    Shared constants and IPC channel names
    types/        Campaign, Scene, Token, Asset, CharacterCard, Note, CombatState, PlayerScreenState
data/
  campaigns/      Development JSON campaign files
docs/
  PROJECT_RULES.md
  USER_GUIDE.md
```

## Storage

The app uses a `StorageService` interface. The first implementation is `JsonStorageService`, which reads and writes campaign JSON files. This keeps persistence replaceable later without rewriting renderer features or IPC contracts.

By default, development campaign files are stored in:

```text
data/campaigns
```

In a packaged build the storage directory is resolved from Electron `userData`. The master UI can switch the active project folder or save the currently opened campaign into a selected local folder; backups are stored in `.backups` inside that active folder.

## User Guide

Основная инструкция пользователя и сборки лежит в [docs/USER_GUIDE.md](docs/USER_GUIDE.md).

Актуальный продуктовый план по требованиям `TRP game builder.docx` находится в [docs/ROADMAP.md](docs/ROADMAP.md). Выполненные технические этапы 0-15 сохранены там же как архив.

## Local Verification

1. Run `npm install`.
2. Run `npm run lint`.
3. Run `npm run typecheck`.
4. Run `npm run test`.
5. Run `npm run build`.
6. Run `npm run dist:win`.
7. Run `npm run dev`.
8. Confirm that the master window opens and shows the master dashboard.
