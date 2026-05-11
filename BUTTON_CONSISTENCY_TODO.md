# Button Consistency TODO

Goal: make button contrast, sizing, spacing, hover/focus states, and destructive intent consistent across all screens.

## Standards To Apply

- [x] Use `components/ui/button.tsx` (`Button`) for actionable controls by default.
- [x] Keep raw `<button>` only for selectable list rows where semantic `role="option"`/listbox behavior is needed.
- [x] Normalize icon-only action controls to one pattern: `variant='emphasis' size='icon' className='size-9'` for create/primary-adjacent actions.
- [x] Reserve `variant='destructive'` for irreversible actions only.
- [x] Apply one shared style utility for selectable list-row buttons (active, hover, focus ring) instead of per-file custom class strings.
- [x] Ensure all icon buttons include `aria-label` and `title`.

## File-Level Checklist

### CloudWatch

- [x] `components/floci/cloudwatch.tsx`: convert high-emphasis create button in the toolbar to the same neutral icon action style used by sibling actions unless it is intentionally primary.
- [x] `components/floci/cloudwatch.tsx`: review `Clear Logs` destructive contrast in dark mode and soften if it visually overpowers nearby actions.
- [x] `components/floci/cloudwatch.tsx`: move both raw list-row `<button>` class blocks (groups/events) to a shared reusable class/helper.

### Lambda

- [x] `components/floci/lambda.tsx`: normalize toolbar icon buttons (create/clear/delete/edit patterns) to the standard variant mix.
- [x] `components/floci/lambda.tsx`: migrate raw selectable row `<button>` styling to shared list-row helper.

### S3

- [x] `components/floci/s3.tsx`: migrate raw list buttons and text-link style buttons (`text-primary hover:underline`) to consistent `Button` variant usage (`ghost`/`link` where appropriate).
- [x] `components/floci/s3.tsx`: normalize icon action density and hover/focus treatment in bucket/object rows.

### SQS

- [x] `components/floci/sqs.tsx`: replace inline raw `<button>` controls and text-link toggles with shared variants where possible.
- [x] `components/floci/sqs.tsx`: standardize selectable row button classes via shared helper.

### Other Service Pages

- [x] `components/floci/dynamodb.tsx`: migrate raw row button to shared selectable-row style helper.
- [x] `components/floci/eventbridge.tsx`: migrate raw row button to shared selectable-row style helper.
- [x] `components/floci/secrets-manager.tsx`: migrate raw row button to shared selectable-row style helper.
- [x] `components/floci/sns.tsx`: migrate raw row button to shared selectable-row style helper.
- [x] `components/floci/ssm.tsx`: migrate raw row button to shared selectable-row style helper.
- [x] `components/floci/step-functions.tsx`: migrate raw row button to shared selectable-row style helper.

## Shared Refactor Tasks

- [x] Add shared list-row button utility in `lib/floci` (or `components/floci`) to avoid repeating class strings in each service.
- [x] Add a dedicated `subtle-destructive` button variant (or token adjustment) if current destructive color is too high-contrast for non-terminal actions.
- [x] Audit button variant usage across app (`default`, `outline`, `secondary`, `ghost`, `link`, `destructive`, `emphasis`, icon actions) and define when each should be used.
- [x] Audit visual emphasis hierarchy so primary actions are clear and secondary/tertiary actions do not compete.
- [x] Audit all `variant='destructive'` usages and confirm each one is truly destructive.

## Verification

- [x] Visual pass in both light and dark themes across: CloudWatch, Lambda, S3, SQS, DynamoDB, EventBridge, Secrets Manager, SNS, SSM, Step Functions.
- [x] Keyboard pass: tab/focus ring consistency for all buttons and row-select controls.
- [x] Confirm no regression in selection behavior for listbox-like row controls.
