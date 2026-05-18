# Context Map

## Contexts

- [Service Console](./app/CONTEXT.md) — user-facing workflows for browsing and operating Floci-managed services
- [Proxy Surface](./app/api/CONTEXT.md) — backend routes and proxy boundaries between the UI and Floci/runtime metadata
- [Update Intelligence](./docs/release/CONTEXT.md) — version manifest and update-notification language exposed to operators

## Relationships

- **Service Console → Proxy Surface**: Console actions call API/proxy endpoints to execute operations against Floci
- **Service Console → Update Intelligence**: Console reads version status and change communication from update metadata
- **Update Intelligence → Service Console**: Update state and change notes are displayed to operators in console surfaces
