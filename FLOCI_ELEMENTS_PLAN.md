# Floci Elements Expansion Plan

This file tracks progress for adding first-class pages for additional Floci elements.

## Status Legend

- `[ ]` Not started
- `[-]` In progress
- `[x]` Done
- `[!]` Blocked

## Current Scope

- Existing: SQS Explorer, S3 Explorer
- Planned:
  - SNS
  - DynamoDB
  - Lambda
  - EventBridge
  - Step Functions
  - SSM Parameter Store
  - Secrets Manager
  - CloudWatch Logs

## Milestones

### Milestone 1: Foundation

- [x] Add service routing structure (`/app/<service>/page.tsx`)
- [x] Extract shared shell/layout from current single-page implementation
- [x] Add shared state/persistence strategy for multi-page navigation
- [x] Define reusable list/detail/action page primitives

### Milestone 2: Priority Services

- [x] SNS page
  - [x] Topics list/search
  - [x] Subscriptions view
  - [x] Publish message action
- [x] DynamoDB page
  - [x] Tables list/search
  - [x] Item explorer
  - [x] Query/scan actions
- [x] Lambda page
  - [x] Functions list/search
  - [x] Test invoke
  - [x] Basic logs view

### Milestone 3: Workflow Services

- [x] EventBridge page
  - [x] Buses/rules list
  - [x] Targets view
  - [x] Send test event
- [x] Step Functions page
  - [x] State machines list
  - [x] Executions view
  - [x] Start execution action

### Milestone 4: Ops Services

- [x] SSM Parameter Store page
  - [x] Parameter list/search
  - [x] Read/write parameter actions
- [x] Secrets Manager page
  - [x] Secret list/search
  - [x] Read/update secret versions
- [x] CloudWatch Logs page
  - [x] Log groups/streams list
  - [x] Tail/filter logs

## Page Definition Checklist (Use Per Service)

Copy this checklist into each service section when implementation begins:

- [ ] Route exists
- [ ] API client methods implemented
- [ ] Loading and error states
- [ ] Search/filter support
- [ ] Primary CRUD/test actions
- [ ] Empty states
- [ ] Keyboard accessibility checks
- [ ] Mobile layout sanity check
- [ ] Manual validation against local Floci

## Progress Log

Add one line per meaningful change:

- `YYYY-MM-DD` - `<service>` - `<change summary>` - `<owner>`
- `2026-04-27` - `all` - `Added first-class service routes for SQS/S3/SNS/DynamoDB/Lambda/EventBridge/Step Functions/SSM/Secrets Manager/CloudWatch` - `codex`
- `2026-04-27` - `all` - `Added shared element registry + navigation + planned service page shell` - `codex`
- `2026-04-27` - `sqs,s3` - `Extracted existing SQS/S3 console into reusable component and mounted at /sqs and /s3` - `codex`
- `2026-04-27` - `sns` - `Implemented topics list, topic subscriptions view, and publish action` - `codex`
- `2026-04-27` - `dynamodb` - `Implemented table list, detail panel, scan, and partition-key query action` - `codex`
- `2026-04-27` - `lambda` - `Implemented function list, JSON invoke, output view, and returned log decoding` - `codex`
- `2026-04-28` - `all` - `Added shared header and shared status-banner components used by service pages` - `codex`
- `2026-04-28` - `all` - `Unified page shell behavior so info status banners auto-dismiss consistently across services` - `codex`
- `2026-04-28` - `sqs,s3` - `Migrated S3/SQS to shared ServiceShell and removed locked-view routing split` - `codex`
- `2026-04-28` - `all` - `Fixed Button asChild prop leakage by converting to Link + buttonVariants usage` - `codex`
- `2026-04-28` - `eventbridge` - `Implemented buses/rules list, targets view, and PutEvents test action` - `codex`
- `2026-04-28` - `step-functions` - `Implemented state machine list, execution list, and StartExecution action` - `codex`
- `2026-04-28` - `ssm` - `Implemented parameter list/search, GetParameter, and PutParameter flow` - `codex`
- `2026-04-28` - `secrets-manager` - `Implemented secret list/search, Describe/GetSecretValue, and PutSecretValue flow` - `codex`
- `2026-04-28` - `cloudwatch` - `Implemented log-group list/search, stream discovery, and FilterLogEvents view` - `codex`
