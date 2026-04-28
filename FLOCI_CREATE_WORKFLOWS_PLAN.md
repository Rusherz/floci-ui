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

- [ ] Define shared create-action patterns (button placement, modal/sheet, validation, error display)
- [ ] Add reusable `CreateResourceDialog` component
- [ ] Add shared async action state helpers (`idle/loading/success/error`)
- [ ] Add optimistic refresh hooks after create actions
- [ ] Add toast/banner copy guidelines for create outcomes

### Milestone 2: S3 Bucket Create

- [x] API client: add `createS3Bucket(name, region)`
- [x] UI: add `Create Bucket` action on S3 page
- [x] Validation: bucket naming rules + duplicate handling
- [x] Refresh: auto-select newly created bucket
- [ ] Manual test: create + verify visibility in list

### Milestone 3: SQS Queue Create

- [x] API client: add `createSqsQueue(name, attributes?)`
- [x] UI: add `Create Queue` action on SQS page
- [x] Validation: queue name + FIFO suffix rules
- [x] Refresh: auto-select newly created queue and load messages
- [ ] Manual test: create + receive/send/delete smoke check

### Milestone 4: Lambda Function Create

- [ ] API client: add `createLambdaFunction(...)` + update-code helper flow
- [ ] UI: add `Create Function` action on Lambda page
- [ ] Inputs: function name, runtime, handler, role (local default), inline code template
- [ ] Packaging: support minimal inline ZIP payload flow compatible with Floci
- [ ] Refresh: auto-select new function + allow immediate invoke
- [ ] Manual test: create + invoke pong template

### Milestone 5: Cross-Service Hardening

- [ ] Add reusable input validation utilities
- [ ] Add create-action analytics/debug logging hooks (dev-only)
- [ ] Improve error mapping for common AWS/Floci API failures
- [ ] Add confirmation/guardrails for destructive follow-up actions
- [ ] Add docs section in README for create workflows and caveats

### Milestone 6: SNS Create

- [x] API client: add `createSnsTopic(name, attributes?)`
- [x] UI: add `Create Topic` action on SNS page
- [x] Validation: topic naming + FIFO suffix rules
- [x] Refresh: auto-select newly created topic
- [ ] Manual test: create + publish smoke check

### Milestone 7: DynamoDB Create

- [x] API client: add `createDynamoTable(...)`
- [x] UI: add `Create Table` action on DynamoDB page
- [ ] Inputs: table name, partition key, optional sort key, billing mode
- [ ] Refresh: auto-select newly created table and load detail
- [ ] Manual test: create + scan/query smoke check

### Milestone 8: EventBridge Create

- [x] API client: add `createEventBus(name)` and `putRule(...)`
- [x] UI: add `Create Bus` and `Create Rule` actions on EventBridge page
- [ ] Inputs: bus name, rule name, event pattern or schedule expression
- [ ] Refresh: auto-select created bus/rule and load targets
- [ ] Manual test: create + put test event smoke check

### Milestone 9: Step Functions Create

- [x] API client: add `createStateMachine(...)`
- [x] UI: add `Create State Machine` action on Step Functions page
- [ ] Inputs: name, type (STANDARD/EXPRESS), role ARN, definition JSON
- [ ] Refresh: auto-select created machine and allow start execution
- [ ] Manual test: create + start execution smoke check

### Milestone 10: SSM Create

- [ ] API client: ensure `putSsmParameter(...)` supports first-write path
- [ ] UI: promote explicit `Create Parameter` action on SSM page
- [ ] Inputs: name, value, type, optional description/tier
- [ ] Refresh: auto-select created parameter and load value
- [ ] Manual test: create + read/update smoke check

### Milestone 11: Secrets Manager Create

- [x] API client: add `createSecret(name, secretString, description?)`
- [x] UI: add `Create Secret` action on Secrets page
- [ ] Inputs: name, secret value, optional description
- [ ] Refresh: auto-select created secret and show detail/version map
- [ ] Manual test: create + read/update value smoke check

### Milestone 12: CloudWatch Logs Create

- [x] API client: add `createLogGroup(name, retentionInDays?)`
- [x] UI: add `Create Log Group` action on CloudWatch page
- [ ] Validation: log group naming + retention constraints
- [ ] Refresh: auto-select created log group and load streams/events
- [ ] Manual test: create + filter smoke check

## Per-Feature Checklist

Use this checklist when implementing each create workflow:

- [ ] API method added
- [ ] UI action added
- [ ] Form validation added
- [ ] Loading/disabled states handled
- [ ] Success status + refresh behavior
- [ ] Error state mapping
- [ ] Keyboard accessibility
- [ ] Manual local validation

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
