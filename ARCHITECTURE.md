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

## Cloud API and memory

`worker/atlas.js` exports SQLite-backed `AtlasStore`, provisioned by the Wrangler binding and migration. GET and PUT `/api/atlas` require the private bearer key. POST `/api/atlas/unlock` validates the key. Legacy `/api/state` returns 410.

No backup is bundled or committed. The owner imports travel data using the authenticated API. Only the authentication verifier lives in `worker/owner-key.js`. The first authorized read initializes empty durable storage; saved cloud state takes precedence forever after, including empty state. PUT atomically checks revision and saves the previous state.

`public/src/atlasSync.js` handles autosave, offline changes, three-way reconciliation, and conflicts. A first connection adds the cloud collection to local memories. Later connections respect deletions. Conflicting edits are preserved locally and require explicit resolution. The raw key and cached places are browser-local; Lock cloud access removes the key only. Backup export remains available.

The old JSON data loader is disabled. Existing historical starter files remain for reference but are not imported into fresh atlases. New installations show a private-atlas unlock prompt rather than fabricated starter events.
