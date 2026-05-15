# ADR-0061: PR ↔ doc backlinks — hybrid storage (ledger + in-doc block)

> **Last validated:** 2026-05-15 by @Skords-01. **Next review:** 2026-08-13.
> **Status:** Active

- **Status:** Proposed
- **Date:** 2026-05-15
- **Deciders:** @Skords-01
- **Supersedes:** —
- **Related:**
  - [`docs/initiatives/0014-knowledge-graph-and-catalogs.md`](../initiatives/0014-knowledge-graph-and-catalogs.md) §Phase 5
  - [`docs/adr/0058-knowledge-graph-schema.md`](./0058-knowledge-graph-schema.md) — graph schema with `pr` node type
  - [`scripts/docs/generate-open-work.mjs`](../../scripts/docs/generate-open-work.mjs) — existing forward extractor (docs → PR mentions)
  - [`.github/workflows/pr-backlinks.yml`](../../.github/workflows/pr-backlinks.yml) — implementation

---

## Context and Problem Statement

Sergeant уже екстрагує `#NNNN` PR-згадки **з** документів (`generate-open-work.mjs`, `generate-knowledge-graph.mjs` `touched-by` edges). Зворотного напрямку немає: коли PR merge-иться, інформація про те, які канонічні документи (ADR / initiative / playbook / rule) він торкався, втрачається — окрім ручної редакції тіла initiative/playbook доку.

Це асиметрія: forward link (doc → PR) автоматичний, reverse (PR → doc) ручний. На практиці reverse-направлення критичне для:

- «Які PR-и торкались initiative 0010 за останній місяць?» (status review)
- «Хто рефакторив playbook `add-api-endpoint` після його validation?» (audit trail)
- «Чи зачіпали останні merge-и hard-rule 18?» (process governance)

Зараз відповіді розкидані в git log + GitHub UI. Потрібен **canonical machine-readable backlink registry** + **читабельне посилання у doc body**, щоб reviewer/agent одразу бачив свіжі дотики.

## Considered Options

1. **Hybrid:** single JSON ledger (`docs/pr-ledger/index.json`) як canonical source + автогенерований block `<!-- AUTO-GENERATED: PR-BACKLINKS-START -->` з ≤5 останніх PR у тілі кожного канонічного дока.
2. **Per-PR markdown files** (`docs/pr-ledger/PR-NNNN.md`). Кожен merged PR отримує власний файл.
3. **JSON ledger only**, no in-doc block. Контриб'ютори переходять у ledger для backlinks.
4. **In-doc block only**, no canonical registry. Кожен doc — local source of truth.
5. **Use GitHub Issues / Discussions** as reverse index — повністю поза repo.

## Decision

Обираємо **Option 1 — Hybrid (ledger + in-doc block)**.

Конкретно:

- **Canonical store:** `docs/pr-ledger/index.json` — JSON-схема draft-07 у `docs/governance/schemas/pr-ledger.schema.json`. Шейп:
  ```json
  {
    "version": 1,
    "generated_at": "2026-05-15",
    "prs": [
      {
        "number": 2876,
        "title": "feat(docs): knowledge graph generator (Initiative 0014 Phase 1)",
        "merged_at": "2026-05-15T...",
        "author": "@Skords-01",
        "touchedDocs": ["docs/adr/0058-...", "docs/initiatives/0014-..."]
      }
    ]
  }
  ```
- **Canonical doc paths** що отримують backlinks (whitelist у script):
  - `docs/adr/*.md` (крім TEMPLATE.md, README.md)
  - `docs/initiatives/*.md` (крім archive/, follow-ups.md, README.md)
  - `docs/playbooks/*.md` (крім INDEX.md, README.md, \_TEMPLATE-*)
  - `docs/governance/rules/*.md` (крім README.md)
