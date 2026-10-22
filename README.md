# Places

A personal atlas for visits, places lived, study, work, and trip memories. React 18, Leaflet, Globe.gl, and a Cloudflare Worker. Everyone’s collections load from cloud storage, with separate person filters and private editing keys.

## Saboor's persistent atlas

The uploaded 2026-10-19 backup contains **91 entries**. The application preserves those entries, including their original IDs, dates, notes and map matches, and consolidates the empty legacy Me profile into Saboor. Entries are saved records, not independently verified travel history.

### Public viewing and protected editing

Everyone can see all saved places, dates, and notes. Saboor’s existing private key is required to change his records; selecting his name never unlocks editing. The owner-approved `public/data/saboor-atlas.json` contains the original 91 records. It initializes a new shared atlas and provides a first-load offline fallback. Once cloud data has loaded, saved cloud state is authoritative, including owner edits and intentional deletions. Redeploying does not reinsert deleted records or overwrite saved data.

**Add person** creates a separate cloud profile and a random editing key, saved in that browser. Select a person or **Everyone** to filter the list and map; the legend identifies each person’s pin and route color. A person’s key authorizes only their own records. Names are display labels, not authentication.

Settings → **Show editing key** reveals the selected person’s key. Store it privately, then enter it in **Private editing key → Unlock editing** on another device. Lock this person removes its key from the browser. Unsaved changes must be saved or backed up before locking. JSON backups contain places and profiles, never editing keys. Lost keys cannot be recovered from a public profile.

Existing browser-only profiles have an **Enable cloud saving** action. This registers the profile and uploads its local records. An existing shared profile requires its key instead. Importing a backup updates only profiles unlocked in that browser; locked records remain unchanged. Legacy `user_local` / Me still maps to Saboor.

### Persistence

- `/api/community` reads every shared collection publicly. `POST /api/community/people` registers a person; `POST /api/community/unlock` checks a key; `PUT /api/community/people/:id` saves only that person’s records with their bearer key and revision.
- The existing SQLite-backed `AtlasStore` Durable Object and binding are reused. Community state lives in the separate `community-v1` object, with per-person records and revisions. No new Cloudflare binding or migration is needed. Writes transactionally check the revision and retain the previous collection.
- The old private `/api/atlas` and its storage remain available. On the first owner unlock of an unchanged community atlas, the client also reads the legacy collection, merges its records, and saves them to the public cloud atlas. Conflicts preserve local edits for review. Once the new Saboor revision advances, this migration does not run again.
- Edits autosave after a short debounce. Pending edits and the last cloud version are cached locally. Reconnection, Retry sync, window focus, and visible-tab polling refresh shared data. Three-way reconciliation preserves offline additions, edits, and deletions; conflicting edits are kept locally for review. Export a backup before using Reload cloud to discard edits.
- New-profile creation requires cloud connectivity and writable browser storage so an editing key cannot be lost. Offline editing of an already-unlocked profile remains available. Server failures never report a successful cloud save.
- Limits: 200 profiles, 2,000 places per person, and 2 MB per write. Keys are hashed in durable storage, never returned in public reads. Saboor’s key verifier remains in `worker/owner-key.js`; the raw owner key is not committed.

## Run and verify

Requires Node.js 22+ and npm.

```sh
npm ci
npm test
npm run dev
```

`npm run dev` uses Wrangler and builds the browser assets automatically. `npm run build` compiles JSX ahead of time and bundles the locked dependencies, including one shared Three.js version. The 3D engine is a separate module loaded only when using the globe; 2D users avoid that download. The globe pauses rendering in hidden tabs and when offscreen, and respects reduced-motion preferences. The browser does not fetch executable libraries from unpinned CDNs or compile JSX. Earth textures are copied locally from the locked dependency during the build. Dark/light/OSM maps use the canonical OpenStreetMap raster endpoint (dark/light styled with CSS), replacing CARTO tiles that required an API key; basemap tiles and geocoding still require an internet connection.

```sh
npm run build
npx wrangler deploy --dry-run
```

## Existing Cloudflare deployment

