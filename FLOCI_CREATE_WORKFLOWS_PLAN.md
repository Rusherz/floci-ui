# Floci Create Workflows Plan

This file tracks progress for adding creation workflows directly in the Floci UI.

## Status Legend

- `[ ]` Not started
- `[-]` In progress
- `[x]` Done
- `[!]` Blocked

## Goal

Enable users to create common resources from the UI instead of only browsing existing resources.

Scope:
- S3 bucket creation
- SQS queue creation
- SNS topic creation
- DynamoDB table creation
- Lambda function creation
- EventBridge bus/rule creation
- Step Functions state machine creation
- SSM parameter creation
- Secrets Manager secret creation
- CloudWatch log group creation

## Milestones

### Milestone 1: Shared Create UX Foundation

- [x] Define shared create-action patterns (button placement, modal/sheet, validation, error display)
- [x] Add reusable `CreateResourceDialog` component
- [ ] Add shared async action state helpers (`idle/loading/success/error`)
- [ ] Add optimistic refresh hooks after create actions
- [ ] Add toast/banner copy guidelines for create outcomes

### Milestone 2: S3 Bucket Create

- [x] API client: add `createS3Bucket(name, region)`
- [x] UI: add `Create Bucket` action on S3 page
- [x] Validation: bucket naming rules + duplicate handling
- [x] Refresh: auto-select newly created bucket
- [ ] Automated e2e test: create + verify visibility in list

### Milestone 3: SQS Queue Create

- [x] API client: add `createSqsQueue(name, attributes?)`
- [x] UI: add `Create Queue` action on SQS page
- [x] Validation: queue name + FIFO suffix rules
- [x] Refresh: auto-select newly created queue and load messages
- [ ] Automated e2e test: create + receive/send/delete smoke check

### Milestone 4: Lambda Function Create

- [x] API client: add `createLambdaFunction(...)` + update-code helper flow
- [x] UI: add `Create Function` action on Lambda page
- [ ] Inputs: function name, runtime, handler, role (local default), inline code template
- [x] Packaging: support minimal inline ZIP payload flow compatible with Floci
- [x] Refresh: auto-select new function + allow immediate invoke
- [ ] Automated e2e test: create + invoke pong template

### Milestone 5: Cross-Service Hardening

- [x] Add reusable input validation utilities
- [x] Add create-action analytics/debug logging hooks (dev-only)
- [x] Improve error mapping for common AWS/Floci API failures
- [x] Add confirmation/guardrails for destructive follow-up actions
- [x] Add docs section in README for create workflows and caveats

### Milestone 6: SNS Create

- [x] API client: add `createSnsTopic(name, attributes?)`
- [x] UI: add `Create Topic` action on SNS page
- [x] Validation: topic naming + FIFO suffix rules
- [x] Refresh: auto-select newly created topic
- [ ] Automated e2e test: create + publish smoke check

### Milestone 7: DynamoDB Create

- [x] API client: add `createDynamoTable(...)`
- [x] UI: add `Create Table` action on DynamoDB page
- [ ] Inputs: table name, partition key, optional sort key, billing mode
- [x] Refresh: auto-select newly created table and load detail
- [ ] Automated e2e test: create + scan/query smoke check

### Milestone 8: EventBridge Create

- [x] API client: add `createEventBus(name)` and `putRule(...)`
- [x] UI: add `Create Bus` and `Create Rule` actions on EventBridge page
- [x] Inputs: bus name, rule name, event pattern or schedule expression
- [x] Refresh: auto-select created bus/rule and load targets
- [ ] Automated e2e test: create + put test event smoke check

### Milestone 9: Step Functions Create

- [x] API client: add `createStateMachine(...)`
- [x] UI: add `Create State Machine` action on Step Functions page
- [x] Inputs: name, type (STANDARD/EXPRESS), role ARN, definition JSON
- [x] Refresh: auto-select created machine and allow start execution
- [ ] Automated e2e test: create + start execution smoke check

### Milestone 10: SSM Create

- [x] API client: ensure `putSsmParameter(...)` supports first-write path
- [x] UI: promote explicit `Create Parameter` action on SSM page
- [x] Inputs: name, value, type, optional description/tier
- [x] Refresh: auto-select created parameter and load value
- [ ] Automated e2e test: create + read/update smoke check

### Milestone 11: Secrets Manager Create

- [x] API client: add `createSecret(name, secretString, description?)`
- [x] UI: add `Create Secret` action on Secrets page
- [x] Inputs: name, secret value, optional description
- [x] Refresh: auto-select created secret and show detail/version map
- [ ] Automated e2e test: create + read/update value smoke check

### Milestone 12: CloudWatch Logs Create

- [x] API client: add `createLogGroup(name, retentionInDays?)`
- [x] UI: add `Create Log Group` action on CloudWatch page
- [x] Validation: log group naming + retention constraints
- [x] Refresh: auto-select created log group and load streams/events
- [ ] Automated e2e test: create + filter smoke check

## Per-Feature Checklist

Use this checklist when implementing each create workflow:

- [ ] API method added
- [ ] UI action added
- [ ] Form validation added
- [ ] Loading/disabled states handled
- [ ] Success status + refresh behavior
- [ ] Error state mapping
- [ ] Keyboard accessibility
- [ ] Automated e2e validation

## Open Questions

- [ ] Should Lambda create rely on inline template only, or also allow upload path?
- [ ] Do we expose advanced options immediately (queue attributes, bucket region controls), or phase them in?
- [ ] Should create actions be gated behind an "Advanced" mode toggle?
- [ ] For EventBridge/Step Functions, what default IAM role strategy should be used in local Floci?
- [ ] Should CloudWatch log group creation include retention by default or leave unset?

## Progress Log

Add one line per meaningful change:

- `YYYY-MM-DD` - `<service|all>` - `<change summary>` - `<owner>`
- `2026-04-28` - `all` - `Created create-workflows plan for S3/SQS/Lambda UI resource creation` - `codex`
- `2026-04-28` - `all` - `Expanded create-workflows plan to all implemented service pages` - `codex`
- `2026-04-28` - `all` - `Implemented shared create dialog and create actions across S3/SQS/SNS/DynamoDB/Lambda/EventBridge/Step Functions/Secrets/CloudWatch` - `codex`
- `2026-05-04` - `all` - `Audited implementation vs plan and checked off completed milestones/tasks` - `codex`
- `2026-05-04` - `all` - `Added shared create validation/error mapping helpers and documented create workflow caveats in README` - `codex`
- `2026-05-04` - `all` - `Added dev-only create logging hooks and completed EventBridge schedule + SSM create input coverage` - `codex`
- `2026-05-04` - `all` - `Added Playwright e2e infrastructure and create-workflow smoke specs; switched plan manual-test items to automated e2e tracking` - `codex`
