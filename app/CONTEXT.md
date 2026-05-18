# Service Console

This context defines the operator-facing language for navigating services and executing day-to-day operations in the Floci UI.

## Language

**Service Console**:
The operator workspace for interacting with one Floci-managed service at a time.
_Avoid_: screen, page

**Service**:
A named AWS-compatible capability exposed in the console (for example SQS, S3, Lambda).
_Avoid_: module, product

**Service Visibility**:
The rule that determines whether a service is shown and navigable in the console.
_Avoid_: feature flag, entitlement

**Operation**:
A user-triggered action that reads or changes service resources.
_Avoid_: click, request

**Operation Error**:
A user-visible failure outcome from an attempted operation.
_Avoid_: create error, exception

**Resource**:
A named service object managed through operations (for example queue, bucket, function).
_Avoid_: item, row

## Relationships

- A **Service Console** presents one or more **Services**
- A **Service** has many **Resources**
- An **Operation** targets a **Service** and may create or mutate a **Resource**
- An **Operation** may produce an **Operation Error**
- **Service Visibility** controls which **Services** can be accessed in the **Service Console**

## Example dialogue

> **Dev:** "When **Service Visibility** disables Lambda, should its **Service** still appear in navigation?"
> **Domain expert:** "No, hidden means that **Service** is not accessible in the **Service Console** at all."

## Flagged ambiguities

- "service" can mean upstream AWS service or UI section — resolved: in this context, **Service** means the operator-facing capability shown in the console.
- "visibility" could imply user permissions — resolved: **Service Visibility** is environment-level configuration, not per-operator authorization.
