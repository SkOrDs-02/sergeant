---
name: sergeant-planning-batch
description: Use when executing a batch of N open tasks from docs/planning/* PR-plans — dynamic selection, parallel agent fan-out, tracker updates, fast-forward archival of complete docs; UA: виконати батч planning-тасків.
lang: en
lang-reason: Agent-runtime SKILL — body kept EN to maximize tool-calling stability across LLM providers (Anthropic, OpenAI, etc.) whose attention bias toward English persists in tool-routing decisions even when prompts are bilingual. The bilingual trigger phrase lives in `description:` so UA-only chat routing still resolves the right SKILL.
---

# Planning-batch executor (dynamic parallel fan-out)

This skill coordinates a dynamic, parallel-agent run that pulls the next N open
tasks out of `docs/planning/*` PR-plans and roadmaps, executes each one (code or
docs), reflects the work back into the trackers, and fast-forward archives any
planning doc that work has driven to fully-complete.

It is the planning-folder sibling of `sergeant-deliver-squad` (cross-surface
code) and the parallel docs sweep in
[`docs/agents/agent-workflows.md`](../../../docs/agents/agent-workflows.md) §12.
Unlike the §11 docs-sync sweep, this workflow **does** carry real code work and
**does** archive — without the 90-day stabilization wait.

## When to load

Load when the request is «виконай N тасків з планінгу» / «прожени батч planning
PR-карток» / «execute a batch of planning tasks», and the work spans multiple
`docs/planning/*` PR-cards. Each PR-card carries
`Status / Trigger / Action / Files / Acceptance / Size / P-рівень / Dependencies
/ Freeze-compatible / Owner`.

**Do not load** for a single isolated task that already maps to one specialist
skill — route straight to that skill instead. Do not load for the read-only
docs-reconcile sweep that never archives — that is agent-workflows §11 governed
by `sergeant-tech-debt`.

## Dynamic batch selection

Ground truth for "what is still open" is the trackers, not the prose:

- [`docs/open-work.md`](../../../docs/open-work.md) — generated dashboard of all
  open tracker docs (`pnpm docs:gen-open-work` to refresh).
- [`docs/pr-ledger/index.json`](../../../docs/pr-ledger/index.json) — whether a
  `#NNNN` PR-mention already merged.

Select the next batch by: skip every card already marked `✅ Виконано` /
`Closed`; honor each card's `Dependencies` (never start a card before its
blockers); respect each card's `Freeze-compatible` flag against any active
freeze in `docs/governance/`. Prefer the lowest `P-рівень` and smallest `Size`
first so the batch front-loads shippable wins. The batch size N is dynamic —
take what the request asks for, capped by what dependencies actually unblock.

## Task classification → execution lane

Classify each selected card before fan-out, then route it:

| Card touches                                  | Lane                                                                                  |
| --------------------------------------------- | ------------------------------------------------------------------------------------- |
| DB + server + api-client + web/mobile         | `sergeant-deliver-squad` (sequential handoff chain, one card at a time)               |
| One code surface only                         | The matching specialist skill (`sergeant-web-ui`, `sergeant-server-api`, …)           |
| Docs / trackers / status only                 | `docs/playbooks/reconcile-doc-drift.md` recipe (evidence-backed edits)                |
| Cross-surface test/typecheck validation       | `sergeant-qa-squad`                                                                   |

## Parallel fan-out strategy

1. **Inventory (serial, once).** Refresh dashboards so drift is computed against
   live state: `pnpm docs:gen-daily`, `pnpm docs:gen-initiative-followups`.
2. **Split into disjoint surfaces** so parallel agents never edit the same file.
   One owner per planning surface group. **Never** hand an agent an
   `AUTO-GENERATED` file (`open-work.md`, `today.md`, `follow-ups.md`,
   `*.auto.json`) — those are regenerated, not hand-edited.
3. **Fan out (parallel).** Spawn one read-only analysis agent per surface to
   verify, against `main` and the pr-ledger, which cards are genuinely shipped
   and which docs are fully complete. Agents return **precise, evidence-backed
   recommendations only** — conservative bias: ambiguous evidence → leave
   unchanged, report as "needs human".
4. **Execute code cards.** Independent code cards may run as parallel Agent Team
   teammates; a single card that is itself cross-surface stays a sequential
   `sergeant-deliver-squad` chain (migration → server → api-client → web/mobile).
5. **Apply + regenerate (serial).** Flip `Status` lines and checkboxes from the
   high-confidence recommendations, then regenerate dashboards.

## Tracker updates (always)

- Flip each completed card's `- **Status:**` to `✅ Виконано` with the PR/commit
  reference and a one-line evidence note.
- Regenerate `pnpm docs:gen-daily` so closed docs drop out of `open-work.md` and
  `today.md`.
- Bump the touched doc's `Last validated:` freshness marker (single marker only).

## Archival policy — fast-forward (skip the 90-day gate)

Archive a planning doc **only when** work has driven it to fully complete:
follow-ups closed, no open `- [ ]`, the doc is now a frozen snapshot. When that
bar is met, move it to `docs/planning/archive/` immediately — **do not wait the
90-day stabilization window.** Founder has standing approval for fast-forward
archival (precedent: [`docs/initiatives/README.md`](../../../docs/initiatives/README.md)
batch archival 2026-05-13 / 2026-06-01, "90-day waiting period skipped за
рішенням founder-а").

On move, apply the archive frontmatter from
[`docs/planning/README.md`](../../../docs/planning/README.md) § Конвенція
архівації (`Status: Archived (read-only)`, `Source:`, `Purpose:`) and update
inbound links to the `archive/` path. If no doc meets the bar this run,
archival is a deliberate no-op — never force it.

## Verification

- `pnpm docs:check-open-work`, `pnpm docs:check-today` green (trackers match).
- `pnpm docs:check-freshness-single-marker`, `pnpm docs:check-freshness-cadence`.
- `pnpm docs:check-links` (no broken links after any archive move).
- `pnpm lint:archive-move-depth` if a doc was archived.
- For code cards: `pnpm typecheck` after each surface (per deliver-squad).
- Land the whole batch as **one PR** on the batch branch.

## Red flags

- «Archive this doc, it looks old» → only archive on fully-complete evidence, not
  age or vibe. Reference, not stale, lives in `archive/` only as anti-regression.
- «Run all code cards fully in parallel» → a single cross-surface card is a
  sequential chain; only independent cards parallelize.
- «Hand-edit open-work.md» → it is generated; edit the source doc, then
  `pnpm docs:gen-daily`.
- «Flip the checkbox, the prose says done» → verify against `main` + pr-ledger
  first; prose drifts ahead of code.

## Playbooks

- [`docs/playbooks/execute-planning-batch.md`](../../../docs/playbooks/execute-planning-batch.md) — step-by-step recipe.
- [`docs/playbooks/reconcile-doc-drift.md`](../../../docs/playbooks/reconcile-doc-drift.md) — single-doc drift reconcile.
- [`docs/playbooks/run-squad-deliver.md`](../../../docs/playbooks/run-squad-deliver.md) — cross-surface code card chain.
- [`docs/agents/agent-skills-catalog.md`](../../../docs/agents/agent-skills-catalog.md) — skill routing catalog.