- **In-doc block format** (appended at file end, idempotent). The block is delimited by HTML-comment markers `<!-- AUTO-GENERATED: PR-BACKLINKS-START -->` and `<!-- AUTO-GENERATED: PR-BACKLINKS-END -->` and contains a `## Recent PRs` heading with a 3-column markdown table (PR link, title, merge date). Example layout — see any canonical doc that has merged through Phase 5 for a real instance.

- **Update mechanism:** GitHub Action `.github/workflows/pr-backlinks.yml`, trigger `pull_request_target: closed` + `merged == true`. Уникає прямого push на main (Hard Rule #6) — **відкриває follow-up PR** `docs/pr-backlinks-NNNN` із оновленням ledger + in-doc blocks.
- **Loop prevention:** workflow skip-ається коли `head_ref` starts with `docs/pr-backlinks-`.
- **`--check` gate (`pnpm docs:check-pr-ledger`)**: валідує, що ledger ↔ in-doc blocks ↔ JSON schema у sync. Wired in `pnpm lint`.

## Rationale

- **Hybrid balances UX vs noise.** JSON-only — погана contributor UX (треба окремо переходити). In-doc-only — N×M duplication, кожен doc редагується при кожному merge.
- **Single canonical store enables tooling.** Phase 1 graph generator уже має `pr` node type + `touched-by` edge тип; ledger feeds graph generator без додаткового scanner-а.
- **Follow-up PR strategy respects Hard Rule #6.** No force-push, no direct main-write. Trade-off: 1-PR latency для backlinks update. Acceptable (backlinks не блокують жодну CI gate).
- **Path whitelist scopes thrashing.** Чотири класи canonical docs (ADR / initiative / playbook / rule) — стабільні, рідко перейменовуються. Не whitelist-уємо `docs/audits/` бо audits є snapshot-документами; не whitelist-уємо `docs/architecture/` бо там auto-gen mirrors з Phase 3, які регулярно міняються від drift-detector.
- **Idempotent block format.** START/END markers роблять регенерацію O(N) string-rewrite без AST-парсингу markdown.

## Consequences

### Positive

- Reverse PR ↔ doc binding автоматичний; agent / reviewer не залежить від git-arc.
- Ledger feeds knowledge-graph (Phase 1) — додаткові `touched-by` edges на основі canonical merge data, не лише textual `#NNNN` згадок у doc body.
- Closes initiative 0014 §Phase 5 — bidirectional linking complete.

### Negative

- Кожен doc-touching PR створює ще один (мікроскопічний) follow-up PR — collateral PR-noise. Mitigation: batching у scheduled run (defer).
- In-doc block змінює тіло канонічних доків — кожна авто-зміна формально дорівнює edit ADR/initiative/playbook. Mitigation: AUTO-GENERATED marker + path-scoped lint warns reviewers.
- Follow-up PR має пройти review (HR-7 husky, branch-protection). Якщо maintainer на vacation, backlinks накопичуються. Mitigation: scheduled batch run (manual or weekly cron).

### Neutral

- ADR-0058 (graph schema) уже передбачає `pr` node type — додаткова робота 0.
- HR-24 / HR-25 / HR-26 (нові hard rules per Phase 5 plan) **deferred to follow-up PR** — Phase 5 PR scope обмежений mechanic-ом, registry update — окремим step-ом.

## Compliance

- `pnpm docs:check-pr-ledger` (CI gate, wired in `pnpm lint`) — exit 1 коли ledger ↔ in-doc blocks divergent.
- `.github/workflows/pr-backlinks.yml` runs on every doc-touching merge.
- Hard Rule #6 (no force-push to main): respected — follow-up PR pattern.
- Hard Rule #7 (no `--no-verify`): respected — workflow uses regular `git commit` without hook skip.

## Links

- [`docs/initiatives/0014-knowledge-graph-and-catalogs.md`](../initiatives/0014-knowledge-graph-and-catalogs.md) §Phase 5
- [`docs/governance/schemas/pr-ledger.schema.json`](../governance/schemas/pr-ledger.schema.json)
