# Dynamic Snapshot — Governance

> **Status:** Active
> **Last touched:** 2026-09-02 by @claude. **Next review:** 2026-12-04.
> **Owner:** @SkOrDs-02
> **Supersedes:** —
> **Related:** [ADR-0071](../adr/0071-dynamic-agent-snapshot.md) — rationale and design; [tools/agent-snapshot/README.md](../../../tools/agent-snapshot/README.md) — usage; §0.1 in [`.agents/skills/sergeant-start-here/SKILL.md`](../../../.agents/skills/sergeant-start-here/SKILL.md) — required entry point.

## What this doc covers

ADR-0071 explains _why_ the snapshot exists and _what_ it contains. This governance doc covers:

1. **How** an agent uses the snapshot on session start (the §0.1 contract).
2. **How** the snapshot interacts with `codebase-memory-mcp` (the structural knowledge graph).
3. **How** to extend the snapshot when a new dynamic-context source appears.
4. **Failure modes** and what the agent should do when sections degrade.

## The §0.1 contract

Every agent that loads `sergeant-start-here` MUST run `pnpm snapshot` before loading any
specialist skill. The script is zero-dep, offline-safe, and degrades gracefully. The
agent reads `.agents/snapshot.md` and reacts to its 7 sections:

| Section              | Failure mode          | Agent action when healthy                        | Agent action when degraded         |
| -------------------- | --------------------- | ------------------------------------------------ | ---------------------------------- |
| Repo                 | never                 | orient                                           | (n/a — never fails)                |
| CI last run on main  | `gh` unavailable      | investigate if red before opening PR             | proceed with caution, manual check |
| Budgets              | bundle script missing | load `sergeant-deploy-and-observability` if >95% | proceed, no live budget signal     |
| Recent PR-ledger     | index parse error     | skim for adjacent work                           | proceed, no recent-context signal  |
| Hard-rule drift      | registry sync error   | re-read named rule before acting                 | proceed at own risk                |
| Initiative deadlines | date parse error      | read named initiative file                       | proceed                            |
| Agent hints          | never                 | apply                                            | (n/a)                              |

A "degraded" section reads `[unavailable: <reason>]` — the agent MUST NOT block on
degraded sections; it MUST log them and continue. The snapshot's job is to provide
_signal_, not to gate.

## Interaction with codebase-memory-mcp

`codebase-memory-mcp` (the structural knowledge graph indexed from `D:\Sergeant`)
answers **structural** questions:

- "Where is `useFinykCache` defined and who calls it?"
- "Which files import `@sergeant/shared/lib/macros`?"
- "What's the cyclomatic complexity of `registerRoutes`?"

The snapshot answers **state** questions:

- "Is CI green?"
- "Are bundle budgets under 95%?"
- "Which TODO-dated initiatives expire in the next 30 days?"

These are **complementary, not redundant**. The recommended flow on session start:

```
1. pnpm snapshot                 → .agents/snapshot.md         (state, ~1s)
2. Read §0.1 reactions in SKILL  → decide which specialist skill
3. Load specialist skill         → read its rules + governance
4. For code-structure questions: → codebase-memory-mcp (search_graph, trace_path,
                                    get_code_snippet)        (structure, on demand)
```

The two are **layered**: snapshot first (fast, cheap, gives context for routing),
codebase-memory second (expensive, gives answers for specific file/function questions).
Running codebase-memory _before_ the snapshot wastes tokens — you do not yet know
which question to ask the graph.

### Where they overlap

- **Dead-code signal.** Прямі перевірки (`pnpm dead-code:files`, `pnpm knip`) і
  codebase-memory можуть показати той самий мертвий експорт різними шляхами: перша
  дає список файлів/експортів, друга — глибину call-graph. Обидві коректні; агент
  читає ту, що потрібна поточному кроку. _(Entropy-janitor-и, які раніше відкривали
  issue автоматично, retired [ADR-0081](../adr/0081-repository-simplification.md).)_
- **Circular dependencies.** `pnpm lint` (`import/no-cycle`) ловить цикл як помилку
  лінта; codebase-memory резолвить його через LSP у структурований цикл. Той самий
  факт, два споживачі.
- **PR-ledger entries.** Snapshot lists recent PRs from `docs/04-governance/pr-ledger/index.json`;
  codebase-memory links them via `touchedDocs`. The agent should treat the snapshot
  list as a "skim before opening a PR" signal and the graph as "find every file this
  PR touched" deep-dive.

## Extending the snapshot

When adding a new section to `tools/agent-snapshot/snapshot.mjs`:

1. **Must** write the section under 5 KB on its own; the `<50 KB` total cap is enforced.
2. **Must** degrade to `[unavailable: <reason>]` on any error — never throw, never
   abort the rest of the report (ADR-0071 §Decision).
3. **Must not** read Pino destinations, GitHub PATs, or any field whose name
   contains `token` / `secret` / `password` (Hard Rule #21).
4. **Should** reuse the existing `gh` / `git` wrappers in the script; if you need
   a new external tool, justify it in the PR body (no new deps without ADR).
5. **Must** update §0.1 in `sergeant-start-here/SKILL.md` with the new section's
   agent-action rule. The §0.1 contract is the user-facing layer of this governance.
6. **Must** append a `pr-ledger` entry on merge (Hard Rule #26). Placeholder OK
   pre-merge; `update-pr-backlinks` CI replaces the PR number at merge time.

## Failure modes — what the agent does

| Failure                                        | Agent behavior                                                                                                              |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `pnpm snapshot` not installed (script missing) | Skip §0.1, log a warning, proceed (CI enforces the script's presence on `main`).                                            |
| `.agents/snapshot.md` older than 15 min (TTL)  | Re-run `pnpm snapshot --refresh`.                                                                                           |
| A single section returns `[unavailable: ...]`  | Continue with the other sections. Note the gap in the session's own worklog.                                                |
| Total snapshot >50 KB                          | Truncation drops the richest sections first. The agent should prefer the §0.1 actions it _can_ see over the ones it cannot. |
| Cache file corrupted                           | `pnpm snapshot --refresh` (re-runs all sections, overwrites cache).                                                         |

## Cross-references

- **ADR-0071** — design decisions, layout, graceful-degradation contract
- **§0.1 in `sergeant-start-here/SKILL.md`** — the contract an agent follows
- **`docs/00-start/agents/agent-skills-catalog.md`** — catalog entry for the snapshot tooling
- **`harness-engineering-v1.md`** (rollout summary) — links this doc as the snapshot governance reference
- **`codebase-memory-mcp`** (глобальний конфіг харнеса, поза репо) — structural graph
