# Floci Desktop (Next.js-hosted)

This desktop app wraps the full Floci UI Next.js server in a Tauri shell.

## How it works

- Tauri starts a local Next.js server process.
- Webview loads `http://127.0.0.1:<port>`.
- Existing Next routes remain the API boundary (`/floci/*`, `/healthz`, `/api/version-manifest`, `/api/lambda-source/[name]`).

## Dev

From repo root:

```bash
npm install
```

From `desktop/src-tauri`:

```bash
cargo tauri dev
```

This uses `npm run dev` as the app server.

## Build

1. Build Next.js standalone bundle:

```bash
./desktop/build-next-standalone.sh
```

2. Build desktop package:

```bash
cd desktop/src-tauri
cargo tauri build
```

The build embeds the standalone Next.js runtime under Tauri resources.
