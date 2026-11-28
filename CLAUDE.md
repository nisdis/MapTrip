# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

**Record My Trip** (map.recordmytrip.com, Vercel project `mapx`): a map + GPS trip recorder.
- `src/` — React 18 + Vite + TypeScript + Tailwind single-page app (also a PWA).
- `api/` — Vercel Functions (Web `Request` → `Response` handlers, exported as `GET`/`POST`/`PATCH`/…), Postgres via `pg` (Neon in production), auth via Better Auth (email + password), media in Vercel Blob.
- `mobile/` — Flutter wrapper (Android/iOS) that shows the web app in an InAppWebView and adds background GPS, camera permission, native share. See `mobile/README.md`.
- `server/` — optional local OSRM routing server (India data); not part of the deploy.

The README's "Enabling cloud save" section still describes Supabase; that is stale — cloud save is Better Auth + Postgres (`api/_lib/auth.ts`, `scripts/migrate.mjs`).

## Commands

```bash
pnpm install
pnpm dev                     # Vite; /api is proxied to API_PROXY_TARGET (default :3000)
pnpm lint
pnpm typecheck               # three tsconfigs: app, api, service worker
pnpm test                    # Vitest: tests/unit + tests/api
pnpm build && pnpm test:e2e  # Playwright runs against the *built* app (vite preview)
```

- API tests and e2e tests need Postgres: `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/maptrip_test`. Without it, API tests skip (`hasDb` in `tests/api/helpers.ts`). In the cloud container, start it with `pg_ctlcluster 16 main start`.
- Single test: `pnpm vitest run tests/unit/replay.test.ts` / `pnpm vitest run -t "name"`; `pnpm exec playwright test tests/e2e/media.spec.ts -g "name" --trace off`.
- e2e always needs a fresh `pnpm build` first — it serves `dist/`, so source changes are invisible otherwise.
- Mobile (in `mobile/`): `flutter pub get`, `flutter analyze`, `flutter test`, `flutter build apk --debug`. Version lives in `pubspec.yaml` *and* `lib/config.dart` (`appVersion`) — bump both.
- CI (`.github/workflows/ci.yml`) runs lint, typecheck, Vitest, build, Playwright and the Flutter job; it is advisory (doesn't block).

## Architecture

### Local-first trips, optional cloud
- Trips live in IndexedDB (`src/services/tripStore.ts`, localforage). The app works fully signed-out.
- Signed in, `src/hooks/useTripSync.ts` uploads trips that `needsSync` (never uploaded, new photos, or `renamed`) and pulls the account's trips; `src/services/cloudTrips.ts` is the HTTP layer to `api/trips.ts`. Trips are sent gzipped; the server stores them as `jsonb` in `trips.data`.
- Track points are stored as a compact column table, the same format locally and in the cloud (`api/_lib/trackFormat.ts`). The app works with point objects; convert at the storage boundary (`toStoredTrip` / `fromStoredTrip`).
- Local-only flags (e.g. `renamed`) are stripped before upload.

### Code shared by app and server
`api/_lib/*.ts` modules without server imports (e.g. `trackFormat.ts`, `tripName.ts`, `publicTrip.ts`) are imported by `src/` too, so validation rules exist once. Keep those files free of Node/`pg` imports. Inside `api/`, relative imports use the `.js` suffix (Node ESM on Vercel).

### Database schema
No migration framework: `scripts/migrate.mjs` creates Better Auth's tables and all app tables with idempotent `create … if not exists` / `alter … add column if not exists`. It runs before every Vercel build (`vercel-build`) and in tests (`resetDb()`). New tables must also be added to the `truncate` list in `tests/api/helpers.ts`. Better Auth options in `migrate.mjs` must match `api/_lib/auth.ts`.

### Routing
`vercel.json` rewrites `/t/:id`, `/live/:token`, `/p/:type/:id` to `api/share.ts` (link-preview meta tags, then the SPA). `src/main.tsx` picks the top-level view by path: `/live/<token>` → `LiveViewer`, `/t/<id>` → `TripViewer`, `/u/<id>` → `ProfileViewer`, else `App`. `App.tsx` is the large shell that owns sheets, recorder, trip view and handlers.

### Web ↔ app bridge
`src/services/appBridge.ts` is the protocol (web → app: `flutter_inappwebview.callHandler("rmt", msg)`; app → web: `window.__rmtReceive(msg)`); `mobile/lib/web_shell.dart` is the other side. Inside the app, GPS comes from the app (numbered fixes, acked by `seq`), not the browser. Bridge calls must degrade gracefully on older app versions and in a plain browser (e.g. `askCamera()` resolves "granted" outside the app). The plugin drops camera file-inputs if `CAMERA` is declared but not granted — hence the runtime ask in `MediaPicker`.

### Recording
`useLocationTracking` → `useTripRecorder` (filters jitter/poor accuracy, detects gaps when the page was frozen, fills them via `gapFill`), drafts saved to `draftStore` so an unfinished trip survives a closed tab. `RecorderHud` is the on-screen panel (regular/compact, stored in localStorage).

### Media
Photos/videos are added via `MediaPicker` → `src/services/mediaImport.ts`; videos are re-encoded in the browser with Mediabunny/WebCodecs (`src/services/videoShrink.ts`, lazily imported) to 720p ~5 Mbit/s, falling back to the original. Limits are in `src/utils/media.ts` and mirrored server-side (`api/trips.ts`, `api/photos/upload.ts`) — change both together.

### Service worker
Custom `src/sw/sw.ts` (vite-plugin-pwa `injectManifest`): precaches the app, caches browsed map tiles, keeps saved offline areas (`src/sw/tiles.ts`). It has its own tsconfig (`tsconfig.sw.json`).

## Testing conventions
- API tests call the handlers directly with `Request` objects (`call()`, `signUp()` in `tests/api/helpers.ts`) against a real Postgres.
- e2e (`tests/e2e/`) runs the real `api/` functions via `tests/e2e/api-server.ts`, one worker (shared DB), 390×844 viewport. `fixtures.ts` blocks every non-localhost request (`isolate`) — mock outside services explicitly — and fakes GPS (`fakeGps` + `fix(page, lat, lng, t, speed, alt, accuracy)`). Media fixtures are in `tests/e2e/media/`.
- Usage events are typed in three places (`api/_lib/usage.ts`, `src/services/usage.ts`, `StatsSheet.tsx`); add new events to all.

## Style
User-facing copy and code comments are short, plain English aimed at non-technical people ("Preparing video…", "Couldn't rename it"). Commit subjects follow the same style, describing the user-visible change.
