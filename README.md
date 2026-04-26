# Floci UI

Next.js + shadcn UI for exploring SQS and S3 resources from local `floci`.

## Stack

- Next.js (App Router)
- TypeScript
- Tailwind CSS
- shadcn/ui components
- Route-handler proxy for Floci (`/floci/*`)

## Local Development

1. Ensure Floci is running (default `http://localhost:4566`).
2. Install dependencies:

```bash
npm install
```

3. Start dev server:

```bash
npm run dev
```

4. Open `http://localhost:4173`.

## Runtime Configuration

- `FLOCI_ORIGIN` (server env): proxy upstream target for `/floci` (default `http://localhost:4566`)
- `PORT` (server env): runtime port for `next start` / Docker (default `4173`)
- `NEXT_PUBLIC_FLOCI_SQS_ACCOUNT_ID` (client env): SQS account ID fallback (default `000000000000`)
- `NEXT_PUBLIC_FLOCI_SQS_POLL_MS` (client env): SQS poll interval in ms (default `5000`)

## Endpoints

- `GET /healthz` returns `{ ok: true, flociOrigin }`
- `/floci/*` proxies to `FLOCI_ORIGIN`

## Build

```bash
npm run build
npm run start
```

## Docker

Build:

```bash
docker build -t floci-ui:local .
```

Run:

```bash
docker run --rm -p 4173:4173 -e FLOCI_ORIGIN=http://host.docker.internal:4566 floci-ui:local
```
