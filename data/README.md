# Data Layer

This folder contains both structured JSON entities and runtime config.

## JSON entities
- `cities.json`
- `users.json`
- `trips.json`
- `locationEvents.json`
- `schemas/*.schema.json` (optional validation contracts)

`locationEvents.json` is the timeline core:
- `type` (`visit`, `lived`, `studied`, `work`)
- `startDate` and `endDate`
- optional `tripId`, `tags`, `notes`

## Config files
- `app-data.js`: parser/import/geocoder tuning, event bootstrap settings, visual grouping colors.
- `user-data.js`: local storage keys, migration keys, and user defaults.

`app-data.js` also controls cloud sync behavior:
- `cloudSync.enabled`
- `cloudSync.apiBase`
- `cloudSync.defaultSpaceKey`
- `cloudSync.autoLoadOnStart`
- `cloudSync.autoSync`

## Typical edits before going live
- Replace sample rows in JSON files with your own production data.
- Tune data bootstrap behavior in `app-data.js`:
  - `dataModel.seedFromEventsOnEmpty`
  - `dataModel.mergeWithLocal`
  - `dataModel.eventUserId`
- Tune importer behavior in `app-data.js`:
  - `importer.requestDelayMs`
  - `importer.autoApproveScore`
  - `importer.nominatimMinIntervalMs`
