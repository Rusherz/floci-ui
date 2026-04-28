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
