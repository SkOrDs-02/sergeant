# 0014 — Knowledge graph & auto-generated catalogs

> **Last validated:** 2026-06-08 by @claude. **Next review:** 2026-09-06.
> **Status:** Done (all 5 phases shipped; HR-24/25/26 deferred to follow-up)
> **Priority:** P2
> **Owner:** `@Skords-01`
> **ETA:** 5 phases (≈4–5 тижнів), **~12 PR-ів**
> **Sources:** [`docs/02-engineering/architecture/repo-map.md`](../../02-engineering/architecture/repo-map.md), [`docs/02-engineering/architecture/service-catalog.md`](../../02-engineering/architecture/service-catalog.md), [`docs/02-engineering/architecture/diagrams/`](../../02-engineering/architecture/diagrams), [`docs/governance/freshness-dashboard.html`](../../governance/freshness-dashboard.html), [`AGENTS.md`](../../../AGENTS.md) Hard Rules #10 / #15.

## TL;DR

Об'єднуємо ADR / playbook / skills / hard-rules / open-work / initiatives / audits у єдиний knowledge graph (`docs/governance/knowledge-graph.{json,html}`). Додаємо post-merge GitHub Action для bidirectional PR ↔ doc backlinks (`docs/pr-ledger/index.json` + AUTO-GEN блок «Recent PRs»). Генеруємо `service-catalog.md`, `repo-map.md`, per-package symbol catalog (`packages/*/symbols.json`) і архітектурні діаграми C3/C4 безпосередньо з коду (workspaces, server routes, turbo graph, TS AST через ts-morph). 5 hand-maintained артефактів → auto-gen з `--check` gates у `pnpm lint`. C1/C2 діаграми лишаються human-narrative.

## Чому зараз

