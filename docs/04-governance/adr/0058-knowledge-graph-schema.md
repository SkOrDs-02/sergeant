# ADR-0058: Knowledge graph schema and storage format

> **Last touched:** 2026-07-11 by @github-actions[bot]. **Next review:** 2026-10-09.
> **Status:** Active

- **Status:** Accepted
- **Date:** 2026-05-15
- **Deciders:** @Skords-01
- **Supersedes:** —
- **Related:**
  - [`docs/90-work/initiatives/archive/_0014-knowledge-graph-and-catalogs.md`](../../90-work/initiatives/archive/_0014-knowledge-graph-and-catalogs.md)
  - [`docs/04-governance/governance/schemas/knowledge-graph.schema.json`](../governance/schemas/knowledge-graph.schema.json)
  - [`scripts/docs/check-adr-graph.mjs`](../../../scripts/docs/check-adr-graph.mjs) — existing ADR-only graph validator
  - [`scripts/docs/generate-open-work.mjs`](../../../scripts/docs/generate-open-work.mjs) — existing one-way `docs → PR` extractor
  - [`docs/04-governance/adr/0045-hard-rules-taxonomy.md`](./0045-hard-rules-taxonomy.md) — precedent for JSON registry as source of truth

---

## Context and Problem Statement

Sergeant має 7 розрізнених каталогів артефактів (ADR / initiative / playbook / skill / hard-rule / audit / launch), кожен з власним генератором (`generate-playbook-index.mjs`, `generate-hard-rules-matrix.mjs`, `generate-open-work.mjs`, `check-adr-graph.mjs`, …). Ці генератори читають свій silo, не знають про сусідні. Не існує жодного запитуваного джерела істини, що відповідає на:

- Які playbook-и enforce-ять ADR-N?
- Які initiative-и торкаються `apps/server/sync`?
- Які skills документують hard rule #18?
- Які PR-и мутували initiative-0010 за останній місяць?

`check-adr-graph.mjs` має локальну графову модель — але лише для ADR-supersede ребер. `open-work.md` витягує `#NNNN` PR-згадки **з** документів — тільки в одному напрямку.