The intended Worker name is **places**, matching `places.msaboormalik.workers.dev`. Before deploying, confirm the selected Cloudflare account and the existing Worker's connected repository/production branch. Main previously used `places-life-map`; `update_worker_name_to_places` contains the correction incorporated here.

1. Export a backup from the current app in the browser that holds your places.
2. Install dependencies with `npm ci` (Cloudflare Builds must install dependencies before Wrangler runs).
3. Configure `ANTHROPIC_API_KEY` as a **secret on the places Worker**, not a plain-text variable or repository file. With Wrangler authenticated to the correct account:

   ```sh
   npx wrangler secret put ANTHROPIC_API_KEY --name places
   ```

   Enter the key at the secure prompt, never in a command argument. In the Cloudflare dashboard, use Workers & Pages → places → Settings → Variables and Secrets → Add → Secret.
4. `ANTHROPIC_MODEL` is a non-secret configuration variable in `wrangler.toml`. It defaults to `claude-sonnet-4-6`, replacing the retired `claude-3-5-sonnet-20241022`. Choose a supported model available to your account.
5. After reviewing and testing the branch, use your existing Git build workflow or `npm run deploy`. Do not deploy this branch to production before visual review.
6. Verify `/api/health`, which exposes only capability booleans; `/build-info.json` identifies the built commit. In the app, check the Guide with a short country question. Health indicates secret presence, **not** key validity, provider billing, or model entitlement.

The secret is not included in this repository. Supplying it and verifying a real provider response are required to restore the live AI guide. The map, importer, profiles, search, editing, and backups work independently of AI.

## Functionality retained

- Country/context-aware mixed-note importer; Open-Meteo geocoding with Nominatim fallback, caching, retry logic, review, and unmatched queues.
- 3D globe and Leaflet map; map themes, connection paths, zoom, place details, and selection.
- Saboor plus separate named profiles, per-person or Everyone filters, and consistent person colors on both maps and connection paths; event types, dates, notes, and tags.
- Country/continent grouping, search, editing, removal, backup export and merge import.
- Existing localStorage keys and versioned JSON contracts. Saved data, including an intentionally empty atlas, takes priority over starter events.
- Durable atlas API with owner-authorized writes, revision checks, and offline reconciliation.

## Verification scope

`npm test` covers the Worker APIs, per-person authorization, owner-only Saboor writes, revisions, persistence, public reads without credential leaks, offline reconciliation, profile recovery, React state handlers, parsing, search, backups, and empty collections. Provider calls and map renderers are test doubles in this suite.

`npm run test:browser` runs Chromium against an isolated local Worker with temporary Durable Object storage. Set `CHROMIUM_PATH` if Chromium is not at `/usr/bin/chromium`. It checks layouts at 320, 390, 768, 1024, 1366, and 1920 pixels; creates a person; imports, edits, and autosaves a place; reloads; reads it in a fresh phone browser; restores the editing key; rejects edits to Saboor; and exercises the globe or its 2D fallback. Screenshots go to ignored `test-results/browser/`. External tiles and fonts are blocked for deterministic checks; live imagery, physical-device gestures, and provider billing are not validated by this test.

## Operational limits retained from the prototype

- All shared collections are publicly readable. Private editing keys control writes only; they do not hide saved travel information. Back up pending local changes and retain editing keys before clearing browser storage.
- The legacy `/api/state` endpoint is retired; the atlas never reports ephemeral Worker memory as durable storage.
- The AI endpoint is publicly callable. Same-origin checks prevent browser cross-origin use but are not authentication. Before making paid AI widely available, configure server-side authentication/rate limits and provider spend controls.
- Geocoding and tile services remain external dependencies. No API key is required by the current geocoders.

See [AUDIT.md](AUDIT.md) for the observed production issues and [ARCHITECTURE.md](ARCHITECTURE.md) for the existing data model.

OpenStreetMap tiles use normal browser caching and visible attribution. This is suitable for normal interactive use; do not add bulk downloads, offline prefetching, or cache bypass. For higher traffic, configure an appropriately licensed tile provider. Policy: https://operations.osmfoundation.org/policies/tiles/ .