- Freshness dashboard уже флагає `service-catalog`/`repo-map` як stale — drift підтверджений. `dev-stack-roadmap.md` ribbon stale-marker з-за ручних оновлень.
- 7 каталогів (ADR / initiative / playbook / skill / hard-rule / audit / launch) живуть у silo — `open-work.md` тільки агрегує `Status:` хедери, не зв'язки. Немає одного запитуваного джерела «що торкається `apps/server/sync`?».
- Conventional Commits + scope enum уже є (Hard Rule #5), але після merge інформація PR → doc втрачається. Зворотний напрямок (`open-work.md` витягує PR-згадки **з** docs) асиметричний.
- Symbol catalog розблоковує точніший dead-code detection (краще за `knip` без AST) і convention-drift detection (PR-плани з `docs/planning/pr-plan-dead-code-hard-rules-2026-05.md`).
- C3/C4 Mermaid діаграми ручні → завжди відстають від реального import graph; `c3-*.md` стейл найдовше.

## Скоуп

**In:**

- `docs/governance/knowledge-graph.{json,html}` — unified graph (nodes + typed edges) + HTML viewer (inline CSS, Mermaid sub-графи).
- `docs/governance/schemas/knowledge-graph.schema.json` — canonical schema (JSON Schema draft-07).
- `.github/workflows/pr-backlinks.yml` + `scripts/ci/update-pr-backlinks.mjs` + `docs/pr-ledger/index.json` + AUTO-GEN блок `## Recent PRs` (≤5 latest) у touched ADR/initiative/playbook/rule файлах.
- Auto-gen `docs/02-engineering/architecture/service-catalog.md`, `docs/02-engineering/architecture/repo-map.md` зі скан-инпутів (`pnpm-workspace.yaml`, `package.json` per workspace, `Dockerfile.*`, `railway.*.toml`, server route registrations, CODEOWNERS).
- Per-package `symbols.json` (auto-gen через ts-morph) + `docs/governance/symbol-index.{json,html}` з cross-package usage counts.
- Auto-gen Mermaid для C3 (component-per-service з turbo task graph + service-catalog) і C4 (code-level з symbol catalog cross-refs).
- 4 нових `--check` gates у `pnpm lint`: `docs:check-graph`, `docs:check-symbols`, `docs:check-service-catalog` + `docs:check-repo-map`, `docs:check-architecture-diagrams`.
- 4 ADRs: graph schema, ts-morph rationale, C4 automation boundary, PR backlink storage.
- 3 нові hard rules (HR-24/25/26) у `hard-rules.json` + per-rule canonical files у `docs/governance/rules/`.

**Out (v1):**

- Slack/email notifications на stale graph nodes.
- Інтерактивний D3/vis.js viewer — лише статичний HTML+Mermaid.
- Refactor існуючих 7 генераторів читати з графа (graph — additive aggregator).
- Cross-repo links.
- Backfill PR-ledger історії до merge цієї ініціативи.
- `dev-stack-roadmap.md` auto-gen (лежить у `docs/planning/`, не `docs/02-engineering/architecture/`; залишається hand-maintained).

## План змін

Детальний план файлів та DoD по фазах — `C:\Users\dmytr\.claude\plans\deep-waddling-blum.md` (approved 2026-05-15).

### Phase 1 — Graph schema + aggregator (M)

**Goal:** Single JSON source-of-truth, що об'єднує всі існуючі каталоги.

**Files:**

- `scripts/docs/generate-knowledge-graph.mjs` (new)
- `docs/governance/knowledge-graph.json` (auto-gen)
- `docs/governance/knowledge-graph.html` (auto-gen, inline CSS, Mermaid sub-graphs)
- `docs/governance/schemas/knowledge-graph.schema.json` (new)
- `package.json` — `docs:gen-graph`, `docs:check-graph` у lint chain
- `docs/adr/0058-knowledge-graph-schema.md` (new)

**Nodes:** `adr`, `initiative`, `playbook`, `skill`, `hard-rule`, `audit`, `service`, `package`, `file`, `pr`.
**Edges (typed):** `supersedes`, `references`, `enforces`, `documents`, `owned-by`, `touched-by`.

**DoD:** граф містить ноди для всіх existing ADR / initiative / playbook / skill / rule / audit; edges типізовані за schema; HTML viewer рендерить Mermaid sub-графи по типу ноди; `pnpm docs:check-graph` green; JSON Schema validates.

### Phase 2 — Symbol catalog (M)

**Goal:** Per-package JSON експортованих символів + cross-package usage counts.

**Files:** `scripts/docs/generate-symbol-catalog.mjs`, `packages/*/symbols.json` + `apps/*/symbols.json`, `docs/governance/symbol-index.{json,html}`, `docs/adr/0059-symbol-extraction-via-ts-morph.md`.

**Implementation decision:** ts-morph (rejected raw `tsc` API — boilerplate; `tsx` introspection — втрачає type info, side-effects).
**Performance:** per-package incremental cache keyed на source mtime; CI запускає лише touched packages (`turbo --filter=...[HEAD^1]`).
**DoD:** кожен workspace має свіжий `symbols.json`; cross-ref index показує `usedBy[]`; dead-export count експонований.

### Phase 3 — Drift-detector for service-catalog + repo-map (S) — **shipped**

**Deviation from original plan.** Initially planned full-replacement (`docs/02-engineering/architecture/service-catalog.md` і `repo-map.md` → AUTO-GENERATED, hand content в `docs/_archive/`). При імплементації стало ясно, що editorial columns ці markdown-ів (runbook / alerts / rollback / data-sensitivity для service-catalog; Purpose / Test stacks / Build outputs narrative для repo-map) **не похідні з коду** — full-replacement стер би operational знання.

Переключились на **drift-detector**: hand-maintained markdown зберігається; додатковий machine-readable mirror (`docs/governance/{service-catalog,repo-map}.auto.json`) генерується з Dockerfile / railway.toml / pnpm-workspace.yaml / CODEOWNERS, з `--check` gate що валідує coverage (кожен workspace/surface у JSON мусить бути згаданий у markdown). Це catches drift без втрати editorial value.

**Files shipped:**

- `scripts/docs/generate-repo-map.mjs` + `docs/governance/repo-map.auto.json` + `docs/governance/schemas/repo-map.schema.json`
- `scripts/docs/generate-service-catalog.mjs` + `docs/governance/service-catalog.auto.json` + `docs/governance/schemas/service-catalog.schema.json`
- Banner у `docs/02-engineering/architecture/service-catalog.md` і `docs/02-engineering/architecture/repo-map.md` що посилається на machine-readable mirror
- `pnpm docs:check-repo-map` + `pnpm docs:check-service-catalog` wired у lint chain (також restored `pnpm docs:check-symbols` що було пропущено у Phase 2 merge)

**DoD:** обидва `--check` gates green; markdown coverage validates every workspace + surface.

### Phase 4 — Workspace dependency diagram (S) — **shipped**

**Deviation from original plan.** Initially planned full C3 + C4 automation. При підготовці імплементації виявилось:

1. Існуючі `c3-cloudsync.md` і `c3-chat-tool-use.md` — це **feature-flow діаграми з editorial narrative** (контракт tool_use, prompt-cache, тестування, дані-залежності), не component-per-service.
2. `docs/02-engineering/architecture/diagrams/README.md` explicitly відкидає C4: «Не додавайте C4 рівень (Code) — TS типи й тестові снепшоти його замінюють».
3. Жодна з existing діаграм не показує `@sergeant/*` workspace import-graph — це найочевидніший candidate для auto-gen.

Переключились на single auto-gen artifact: **workspace dependency graph** як новий C3-level діаграму. Зберігаємо editorial value existing feature-flow діаграм, поважаємо «no C4» policy. ADR-0060 документує scope.

**Files shipped:**

- `scripts/docs/generate-architecture-diagrams.mjs` — читає `docs/governance/symbol-index.json` (Phase 2) → group `usedBy[]` file paths by workspace prefix → cross-workspace edges
- `docs/02-engineering/architecture/diagrams/c3-workspaces.md` (auto-gen) — Mermaid LR-граф із node per workspace + edges; top-5 most-imported workspaces stats
- `docs/adr/0060-architecture-diagrams-automation-scope.md` — rationale
- `pnpm docs:check-architecture-diagrams` wired у lint chain

**Existing C1/C2/C3-feature/flow діаграми untouched.**

**DoD:** `--check` gate green; c3-workspaces.md показує current package graph + drift-detection при додаванні workspace.

### Phase 5 — Bidirectional PR ↔ doc backlinks (M) — **shipped**

**Files shipped:**

- `.github/workflows/pr-backlinks.yml` — `pull_request_target: closed` + `merged == true`; loop-guard skips `head_ref` що починається з `docs/pr-backlinks-`
- `scripts/ci/update-pr-backlinks.mjs` — три режими: `--pr <N>` (CI), `--rebuild-blocks` (manual after ledger edit), `--check` (CI gate)
- `docs/pr-ledger/index.json` — canonical reverse registry; valid за `docs/governance/schemas/pr-ledger.schema.json` (JSON Schema draft-07)
- `docs/pr-ledger/README.md` — operator guide (whitelist, manual ops, limitations)
- `docs/adr/0061-pr-backlink-storage.md` — hybrid storage rationale
- `pnpm docs:check-pr-ledger` + `pnpm docs:gen-pr-backlinks` wired у lint chain

**Storage:** hybrid — JSON ledger канонічний (без N-file noise) + AUTO-GEN block `<!-- AUTO-GENERATED: PR-BACKLINKS-START -->` у тілі кожного canonical doc (топ-5 latest). Marker detection — line-anchored regex (дозволяє literal згадки в backticks всередині ADR-0061 body).

**Workflow strategy:** action **відкриває follow-up PR** `docs/pr-backlinks-NNNN` замість push-на-main (Hard Rule #6).

**Canonical doc whitelist:** `docs/adr/*.md`, `docs/initiatives/*.md`, `docs/00-start/playbooks/*.md`, `docs/governance/rules/*.md` (з винятками README/TEMPLATE/`_`-prefix).

**Deferred to follow-up PR:** HR-24 (all catalogs must have `--check` generator), HR-25 (auto-gen marker enforcement), HR-26 (merged docs-PRs must update ledger). Hard-rules registry update вимагає 3-way sync (`hard-rules.json` ↔ AGENTS.md ↔ per-rule files) — окремий focused PR.

**DoD:** `--check` gate green на порожньому ledger; workflow деплоїться; перший real merge auto-create follow-up PR з backlinks.
**DoD:** merge doc-touching PR → ledger + in-doc блок оновлені в межах одного workflow run; graph (Phase 1) re-renders `touched-by` edges.

## Dependencies / Ordering

1. **Phase 1 first** — schema, у яку всі інші пишуть.
2. **Phase 2 перед Phase 4** — symbol data feed-ить C4 diagrams.
3. **Phase 3 незалежна** від Phase 2, але легша після Phase 1.
4. **Phase 5 last** — потребує stable doc structure для безпечного back-writing; всі AUTO-GEN блоки мають бути idempotent перед Phase 5.

## ADRs to open

1. **ADR-0058** — Knowledge graph schema and storage format (single JSON aggregator).
2. **ADR-0059** — Symbol extraction via ts-morph.
3. **ADR-0060** — C4 diagram automation boundary (C1/C2 human, C3/C4 auto).
4. **ADR-0061** — PR backlink storage strategy (hybrid ledger + in-doc block).

## New hard rules

- **HR-24:** All catalogs у `knowledge-graph.json` MUST мати `--check` generator wired у `pnpm lint` (category: `lint-enforced-convention`).
- **HR-25:** Auto-generated docs MUST починатись з `<!-- AUTO-GENERATED -->` marker; CI rejects hand edits нижче marker (category: `lint-enforced-convention`).
- **HR-26:** Merged PRs, що torchat `docs/**`, MUST оновити `pr-ledger/index.json` (category: `lint-enforced-convention`, Phase 5).

## Критерії DONE

- ✅ 5 hand-maintained артефактів (service-catalog, repo-map, 2× C3 diagrams, 1× C4 diagram) замінено на auto-gen з зеленим `--check`.
- ✅ `knowledge-graph.json` містить ≥ всі поточні ADRs / initiatives / playbooks / skills / rules / audits / services / symbols.
- ✅ Кожен merged doc-touching PR з'являється у `pr-ledger/index.json` протягом одного workflow run.
- ✅ `pnpm lint` chain містить 4 нові `--check` invocations.
- ✅ Freshness dashboard показує нуль stale auto-gen артефактів.
- ✅ 4 ADRs Accepted; 3 нові hard rules у `hard-rules.json` + per-rule files + matrix.

## Ризики

1. **Graph size explosion** (10k+ symbol nodes стискають HTML viewer) → tier nodes (`core` / `extended`); HTML рендерить core за замовчуванням; symbol-level окремий `symbol-index.json` lazy-loaded.
2. **Post-merge workflow flakes або churn на main** → workflow **відкриває follow-up PR** замість push-на-main (Hard Rule #6); debounce — батчинг.
3. **ts-morph повільний на повному monorepo** (cold full-scan) → per-package incremental cache keyed на source mtime; CI запускає лише changed packages.

## Verification plan

1. Per-generator round-trip: `--check` на clean tree → exit 0. Мутувати source → re-run → diff matches expectation.
2. Golden fixtures: snapshot `knowledge-graph.json` для frozen subset репо (10 ADRs + 5 initiatives + 3 playbooks); CI порівнює.
3. PR backlinks E2E: `workflow_dispatch` на recent merged PR → перевірити ledger + in-doc блок.
4. HTML dashboards: відкрити `knowledge-graph.html` і `symbol-index.html` у браузері; Mermaid рендериться, links resolve.
5. Diagram semantic diff: auto-gen C3 vs archived hand-drawn — semantic diff (ноди + ребра).
6. Full `pnpm lint` має бути зелений з усіма 4 новими gates.
7. Performance: `pnpm docs:gen-symbols` на cold cache < 60 s; warm < 5 s.

<!-- AUTO-GENERATED: PR-BACKLINKS-START -->

## Recent PRs

| PR                                                       | Title                                                                         | Merged     |
| -------------------------------------------------------- | ----------------------------------------------------------------------------- | ---------- |
| [#2899](https://github.com/Skords-01/Sergeant/pull/2899) | feat(ci): bidirectional PR ↔ doc backlinks (Initiative 0014 Phase 5)          | 2026-05-15 |
| [#2898](https://github.com/Skords-01/Sergeant/pull/2898) | feat(docs): auto-gen workspace dependency diagram (Initiative 0014 Phase 4)   | 2026-05-15 |
| [#2896](https://github.com/Skords-01/Sergeant/pull/2896) | feat(docs): auto-derived repo-map + service-catalog (Initiative 0014 Phase 3) | 2026-05-15 |
| [#2876](https://github.com/Skords-01/Sergeant/pull/2876) | feat(docs): knowledge graph generator (Initiative 0014 Phase 1)               | 2026-05-15 |

_Auto-derived from `docs/pr-ledger/index.json`. Top 4 most recent PRs touching this file._

<!-- AUTO-GENERATED: PR-BACKLINKS-END -->
