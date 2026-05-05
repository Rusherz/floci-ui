# Floci UI

Next.js + shadcn UI for exploring Floci resources across SQS, S3, SNS, DynamoDB, Lambda, EventBridge, Step Functions, SSM, Secrets Manager, and CloudWatch Logs.

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
- `NEXT_PUBLIC_FLOCI_ENABLED_SERVICES` (client env): comma-separated enabled service slugs, or `*` for all. Disabled services are hidden and return `404`.

## Endpoints

- `GET /healthz` returns `{ ok: true, flociOrigin }`
- `/floci/*` proxies to `FLOCI_ORIGIN`

## App Routes

- `/` service overview + element navigation
- `/sqs` SQS service page
- `/s3` S3 service page
- `/sns` SNS service page
- `/dynamodb` DynamoDB service page
- `/lambda` Lambda service page
- `/eventbridge` EventBridge service page
- `/step-functions` Step Functions service page
- `/ssm` SSM Parameter Store service page
- `/secrets-manager` Secrets Manager service page
- `/cloudwatch` CloudWatch Logs service page

## Create Workflows

Create actions are available across S3, SQS, SNS, DynamoDB, Lambda, EventBridge, Step Functions, SSM, Secrets Manager, and CloudWatch Logs.

- Create operations refresh lists after success and attempt to auto-select the new resource.
- Validation is enforced in UI for common name/format rules, then re-validated by Floci/AWS APIs.
- Error messages include friendlier mapping for common failures (already exists, invalid input, access denied, throttling).

### Caveats

- Some services intentionally expose a simplified create form first (for example, no full advanced-option coverage).
- Lambda creation currently expects a ZIP payload upload in the dialog.
- Manual smoke tests for each create flow are still tracked in [`FLOCI_CREATE_WORKFLOWS_PLAN.md`](./FLOCI_CREATE_WORKFLOWS_PLAN.md).

## Build

```bash
npm run build
npm run start
```

## End-to-End Tests (Playwright)

Playwright is configured for create-workflow coverage under `tests/e2e`.

1. Install browser binaries:

```bash
npx playwright install
```

2. Ensure Floci is running (default `http://localhost:4566`).
3. Run the suite:

```bash
RUN_FLOCI_E2E=1 npm run test:e2e
```

Notes:
- Tests are intentionally gated behind `RUN_FLOCI_E2E=1`.
- The suite starts the Next.js app automatically using Playwright `webServer`.
- Override base URL if needed with `PLAYWRIGHT_BASE_URL`.

Precheck workflow:

```bash
npm run precheck
```

## Docker

Build:

```bash
docker build -t floci-ui:local .
```

Build multi-arch (push to registry):

```bash
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  -t ghcr.io/rusherz/floci-ui:latest \
  --push .
```

Run:

```bash
docker run --rm -p 4173:4173 -e FLOCI_ORIGIN=http://host.docker.internal:4566 floci-ui:local
```
