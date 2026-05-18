# Desktop Integration Plan (Floci UI)

## Summary

Build a desktop app that launches the **full Next.js Floci UI** (including existing server route handlers) inside a native shell, while still connecting to an externally running backend runtime.

Chosen direction for this plan:
- Backend model: Connect Only
- UI hosting: Full Next.js app (App Router + route handlers)
- Packaging target: Internal unsigned builds

This means desktop becomes a native wrapper that starts the existing Next.js server locally and loads it in a desktop webview.

## Implementation Changes

- Create a desktop workspace (Tauri recommended) with:
  - Webview frontend that points to a local Next.js server URL.
  - Native launcher process that starts/stops the bundled Next.js server.
- Keep existing Next.js server route handlers as the API boundary:
  - `/floci/*`
  - `/healthz`
  - `/api/version-manifest`
  - `/api/lambda-source/[name]`
- Do **not** reimplement proxy/control behavior in Rust for v1.
- Ensure desktop runtime can provide server env config at launch time:
  - `FLOCI_ORIGIN`
  - `FLOCI_ENABLED_SERVICES`
  - `VERSION_MANIFEST_URL`
  - `FLOCI_LOCAL_DATA_PATH` (optional)
- Add desktop runtime config surface:
  - Backend origin, enabled services, optional lambda data path, manifest URL.
  - Persist config locally in desktop settings and map to env on Next.js startup.
- Build pipeline updates:
  - Build standalone production Next.js server artifact for desktop bundling.
  - Package desktop app + Next.js server artifact together.
  - Produce internal unsigned installers/artifacts for target OSes in CI.

## Public Interfaces / Contract Changes

- Preserve current app-local HTTP interface exactly (no endpoint shape changes):
  - `GET /healthz`
  - `GET /api/version-manifest`
  - `GET /api/lambda-source/:name`
  - `/floci/*` proxy behavior
- Keep payload shapes backward-compatible with existing UI expectations.
- Add desktop config schema (stored locally) for:
  - `backendOrigin`
  - `enabledServices`
  - `versionManifestUrl`
  - `lambdaSourcePath` (optional)

## Test Plan

- Unit tests:
  - Desktop launcher process lifecycle (start/stop/restart) for Next.js server.
  - Config-to-env mapping validation.
  - Port allocation and conflict handling.
- Integration tests:
  - Desktop app starts, bundled Next.js server starts, webview loads app.
  - Existing Next routes (`/healthz`, `/api/version-manifest`, `/floci/*`) function unchanged.
  - Service pages can list/create/read through existing proxy routes against running Floci backend.
- E2E scenarios:
  - Backend available: full happy-path for SQS/Lambda/CloudWatch pages.
  - Backend unavailable: deterministic error states in UI and route responses.
  - Misconfigured backend origin: clear failure and recoverable config update flow.
- Build verification:
  - CI produces unsigned desktop artifacts and validates launch smoke test.

## Assumptions and Defaults

- Backend runtime is managed externally and must already be running.
- No backend container orchestration is included in desktop v1.
- Desktop bundles and runs a production Next.js server locally.
- Existing UI behavior, route handlers, and API payload shapes are preserved.
- Initial release focuses on internal distribution quality over signing/notarization.
