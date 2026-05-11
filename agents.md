# agents.md

## Purpose

This file documents how to work in this repo so image/app versions bump correctly and update notes appear in the in-app update banner.

## Versioning Rules (GitVersion)

This repository uses `GitVersion` with commit-message incrementing.

- `feat:` commits bump **minor**.
- `fix:` commits bump **patch**.
- `BREAKING CHANGE:` in commit body or `!` in type/scope bumps **major**.
- `dev` branch produces `alpha`-labeled versions.
- `main` branch produces stable release versions.

Reference: `GitVersion.yml`.

## Branching Workflow

1. Create a feature branch from `dev`.
2. Open a PR into `dev` for regular feature delivery.
3. Merge `dev` into `main` when promoting a stable release.

Recommended branch naming:

- `feature/<short-topic>`
- `fix/<short-topic>`
- `hotfix/<short-topic>`

## Commit Message Requirements

Use Conventional Commit style so version bumps are predictable.

Good examples:

- `feat(ssm): add parameter history panel`
- `fix(cloudwatch): handle empty log stream`
- `feat!: remove legacy lambda source endpoint`

Breaking change example with body:

```text
feat(api): change version manifest schema

BREAKING CHANGE: clients must read "changes" as an array of strings.
```

## Merge Guidance

1. Keep PRs scoped to one logical change.
2. Ensure commit subjects keep `feat`/`fix` intent clear.
3. Prefer squash merge only if the final squashed commit message preserves the intended version bump keyword.
4. Do not rewrite merge commits in a way that drops semantic intent.

## Update Banner Changes List Workflow

The UI reads update notes from `version.json` through `/api/version-manifest` and displays `changes` in the update banner.

Where this is generated:

- `.github/workflows/publish-image.yml` (job: `publish_pages_version`)

How to publish change notes:

1. Run **Publish Docker Image** with `workflow_dispatch`.
2. Fill input `update_changes` with newline-delimited items, for example:

```text
CloudWatch retention preview mode
SSM JSON formatting preservation
Improved Lambda upload error reporting
```

3. The workflow writes:
   - `"changes": [...]` into `version.json` (main) or `dev/version.json` (dev).
4. On normal `push`-triggered runs, `changes` defaults to `[]`.

## Quick Checklist Before Merge

1. Branch is based on latest `dev`.
2. Commits use Conventional Commit prefixes (`feat`, `fix`, etc.).
3. If user-facing changes were made, prepare `update_changes` text for dispatch publish.
4. PR description includes release-impact summary (what should appear in `changes`).