Початкова ініціатива 0014 додає бідіректіональні PR-backlinks (Phase 5) і auto-gen каталоги (Phases 2–4). Усі вони потребують спільної моделі: ноди (артефакти) + типізовані ребра (зв'язки).

## Considered Options

1. **Single JSON aggregator** — один файл `docs/04-governance/governance/knowledge-graph.json` зі схемою `{ nodes, edges }`, генерується з усіх існуючих silos. Schema у `docs/04-governance/governance/schemas/knowledge-graph.schema.json`.
2. **SQLite on disk** — `docs/04-governance/governance/knowledge-graph.sqlite` як binary артефакт; query через `better-sqlite3`. Дозволяє SQL-запити, складніша інтеграція в Git.
3. **Per-file frontmatter `links:`** — кожен doc оголошує свої вихідні ребра у frontmatter; aggregator склеює. Розподілена власність, але фрагментація і риск broken refs.
4. **Do nothing / status quo** — лишити 7 silo-генераторів, додавати ad-hoc cross-refs у markdown.

## Decision

Обираємо **Option 1 — Single JSON aggregator**.

Конкретно:

- **Schema:** `docs/04-governance/governance/schemas/knowledge-graph.schema.json` (JSON Schema draft-07).
- **Storage:** `docs/04-governance/governance/knowledge-graph.json` (auto-gen, committed) + `docs/04-governance/governance/knowledge-graph.html` (HTML viewer з inline CSS і Mermaid sub-графами per node type).
- **Generator:** `scripts/docs/generate-knowledge-graph.mjs` (підтримує `--check` flag, mirroring `generate-open-work.mjs` pattern).
- **Node types** (10): `adr`, `initiative`, `playbook`, `skill`, `hard-rule`, `audit`, `service`, `package`, `file`, `pr`.
- **Edge types** (6, typed): `supersedes`, `references`, `enforces`, `documents`, `owned-by`, `touched-by`.
- **Node id format:** `<type>:<slug>` — `adr:0045`, `hard-rule:18`, `playbook:add-api-endpoint`, `skill:sergeant-web-ui`. Стабільне через переіменування — `id` живе у frontmatter або в номері (для ADR/HR/initiative).
- **Tiering:** ноди мають `tier: core | extended` поле. Symbol-level (Phase 2) і file-level — `extended`, lazy-loaded в HTML viewer. Default tier у HTML — `core`.

## Rationale

- **JSON over SQLite:** Git-friendly diff, не потребує runtime (`better-sqlite3` додає native dep і ускладнює CI Windows). Read-only consumers — markdown viewers, GitHub UI — отримують структурований діф у PR.
- **Single file over per-file frontmatter:** Rule #10 lifecycle marker регламентує `> **Status:**` як єдиний required header — додавати `links:` у frontmatter ламає це інваріантне правило і ускладнює `bump-last-validated.mjs` husky hook.
- **Schema-first:** `hard-rules.json` уже має `hard-rules.schema.json` (ADR-0045 precedent). Та сама модель — JSON Schema + machine validator у generator + per-rule files. Дозволяє typed-tooling (LSP, VSCode validation) без runtime overhead.
- **Tiering:** після Phase 2 граф міститиме 10k+ symbol nodes; рендер без tiering деградує HTML viewer. `core` tier рендериться завжди, `extended` — за фільтром або через окремий `symbol-index.json`.
- **Typed edges over generic `links`:** ADR-0045 показав, що `kind` enum (`ci` / `eslint-rule` / `test` / `hook` …) робить registry queryable і CI-actionable. Той же підхід для cross-artifact edges.

## Consequences

### Positive

- Один queryable source-of-truth для всіх крос-каталогових запитів.
- Generator-and-validator pattern reusable для всіх 5 фаз ініціативи 0014.
- HTML viewer (inline CSS + Mermaid) — нульовий runtime, GitHub-rendered або browser-opened.
- Phase 5 PR-backlinks отримує безпечне місце для `touched-by` ребер без модифікації body docs.

### Negative

- Граф розростатиметься з symbol catalog → потрібно tier + lazy-load (mitigated).
- Aggregator має знати про кожний silo — `--check` gate може ламатись при додаванні нового tracker doc. Mitigation: scanner reuses `generate-open-work.mjs` `TRACKERS` config (єдине джерело).
- Generated JSON у git → noisy diffs при кожному merge. Mitigation: deterministic sort (alphabetic by id), stable formatting через prettier.

### Neutral

- Не змінює існуючі генератори (`generate-open-work.mjs`, `generate-hard-rules-matrix.mjs` тощо) — граф читає їх вихідні дані, не замінює.
- Не вимагає нових dependencies (no `better-sqlite3`, no `graphlib`).

## Compliance

- `pnpm docs:check-graph` (CI gate, wired у `pnpm lint` chain) — exit 1 якщо committed `knowledge-graph.json` ≠ regenerated.
- JSON Schema validation у генераторі — exit 1 на missing required fields або invalid edge target.
- Hard Rule #24 (HR-24, додається у Phase 1 PR): «All catalogs у `knowledge-graph.json` MUST мати `--check` generator wired у `pnpm lint`».

## Links

- [`docs/90-work/initiatives/archive/_0014-knowledge-graph-and-catalogs.md`](../../90-work/initiatives/archive/_0014-knowledge-graph-and-catalogs.md)

<!-- AUTO-GENERATED: PR-BACKLINKS-START -->

## Recent PRs

| PR                                                       | Title                                                           | Merged     |
| -------------------------------------------------------- | --------------------------------------------------------------- | ---------- |
| [#2876](https://github.com/Skords-01/Sergeant/pull/2876) | feat(docs): knowledge graph generator (Initiative 0014 Phase 1) | 2026-05-15 |

_Auto-derived from `docs/04-governance/pr-ledger/index.json`. Top 1 most recent PRs touching this file._
<!-- AUTO-GENERATED: PR-BACKLINKS-END -->
