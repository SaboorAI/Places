# Places architecture

`public/src/app.js` owns the React interface, mixed-note importer, per-person filters, and map state. `public/src/communitySync.js` owns public reads, editing capabilities, per-person autosave, cached revisions, offline reconciliation, and key recovery. `atlasSync.js` retains the legacy private client and exports the shared reconciliation function. Existing storage keys and Saboor’s original place IDs are preserved. Other people’s place IDs are scoped with their person ID to keep copied backup records independent in map selection and editing.

`worker/index.js` routes static assets, health, the optional AI guide, and storage APIs. `worker/community.js` handles the public multi-person atlas. `worker/atlas.js` exports the deployed `AtlasStore` SQLite Durable Object class. Paths beginning `/api/community` dispatch to the new handler; private `/api/atlas` behavior remains compatible.

## Durable storage

The existing `ATLAS_STORE` binding is reused. The old `saboor` object keeps the private atlas unchanged. The separate `community-v1` object stores a profile registry under `people`, complete collections under `person:<id>`, and previous versions under `previous:<id>`. A transaction serializes registration and revision-checked writes. There is no ephemeral success fallback and no new migration is required.

Saboor initially reads the approved 91-record JSON unless a saved cloud version exists. A valid owner unlock can migrate legacy cloud records while the new revision is still zero. After a successful owner write, cloud state is authoritative; redeployments do not reset it. The static JSON remains an offline first-load fallback and a publicly accessible original snapshot.

## Identity and ownership

Public GET `/api/community` returns profile metadata and places without keys or key hashes. Registration creates a UUID-based person ID and accepts a cryptographically random browser-generated key. The browser persists the key before registration; the server stores its SHA-256 hash. Each PUT requires that profile’s key, matching place ownership, and the previous revision. Saboor always uses the existing owner verifier. Public profile names, backup files, and changing a filter confer no write access. Keys are bearer capabilities, not login accounts.

The client separates view scope from edit permission. It verifies saved keys before enabling edits, guards mutation handlers and imports, and relies on independent server authorization. Keys can be entered on another device. A local-only legacy profile can be registered if its ID is not already in use. Public registration is bounded; this is a small shared atlas rather than an unbounded identity service.

## Synchronization

`places.community.base.v1` stores per-person cloud baselines; `places.community.keys.v1` stores browser editing keys. Local place storage retains cached public collections and offline changes. A refresh reconciles editable records against their baseline; read-only records follow cloud state. Writes contain one person only. Unrelated offline and remote changes merge, while conflicting edits remain local and block that profile’s upload. Reload cloud explicitly discards pending edits only for unlocked profiles.

Polling runs every 30 seconds only in visible tabs and on focus/reconnection. Unchanged data preserves React state references, avoiding unnecessary map rebuilds and recentering. The UI retains status and retry controls for failed operations.

## Rendering and layout

esbuild generates ESM browser assets and a lazy 3D engine chunk. Leaflet supports map-only sessions without loading WebGL. The globe uses container resizing, capped pixel ratio, visibility-based rendering, reduced-motion rotation, and a usable 2D error fallback. Desktop layout fills the available window, with an independently scrolling panel; phones use document scrolling, larger touch targets, safe-area spacing, and persistent links between map and people.

The old `dataLoader.js` event data path remains available but disabled. Historical reference JSON and schemas are not the shared cloud storage source. The retired `/api/state` endpoint returns 410; the obsolete KV sync UI/configuration has been removed.

## Validation

`npm test` exercises API ownership, persistence and reconciliation plus real React handlers with map doubles. `npm run test:browser` exercises an isolated local Worker and Chromium across six viewport sizes and the cloud-save/recovery flow. Browser screenshots are ignored outputs; external imagery and live AI are outside the deterministic browser test.
