# PR Ledger — canonical reverse PR ↔ doc index

> **Last validated:** 2026-06-08 by @claude. **Next review:** 2026-09-06.
> **Status:** Active

Bidirectional companion to [`docs/open-work.md`](../open-work.md). Open-work scans canonical docs for `#NNNN` mentions (forward link: doc → PR). This ledger goes the other way: merged PRs → docs they touched.

## How it works

1. Every time a PR merges and touches a canonical doc (ADR / initiative / playbook / hard-rule), the [`pr-backlinks.yml`](../../.github/workflows/pr-backlinks.yml) workflow fires.
2. The workflow runs [`scripts/ci/update-pr-backlinks.mjs`](../../scripts/ci/update-pr-backlinks.mjs) which:
   - Appends an entry to [`index.json`](./index.json) (this directory).
   - Regenerates the `<!-- AUTO-GENERATED: PR-BACKLINKS-START -->` block at the end of each touched canonical doc to list the 5 most recent PRs.
3. The workflow opens a follow-up PR `docs/pr-backlinks-<NNNN>` with the changes — never pushes directly to `main` (Hard Rule #6).

## Why hybrid (ledger + in-doc block)

See [ADR-0061](../adr/0061-pr-backlink-storage.md) for the full rationale.

Short version: the JSON ledger is canonical (machine-readable, drives the Phase 1 knowledge graph's `touched-by` edges). The in-doc block is a UX affordance — readers of a single ADR or initiative see recent touches without leaving the doc.

## Canonical doc whitelist

Only these path patterns get backlinks:

- `docs/adr/*.md` (excluding `TEMPLATE.md`, `README.md`)
- `docs/90-work/initiatives/*.md` (excluding `archive/`, `follow-ups.md`, `README.md`)
- `docs/00-start/playbooks/*.md` (excluding `INDEX.md`, `README.md`, `_TEMPLATE-*`)
- `docs/governance/rules/*.md` (excluding `README.md`)

Other doc directories (`docs/90-work/audits/`, `docs/02-engineering/architecture/`, `docs/01-product/launch/`, etc.) intentionally don't receive backlinks — they're either snapshot-natured (audits) or already covered by drift-detectors (auto-generated).

## CI gate

`pnpm docs:check-pr-ledger` validates:

- `index.json` matches the JSON schema at [`docs/governance/schemas/pr-ledger.schema.json`](../governance/schemas/pr-ledger.schema.json).
- Every in-doc `PR-BACKLINKS-START / END` block reflects the latest 5 entries in `index.json` that touch that doc.
- No canonical doc has an orphan block (block exists but ledger has no matching entries).

## Manual operations

| Need                                | Command                                                                     |
| ----------------------------------- | --------------------------------------------------------------------------- |
| Refresh blocks after editing ledger | `pnpm docs:gen-pr-backlinks`                                                |
| Validate ledger ↔ blocks ↔ schema   | `pnpm docs:check-pr-ledger`                                                 |
| Backfill a specific historical PR   | `node scripts/ci/update-pr-backlinks.mjs --pr <NUMBER>` (requires `gh` CLI) |

## Limitations

- The workflow runs on `pull_request_target: closed` with `merged == true`. PRs closed without merging do not appear in the ledger.
- Loop prevention: the workflow skips PRs whose `head_ref` starts with `docs/pr-backlinks-` — these are auto-generated follow-up PRs themselves and shouldn't re-trigger the action.

## Repo setting required for automatic PR creation

The post-merge workflow opens a follow-up PR via `gh pr create`. This call fails with `GraphQL: GitHub Actions is not permitted to create or approve pull requests` unless **one** of these is in place:

- **Option A (recommended):** Settings → Actions → General → Workflow permissions → ✅ _Allow GitHub Actions to create and approve pull requests_. One-time toggle; no secrets to rotate.
- **Option B:** swap `secrets.GITHUB_TOKEN` in [`.github/workflows/pr-backlinks.yml`](../../.github/workflows/pr-backlinks.yml) for a Personal Access Token (PAT) with `repo` scope, stored as a repo secret.

If neither is set, the workflow still pushes the `docs/pr-backlinks-<NNNN>` branch (so the ledger update is preserved) but exits 1 with a `::warning::` line directing the operator to open the PR manually. Backfill via `node scripts/ci/update-pr-backlinks.mjs --pr <NUMBER>` does **not** hit this limitation — it runs from a developer machine where `gh auth login` uses an interactive token with PR-create scope.
