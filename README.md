# Places

A personal atlas for visits, places lived, study, work, and trip memories. React 18, Leaflet, Globe.gl, and a Cloudflare Worker. Data stays in the browser unless optional cloud sync is explicitly configured.

## Run and verify

Requires Node.js 22+ and npm.

```sh
npm ci
npm test
npm run dev
```

`npm run dev` uses Wrangler and builds the browser assets automatically. `npm run build` compiles JSX ahead of time and bundles the locked dependencies, including one shared Three.js version. The browser does not fetch executable libraries from unpinned CDNs or compile JSX. Earth textures are local files; basemap tiles and geocoding still require an internet connection.

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
- Multiple local profiles and combined view; per-user places, event types, dates, notes, and tags.
- Country/continent grouping, search, editing, removal, backup export and merge import.
- Existing localStorage keys and versioned JSON contracts. Saved data, including an intentionally empty atlas, takes priority over starter events.
- Optional existing KV state API; cloud sync remains disabled.

## Verification scope

`npm test` covers API validation/failures/success with mocked provider calls, the real React application's startup and state handlers (with map renderer doubles), existing data preservation, profiles, search, tool navigation, backup merging, parser context, removal, and empty-atlas reload. These are **not** browser, live-provider, or WebGL end-to-end tests.

Before merging, visually check desktop and narrow mobile layouts, globe rotation and selection, 2D map tiles and themes, connection modes, importing a city, editing a memory, and exporting/reimporting a backup. Check graceful 2D fallback on a device without WebGL.

## Operational limits retained from the prototype

- Local browser storage is the primary store. Profiles are not authenticated user accounts. Back up before moving devices or clearing site data.
- The optional `/api/state` uses a space key, not authentication, and falls back to ephemeral Worker memory without KV. **Do not enable it for private data until authentication, authorization, and durable storage are added.** No cloud data was read or altered for this change.
- The AI endpoint is publicly callable. Same-origin checks prevent browser cross-origin use but are not authentication. Before making paid AI widely available, configure server-side authentication/rate limits and provider spend controls.
- Geocoding and tile services remain external dependencies. No API key is required by the current geocoders.

See [AUDIT.md](AUDIT.md) for the observed production issues and [ARCHITECTURE.md](ARCHITECTURE.md) for the existing data model.
