# Places audit — 2026-10-15

## What is deployed

- Repository: `SaboorAI/Places`; main commit `48f9a0b2836d8ecc9abb61bdf4ce6ddea62dea03` (`codex`, March 16, 2026).
- Live URL inspected: `https://places.msaboormalik.workers.dev/`.
- Downloaded live `/src/app.js` matched main byte-for-byte. The browser exposed the same controls and seeded model (10 events, 7 countries, Saboor profile).
- Main's Wrangler Worker name was `places-life-map`. The separate `update_worker_name_to_places` branch, commit `034bd85`, corrects the name to `places`.
- The exact deployed Worker revision, connected production branch, secret settings, and Cloudflare build history could not be established through GitHub alone. A matching JavaScript asset does not prove the backend revision.

## Confirmed failures

1. `POST /api/chat` with `{"message":"Japan"}` returned `{"ok":false,"error":"Server missing ANTHROPIC_API_KEY secret"}`. The UI reduced that to a generic retry message. This is missing Worker configuration, not evidence of an expired key.
2. Browser console: `Uncaught TypeError: s3.Timer is not a constructor` from unpinned `https://unpkg.com/globe.gl`, alongside a multiple-Three.js warning. The page permanently displayed the globe-loading fallback. Source mixed fixed Three.js 0.160.0 with a floating Globe.gl bundle.
3. Fresh browser initially selected `user_local` (Me) while starter places belonged to `user_saboor`. The page showed zero places despite loading ten events.
4. Source used `claude-3-5-sonnet-20241022`, retired by Anthropic. This would remain a separate blocker after adding the missing key. Reference: https://platform.claude.com/docs/en/about-claude/model-deprecations

5. Cloudflare branch preview revealed CARTO raster tiles rendering “API KEY REQUIRED”. Dark/light layers now use the canonical OpenStreetMap tile URL with local CSS styling, preserved attribution and browser caching.

## Changes

- Locked npm dependency graph; production esbuild bundle; one shared Three.js; locally served globe textures; no runtime Babel or executable CDN dependencies.
- Map error boundary with usable 2D fallback for WebGL initialization failures.
- Select configured starter profile only on fresh storage; preserve prior selections and saved places, including an intentionally empty collection.
- Professional dark atlas layout, soft sage accents, serif map title, prominent scoped statistics, persistent profile selector, direct globe/map toggle, and focused Places/Import/Guide/Settings tools.
- Guide readiness indicator and understandable errors; bounded request bodies/messages, timeout handling, same-origin browser requests, sanitized upstream errors, configurable supported model.
- Worker name aligned with existing URL; explicit API routing; build provenance file and setup instructions.

## Verification and limits

Production browser inspection and the missing-secret request were read-only checks except for a short travel-guide question. No saved travel data or live Worker configuration was changed.

Production build, Node tests, and Wrangler dry-run packaging are the automated gates. The React tests replace map renderers and provider calls with test doubles. The local preview was unreachable, but the connected Cloudflare build generated a working branch preview. Desktop layout, startup profile, map fallback, and map settings were inspected there. This browser reports WebGL disabled; real 3D rendering and mobile-device checks remain unverified. A real AI response also requires the owner's Cloudflare secret and provider access. Keep this as a draft until those checks are complete.

## Next feature sequence

After visual review and deployment verification: timeline/year filtering; richer trip views; then authenticated durable sync if cross-device use is needed. Preserve the existing user/event identifiers and backup format during that work.
