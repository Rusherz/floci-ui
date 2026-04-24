# Floci UI

Basic browser UI for navigating SQS and S3 resources from local `floci`.

## Start

1. Ensure Floci is running on `http://localhost:4566`.
2. Start the UI server:

```bash
cd floci-ui
node server.js
```

Override example:

```bash
cd floci-ui
FLOCI_ORIGIN=http://localhost:9999 PORT=4174 node server.js
```

3. Open:

- `http://localhost:4173`

The server proxies `/floci/*` to `http://localhost:4566`, so browser CORS is avoided.

## S3 Navigation

- Objects panel is now prefix-based (folder navigation), not full-bucket dump
- `Up` and breadcrumb path support step-by-step traversal
- Selected file supports `Open` and `Delete` actions

## SQS Polling

- Messages auto-poll every 5 seconds for the selected queue
- Progress bar under `Messages` shows time until next poll
- `Pause`/`Resume` button toggles polling
- Optional override: `window.FLOCI_SQS_POLL_MS`

## Verified Endpoints (No Auth)

The UI uses these real Floci-compatible AWS endpoints (XML):

- `POST /` with form body `Action=ListQueues&Version=2012-11-05`
- `POST /` with form body `Action=ReceiveMessage&QueueUrl=...&MaxNumberOfMessages=10&Version=2012-11-05`
- `GET /` (S3 ListBuckets)
- `GET /{bucketName}?list-type=2&max-keys=200` (S3 ListObjectsV2)

## Optional Overrides

- `FLOCI_ORIGIN` env var for proxy target (default `http://localhost:4566`)
- `PORT` env var for UI port (default `4173`)
- `window.FLOCI_API_BASE_URL` in browser if you want to bypass proxy manually
- `window.FLOCI_SQS_ACCOUNT_ID` (default `000000000000`)

## Docker

Build locally:

```bash
docker build -t floci-ui:local .
```

Run locally:

```bash
docker run --rm -p 4173:4173 -e FLOCI_ORIGIN=http://host.docker.internal:4566 floci-ui:local
```

## Image Publishing

A GitHub Actions workflow publishes images to GHCR:

- Workflow: `.github/workflows/publish-image.yml`
- Image: `ghcr.io/rusherz/floci-ui`
- Triggers: pushes to `main`, tags starting with `v`, and manual dispatch
- Runner: self-hosted (Docker must be installed and available to the runner user)
