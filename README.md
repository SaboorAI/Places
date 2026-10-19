# Places

A personal atlas for visits, places lived, study, work, and trip memories. React 18, Leaflet, Globe.gl, and a Cloudflare Worker. Saboor’s collection is loaded from durable cloud storage, with local offline edits and owner-authorized cloud access.

## Saboor's persistent atlas

The uploaded 2026-10-19 backup contains **91 entries**. The application preserves those entries, including their original IDs, dates, notes and map matches, and consolidates the empty legacy Me profile into Saboor. Entries are saved records, not independently verified travel history.

### Privacy and access

No travel backup, encrypted backup, or raw access key is committed. Travel data is imported directly through the authenticated API and stays in cloud storage and the owner’s browsers. The private random key unlocks both reads and writes; only its SHA-256 authentication verifier is public. Existing historical starter JSON in the repository predates this change and is no longer loaded by the app.

Open Settings → Private editing key → Unlock atlas. Do this once on each trusted browser. The key and offline places are kept in that browser's localStorage. Lock cloud access removes the stored key, but does not erase locally cached places. Keep the key file private and export backups before clearing browser storage.

### Persistence

- `/api/atlas` uses the SQLite-backed `AtlasStore` Durable Object. Its Wrangler binding and migration provision on deployment to the existing `places` Worker. New storage starts empty. The owner imports a backup or saves places through the authenticated API. Redeployments never overwrite existing state, including an intentionally empty atlas.
- First connection merges existing local memories with the saved collection. `user_local` / Me becomes `user_saboor` / Saboor. Subsequent reloads respect deletions.
- After unlocking, changes save automatically. Offline edits reconcile against the last cloud revision on reconnection or Retry sync. Unrelated edits merge; same-record conflicts block upload and preserve local changes. Export Backup before choosing Reload cloud to discard local differences.
- Writes atomically compare revisions and retain the previous cloud version. The unauthenticated legacy `/api/state` is retired (410). No ephemeral in-memory success fallback exists.
- A new key requires rotating the verifier; never commit the raw key. Browser storage failure can prevent offline recovery, so retain backups.
- App persistence does not automatically synchronize ChatGPT memory.

## Run and verify

Requires Node.js 22+ and npm.

```sh
npm ci
npm test
npm run dev
```

`npm run dev` uses Wrangler and builds the browser assets automatically. `npm run build` compiles JSX ahead of time and bundles the locked dependencies, including one shared Three.js version. The browser does not fetch executable libraries from unpinned CDNs or compile JSX. Earth textures are copied locally from the locked dependency during the build. Dark/light/OSM maps use the canonical OpenStreetMap raster endpoint (dark/light styled with CSS), replacing CARTO tiles that required an API key; basemap tiles and geocoding still require an internet connection.

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
- A single Saboor profile; event types, dates, notes, and tags.
- Country/continent grouping, search, editing, removal, backup export and merge import.
- Existing localStorage keys and versioned JSON contracts. Saved data, including an intentionally empty atlas, takes priority over starter events.
- Durable atlas API with owner-authorized writes, revision checks, and offline reconciliation.

## Verification scope

`npm test` covers API validation/failures/success with mocked provider calls, the real React application's startup and state handlers (with map renderer doubles), existing data preservation, profiles, search, tool navigation, backup merging, parser context, removal, and empty-atlas reload. These are **not** browser, live-provider, or WebGL end-to-end tests.

Before merging, visually check desktop and narrow mobile layouts, globe rotation and selection, 2D map tiles and themes, connection modes, importing a city, editing a memory, and exporting/reimporting a backup. Check graceful 2D fallback on a device without WebGL.

## Operational limits retained from the prototype

- Cloud storage holds the shared atlas. Browser-local changes require the private editing key to upload. Back up pending local changes before clearing site data.
- The legacy `/api/state` endpoint is retired; the atlas never reports ephemeral Worker memory as durable storage.
- The AI endpoint is publicly callable. Same-origin checks prevent browser cross-origin use but are not authentication. Before making paid AI widely available, configure server-side authentication/rate limits and provider spend controls.
- Geocoding and tile services remain external dependencies. No API key is required by the current geocoders.

See [AUDIT.md](AUDIT.md) for the observed production issues and [ARCHITECTURE.md](ARCHITECTURE.md) for the existing data model.

OpenStreetMap tiles use normal browser caching and visible attribution. This is suitable for normal interactive use; do not add bulk downloads, offline prefetching, or cache bypass. For higher traffic, configure an appropriately licensed tile provider. Policy: https://operations.osmfoundation.org/policies/tiles/ .
