# App Data Folder

This folder contains editable app data/config so deployment is easier to manage.

## Files
- `app-data.js`: Place parsing aliases, map style config, continent color mapping, and orbital defaults.
- `user-data.js`: User-owned storage keys, legacy migration keys, and optional starter user defaults.

## Typical edits before going live
- Add or fix city/country aliases in `PLACE_ALIASES` and `COUNTRY_ALIASES`.
- Adjust map tile providers in `MAP_STYLE_CONFIG`.
- Tune orbital defaults (`ORBITAL_*`) and colors (`CONTINENT_COLORS`).
- Keep user data persistence separate with `USER_STORAGE_KEYS` (places, input draft, filter, preferences).
- Set starter imported places in `USER_DEFAULTS.initialPlaces` if desired.

The runtime logic stays in `/Users/alienship/Documents/Playground/app.js`.
