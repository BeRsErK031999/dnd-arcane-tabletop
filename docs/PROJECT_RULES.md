# Project Rules

## Scope

- The app is a local Windows desktop application for running D&D sessions at one table.
- Do not turn the project into an online service or a Roll20 clone.
- Do not add backend servers, account systems, cloud sync, online player connections, marketplace features, web versions, or mobile versions.

## Architecture

- Keep Electron main, preload, renderer, shared types, and storage concerns separated.
- Store campaigns through `StorageService`; the current implementation is JSON-based and must remain replaceable by SQLite later.
- Keep campaign files local. In development they live under `data/campaigns`.
- Do not add SQLite in the first stage.
- Do not add extra dependencies without a clear local desktop need.

## Type Safety

- All domain entities must be typed in `src/shared/types`.
- IPC payloads must use shared types.
- Avoid untyped `any` and ad-hoc JSON structures.

## Development Flow

- Implement one stage at a time.
- Preserve working architecture before adding features.
- Run lint, typecheck, tests, and relevant build/dev checks before committing.
- Keep debug code, temporary comments, and local-only artifacts out of commits.
