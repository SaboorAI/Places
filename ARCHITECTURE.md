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
5. Globe/panel rendering keeps working with event-aware visuals.

## Refactor Path (Prototype -> Scalable)

1. Keep JSON as the source of truth.
2. Keep UI rendering logic separate from data loading/validation.
3. Add timeline filters (year/range) on top of `locationEvents`.
4. Add analytics cards based on computed aggregates.
5. Later swap static JSON loader with API endpoints (same model).
