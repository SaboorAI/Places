# Personal Life Map Architecture

## Folder Structure

```text
/data
  app-data.js
  user-data.js
  cities.json
  users.json
  trips.json
  locationEvents.json
  /schemas
    cities.schema.json
    users.schema.json
    trips.schema.json
    locationEvents.schema.json

/src
  app.js
  dataLoader.js
  globe.js
  ui.js
```

## Data Model

- `cities`: static city reference rows.
- `users`: user identity + home city.
- `trips`: named trip windows.
- `locationEvents`: timeline facts (`visit`, `lived`, `studied`, `work`) with `startDate`/`endDate`.

The app infers route sequencing from chronological event order.

## Runtime Flow

1. `src/dataLoader.js` loads JSON files from `/data`.
2. It sanitizes and indexes entities.
3. It converts `locationEvents` into map-ready place rows.
4. `src/app.js` seeds/merges these rows into the existing map state.
5. Runtime places are scoped by `userId` (`active user` vs `all users` mode).
6. Globe/panel rendering keeps working with event-aware visuals and per-user ownership.

## Cloud API

- Worker entry: `worker/index.js`
- Endpoint: `GET /api/state?space=<key>`
- Endpoint: `PUT /api/state?space=<key>`
- Storage: Cloudflare KV binding `STATE_STORE`
- Static assets are served by Worker via `ASSETS` binding (`wrangler.toml`).

Deployment quickstart:
1. `npx wrangler kv namespace create STATE_STORE`
2. `npx wrangler kv namespace create STATE_STORE --preview`
3. Put returned IDs into `wrangler.toml` (`id`, `preview_id`)
4. `npx wrangler deploy`

State payload contract:
- `version`
- `updatedAt`
- `users[]`
- `places[]`

## Local Persistence

- `places` are stored in localStorage with normalized `userId`.
- `userDirectory` keeps profile metadata (id/name/color).
- `activeUserId` and `showAllUsers` persist UI context.
- `cloudSync` settings persist UI context (`spaceKey`, `autoSync`).
- Backup portability:
  - `Export Backup` writes a versioned JSON file (`users`, `places`, `preferences`).
  - `Import Backup` merges users and places safely (dedupe by user-aware place key).

## Refactor Path (Prototype -> Scalable)

1. Keep JSON as the source of truth.
2. Keep UI rendering logic separate from data loading/validation.
3. Add timeline filters (year/range) on top of `locationEvents`.
4. Add analytics cards based on computed aggregates.
5. Move persistence to an API while preserving the same data contracts.
6. Suggested production stack: Cloudflare Workers + D1 tables for users/trips/events + optional R2 backups.
