# PR Ledger — canonical reverse PR ↔ doc index

> **Last touched:** 2026-09-17 by @claude (whitelist synced with `update-pr-backlinks.mjs` — audits added 2026-09-15). **Next review:** 2026-12-16.
> **Status:** Active

Bidirectional companion to [`docs/open-work.md`](../../open-work.md). Open-work scans canonical docs for `#NNNN` mentions (forward link: doc → PR). This ledger goes the other way: merged PRs → docs they touched.

## How it works

1. Every time a PR merges and touches a canonical doc (ADR / initiative / playbook / hard-rule), the [`pr-backlinks.yml`](../../../.github/workflows/pr-backlinks.yml) workflow fires.
2. The workflow runs [`scripts/ci/update-pr-backlinks.mjs`](../../../scripts/ci/update-pr-backlinks.mjs) which:
   - Appends an entry to [`index.json`](./index.json) (this directory).
   - Regenerates the `<!-- AUTO-GENERATED: PR-BACKLINKS-START -->` block at the end of each touched canonical doc to list the 5 most recent PRs.
3. The workflow opens a follow-up PR `docs/pr-backlinks-<NNNN>` with the changes — never pushes directly to `main` (Hard Rule #6).

## Why hybrid (ledger + in-doc block)

See [ADR-0061](../adr/0061-pr-backlink-storage.md) for the full rationale.

Short version: the JSON ledger is canonical (machine-readable; historically it also drove the Phase 1 knowledge graph's `touched-by` edges — that graph was retired with [ADR-0081](../adr/0081-repository-simplification.md), the ledger stays as the reverse index and feeds `pnpm snapshot`). The in-doc block is a UX affordance — readers of a single ADR or initiative see recent touches without leaving the doc.

## Canonical doc whitelist

Only these path patterns get backlinks:

- `docs/governance/adr/*.md` (excluding `TEMPLATE.md`, `README.md`)
- `docs/work/specs/initiatives/*.md` (excluding `archive/`, `follow-ups.md`, `README.md`)
- `docs/start/instructions/*.md` (excluding `INDEX.md`, `README.md`, `_TEMPLATE-*`)
- `docs/governance/governance/rules/*.md` (excluding `README.md`)
- `docs/work/specs/audits/*.md` (excluding `README.md`) — added 2026-09-15; rationale in [Rule #26 § Чому аудити повернули в скоуп](../governance/rules/26-pr-ledger-update-on-merge.md)

The list above mirrors `CANONICAL_DOC_ROOTS` in [`scripts/ci/update-pr-backlinks.mjs`](../../../scripts/ci/update-pr-backlinks.mjs) — the script is the source of truth; when it changes, update this list and Rule #26 in the same PR.

Other doc directories (`docs/engineering/architecture/`, `docs/work/specs/launch/`, etc.) intentionally don't receive backlinks — they're already covered by drift-detectors (auto-generated). Audits were excluded on the same "snapshot-natured" argument until 2026-09-15; practice disproved it.

## CI gate

`pnpm docs:check-pr-ledger` validates:

- `index.json` has the shape described by [`docs/governance/governance/schemas/pr-ledger.schema.json`](../governance/schemas/pr-ledger.schema.json) — checked by the script's own `validateLedger()` (`version`, `generated_at`, `prs[].number/title/merged_at/author/touchedDocs`), not by `ajv` against the schema file; the schema is documentation, and the two can drift.
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
- **Option B:** swap `secrets.GITHUB_TOKEN` in [`.github/workflows/pr-backlinks.yml`](../../../.github/workflows/pr-backlinks.yml) for a Personal Access Token (PAT) with `repo` scope, stored as a repo secret.

If neither is set, the workflow still pushes the `docs/pr-backlinks-<NNNN>` branch (so the ledger update is preserved) but exits 1 with a `::warning::` line directing the operator to open the PR manually. Backfill via `node scripts/ci/update-pr-backlinks.mjs --pr <NUMBER>` does **not** hit this limitation — it runs from a developer machine where `gh auth login` uses an interactive token with PR-create scope.
