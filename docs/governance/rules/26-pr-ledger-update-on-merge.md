# Rule 26 — Merged PRs touching canonical docs must update `docs/pr-ledger/index.json`

> **Category:** `lint-enforced-convention`
> **Severity:** `blocker`
> **Last validated:** 2026-05-15 by @Skords-01
> **Next review:** 2026-08-13
> **Status:** Active

> Per-rule canonical body for Hard Rule #26. Compact summary lives in [`AGENTS.md § Hard rules`](../../../AGENTS.md#hard-rules-do-not-break). The machine-readable registry lives in [`docs/governance/hard-rules.json`](../hard-rules.json). 3-way sync (AGENTS.md ↔ JSON ↔ this file) is enforced by `pnpm lint:hard-rules-registry`.

## Scope

Canonical docs that receive PR backlinks (whitelist enforced by [`scripts/ci/update-pr-backlinks.mjs`](../../../scripts/ci/update-pr-backlinks.mjs)):

- `docs/adr/*.md` (excluding `TEMPLATE.md`, `README.md`)
- `docs/initiatives/*.md` (excluding `archive/`, `follow-ups.md`, `README.md`)
- `docs/playbooks/*.md` (excluding `INDEX.md`, `README.md`, `_TEMPLATE-*`)
- `docs/governance/rules/*.md` (excluding `README.md`)

`docs/audits/` and `docs/architecture/` are intentionally excluded — audits are snapshot-natured, architecture is already covered by Phase 3 drift-detectors.

## Enforced by

- **ci** — [`.github/workflows/pr-backlinks.yml`](../../../.github/workflows/pr-backlinks.yml) — `pull_request_target: closed` + `merged == true` trigger. After merge, the workflow runs `scripts/ci/update-pr-backlinks.mjs --pr <NUMBER>` and opens a follow-up PR `docs/pr-backlinks-<NNNN>` with the ledger + in-doc block updates. Loop-guarded against follow-up PRs (`head_ref` starting with `docs/pr-backlinks-` is skipped).
- **ci** — `pnpm docs:check-pr-ledger` (wired in `pnpm lint`) — verifies that the ledger ↔ in-doc blocks ↔ JSON schema are in sync. Exit 1 on any drift.

## Why / What is enforced

Sergeant already extracts `#NNNN` PR mentions **from** docs (`generate-open-work.mjs`, `generate-knowledge-graph.mjs` `touched-by` edges). The reverse direction was previously manual: when a PR merged, the canonical doc would say nothing about which PRs touched it. The asymmetry made "what PRs touched initiative 0010 this month?" a manual git-log archeology task.

This rule closes the loop: every merged PR that touches a canonical doc gets recorded in [`docs/pr-ledger/index.json`](../../pr-ledger/index.json), and the latest 5 entries appear as a `## Recent PRs` block at the end of each touched doc (delimited by `<!-- AUTO-GENERATED: PR-BACKLINKS-START -->` / `END` markers).

The workflow opens a **follow-up PR** (not direct push) so Hard Rule #6 (no force-push to main) is respected and the change still goes through normal review + branch protection.

See [ADR-0061](../../adr/0061-pr-backlink-storage.md) for the storage rationale (hybrid ledger + in-doc block; rejected alternatives: JSON-only, in-doc-only, per-PR markdown files).

## Backfill

The ledger ships empty — historical PRs are not auto-backfilled. To populate retroactively:

```bash
node scripts/ci/update-pr-backlinks.mjs --pr <PR_NUMBER>
```

Requires `gh` CLI on PATH. Commit the resulting `docs/pr-ledger/index.json` + in-doc block changes via a regular PR.

## Tracking

- Initiative — [`docs/initiatives/0014-knowledge-graph-and-catalogs.md`](../../initiatives/0014-knowledge-graph-and-catalogs.md) §Phase 5.
- ADR-0061 — [`docs/adr/0061-pr-backlink-storage.md`](../../adr/0061-pr-backlink-storage.md).
- Workflow — [`.github/workflows/pr-backlinks.yml`](../../../.github/workflows/pr-backlinks.yml).
