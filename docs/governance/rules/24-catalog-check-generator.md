# Rule 24 — Catalogs registered in `knowledge-graph.json` must have a `--check` generator

> **Category:** `lint-enforced-convention`
> **Severity:** `blocker`
> **Last validated:** 2026-05-15 by @Skords-01
> **Next review:** 2026-08-13
> **Status:** Active

> Per-rule canonical body for Hard Rule #24. Compact summary lives in [`AGENTS.md § Hard rules`](../../../AGENTS.md#hard-rules-do-not-break). The machine-readable registry lives in [`docs/governance/hard-rules.json`](../hard-rules.json). 3-way sync (AGENTS.md ↔ JSON ↔ this file) is enforced by `pnpm lint:hard-rules-registry`.

## Scope

- `docs/governance/knowledge-graph.json`
- `docs/governance/repo-map.auto.json`
- `docs/governance/service-catalog.auto.json`
- `docs/governance/symbol-index.json` (+ per-workspace `*/symbols.json`)
- `docs/02-engineering/architecture/diagrams/c3-workspaces.md`
- `docs/pr-ledger/index.json`

## Enforced by

- **ci** — `pnpm docs:check-graph` (knowledge graph)
- **ci** — `pnpm docs:check-symbols` (symbol catalog)
- **ci** — `pnpm docs:check-repo-map` (repo-map auto-mirror)
- **ci** — `pnpm docs:check-service-catalog` (service catalog auto-mirror)
- **ci** — `pnpm docs:check-architecture-diagrams` (workspace dependency diagram)
- **ci** — `pnpm docs:check-pr-ledger` (PR ledger + in-doc blocks)

All six checks are wired into the `pnpm lint` chain (root `package.json`). Adding a new catalog without a matching `--check` is a CI-blocker.

## Why / What is enforced

Initiative 0014 (knowledge graph + auto-generated catalogs) ships seven auto-derived artifacts that mirror code/process state. Each one solves a real drift class:

- **Drift between code and docs.** `repo-map.auto.json` and `service-catalog.auto.json` cross-reference the markdown matrix views; CI fails if a new workspace lands without the matrix doc being updated.
- **Drift between commits and dashboards.** `knowledge-graph.json` rolls up ADR / initiative / playbook / hard-rule / audit / PR nodes — `--check` mode catches stale commits.
- **Drift between exports and consumers.** `symbol-index.json` (Phase 2) tracks dead exports per workspace.

Without a `--check` generator, an auto-derived file is just a stale snapshot. The rule forbids that pattern across the catalogs registered in the knowledge graph.

## Adding a new catalog

When you ship a new generated catalog (a JSON or markdown artifact derived from code or a JSON ledger):

1. Make it a node type in [`docs/governance/schemas/knowledge-graph.schema.json`](../schemas/knowledge-graph.schema.json) (or register it as a separate auto-gen artifact in `docs/governance/`).
2. Implement `--check` in the generator (mirrors `generate-open-work.mjs` pattern — re-render in memory, exit 1 on disk diff).
3. Wire `pnpm docs:check-<name>` into the `pnpm lint` chain in root `package.json`.
4. Add an entry to the `scope` array of this rule in `hard-rules.json` (this file), then run `pnpm hard-rules:generate` to refresh the matrix.

If you skip step 2 or 3 the new catalog is unenforced and the rule is violated.

## Tracking

- Initiative — [`docs/initiatives/archive/_0014-knowledge-graph-and-catalogs.md`](../../initiatives/archive/_0014-knowledge-graph-and-catalogs.md).
- ADR-0058 — [`docs/adr/0058-knowledge-graph-schema.md`](../../adr/0058-knowledge-graph-schema.md).

<!-- AUTO-GENERATED: PR-BACKLINKS-START -->

## Recent PRs

| PR                                                       | Title                                                              | Merged     |
| -------------------------------------------------------- | ------------------------------------------------------------------ | ---------- |
| [#2900](https://github.com/Skords-01/Sergeant/pull/2900) | docs(docs): hard rules 24/25/26 for Initiative 0014 (HR follow-up) | 2026-05-15 |

_Auto-derived from `docs/pr-ledger/index.json`. Top 1 most recent PRs touching this file._

<!-- AUTO-GENERATED: PR-BACKLINKS-END -->
