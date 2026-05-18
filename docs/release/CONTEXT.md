# Update Intelligence

This context defines the operator-facing language for communicating build freshness and release changes inside the console.

## Language

**Update Intelligence**:
The capability that informs operators whether a newer application version is available and what changed.
_Avoid_: release system, updater

**Current Version**:
The application version currently running in the operator's session.
_Avoid_: local version, client version

**Available Version**:
The latest version reported by the configured manifest source.
_Avoid_: remote version, target version

**Version Manifest**:
A published record that includes the **Available Version** and optional change notes.
_Avoid_: payload, metadata file

**Change Note**:
A human-readable release item presented to explain what changed between versions.
_Avoid_: commit message, patch note

**Image Pull Update**:
An update action that requires pulling a newer Docker image before the **Available Version** can run.
_Avoid_: silent update, background patch

## Relationships

- **Update Intelligence** compares **Current Version** and **Available Version**
- A **Version Manifest** declares the **Available Version**
- A **Version Manifest** may include many **Change Notes**
- Applying an **Available Version** requires an **Image Pull Update**
- **Change Notes** are presented within the **Service Console**
- **Update Intelligence** reports update state only; **Image Pull Update** execution happens outside the UI

## Example dialogue

> **Dev:** "When versions differ, what should the operator see first?"
> **Domain expert:** "Show that a newer **Available Version** exists, then list **Change Notes** from the **Version Manifest**."

## Flagged ambiguities

- "version" was ambiguous between running app and published release — resolved: use **Current Version** and **Available Version** explicitly.
- "silent update" implied no operator action — resolved: updates require an **Image Pull Update** and are not silent.
- "update in UI" implied browser-triggered deployment — resolved: this context is informational and does not initiate updates.
