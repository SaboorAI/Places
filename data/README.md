# App Data Folder

This folder contains editable app/user config so deployment is easier to manage.

## Files
- `app-data.js`: Runtime tuning for importer/parser/geocoder and continent color/group behavior.
- `user-data.js`: User-owned storage keys, legacy migration keys, and optional starter user defaults.

## Typical edits before going live
- Tune importer behavior in `app-data.js`:
  - `importer.requestDelayMs`
  - `importer.autoApproveScore`
  - `importer.nominatimMinIntervalMs`
- Set list grouping colors in `continents.colors`.
- Keep user data persistence separate with `USER_STORAGE_KEYS` (places, input draft, filter, preferences).
- Keep starter data empty for production (`USER_DEFAULTS.initialPlaces = []`).

The runtime logic stays in `/Users/alienship/Documents/Playground/app.js`.
