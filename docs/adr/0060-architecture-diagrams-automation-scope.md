# ADR-0060: Architecture diagrams — automation scope (workspace graph only)

> **Last validated:** 2026-05-15 by @Skords-01. **Next review:** 2026-08-13.
> **Status:** Active

- **Status:** Proposed
- **Date:** 2026-05-15
- **Deciders:** @Skords-01
- **Supersedes:** —
- **Related:**
  - [`docs/initiatives/0014-knowledge-graph-and-catalogs.md`](../initiatives/0014-knowledge-graph-and-catalogs.md) §Phase 4
  - [`docs/architecture/diagrams/README.md`](../architecture/diagrams/README.md) — C4 model policy
  - [`docs/governance/symbol-index.json`](../governance/symbol-index.json) — input source (Phase 2)
  - [`docs/adr/0059-symbol-extraction-via-typescript-compiler-api.md`](./0059-symbol-extraction-via-typescript-compiler-api.md)

---

## Context and Problem Statement

Initiative 0014 §Phase 4 спочатку планував auto-gen C3 і C4 архітектурні діаграми з turbo graph + symbol-catalog (Phase 2). При підготовці імплементації виявилось:

1. **Existing C3 diagrams ≠ component-per-service.** Файли [`c3-cloudsync.md`](../architecture/diagrams/c3-cloudsync.md) і [`c3-chat-tool-use.md`](../architecture/diagrams/c3-chat-tool-use.md) — це **feature-flow діаграми** з 50+ рядками editorial narrative (контракт tool_use ↔ tool_result, prompt-cache breakpoints, тестування, дані-залежності). Auto-gen стер би операційний контекст.
2. **C4 explicitly excluded.** `docs/architecture/diagrams/README.md` фіксує «Не додавайте C4 рівень (Code) — TS типи й тестові снепшоти його замінюють». Це усвідомлене rule, не gap.
3. **Workspace-level dependency view відсутній.** Жодна з існуючих діаграм не показує `@sergeant/*` import-graph (workspaces × cross-imports). Це найочевидніший candidate для auto-gen — структурний, без editorial value, повністю derivable з Phase 2 даних.

Без рішення Phase 4 або (а) ламає existing C3 діаграми, або (б) пише C4 проти policy, або (в) пропускає auto-gen цілком.

## Considered Options

1. **Auto-gen workspace dependency graph as a new C3 diagram.** Додати `docs/architecture/diagrams/c3-workspaces.md` (auto-gen Mermaid LR-граф із `@sergeant/*` import-edges), не торкатись existing C3 / C4.
2. **Replace existing C3 with auto-gen versions.** Стерти editorial narrative; auto-gen лише структурний граф.
3. **Add C4 (code-level) per original plan.** Вступити в конфлікт з README policy + не зрозуміла користь у local-first архітектурі з замінниками (TS типи + test snapshots).
4. **Skip Phase 4 entirely.** Зекономити час, але втратити drift-detection для package graph (новий `@sergeant/<X>` без `c3-*.md` оновлення).

## Decision

Обираємо **Option 1 — Auto-gen workspace dependency graph as a new C3 diagram**.

Конкретно:

- **New file:** `docs/architecture/diagrams/c3-workspaces.md` (auto-gen, AUTO-GENERATED marker).
- **Generator:** `scripts/docs/generate-architecture-diagrams.mjs`.
- **Input:** `docs/governance/symbol-index.json` (Phase 2 output). Кожен `package.exports[].usedBy[]` запис → файл-шлях; групування за workspace prefix (`apps/*`, `packages/*`, `tools/*`) → cross-workspace edges.
- **Output content:**
  - Mermaid `flowchart LR` із node per workspace
  - Edge `A --> B` коли `A` імпортує з `B`
  - Visual differentiation: apps fill=blue, packages fill=green, tools fill=orange
  - Edge weight: usage count (informational, not styled)
  - Summary stats block: total workspaces, total edges, top 5 most-imported packages
- **No new dependency.** Pure JSON + string templating, mirroring previous generators.
- **Reuse:** scanner pattern from `generate-symbol-catalog.mjs` (workspace enumeration), HTML/Mermaid emit pattern from `generate-knowledge-graph.mjs`.
- **`--check` gate** wired into `pnpm lint`.

**Existing files untouched:**

- `c1-system-context.md` — human-narrative, hand-maintained (per README).
- `c2-containers.md` — human-narrative, hand-maintained (per README).
- `c3-cloudsync.md`, `c3-chat-tool-use.md` — feature-flow diagrams з editorial narrative; залишаються hand-maintained.
- `flow-*.md` — sequence flows, hand-maintained.
- C4 — skipped per repo policy.

## Rationale

- **Preserve editorial value.** Existing C3 діаграми мають operational знання (handler architecture, prompt-cache breakpoints, тестування) яке не можна вивести з коду. Той самий принцип, що Phase 3: drift-detector замість full-replacement.
- **Add genuine new artifact.** Workspace dependency view — це питання «який пакет залежить від чого», на яке зараз ніхто з C1-C3 не відповідає напряму. C2 (containers) має runtime-deployment view; новий c3-workspaces — build-time package view.
- **Catch new-workspace drift.** Якщо хтось додасть `packages/new-domain/` і `apps/web` почне з нього імпортувати — діаграма автоматично оновиться при наступному `pnpm docs:gen-architecture-diagrams`. `--check` gate ловить cases, де новий workspace додано без коммітання regenerated діаграми.
- **Zero new infrastructure.** Symbol-index.json уже існує + має всі потрібні дані. Не потребує `turbo run build --graph=<file>` (yet — можна додати у follow-up, якщо схочемо include build edges, які symbol-index не покриває).
- **Respect repo policy.** Не воюємо з README «no C4» rule — обходимо через додаткову C3-діаграму, що повністю automatable.

## Consequences

### Positive

- New diagram drives автоматичну візуалізацію package graph — single source of truth для «who depends on whom».
- `pnpm docs:check-architecture-diagrams` ловить drift при додаванні workspace без оновлення доку.
- Existing C3 narrative diagrams + C1/C2 narrative untouched — operational knowledge preserved.
- Initiative 0014 Phase 4 ships small, focused PR (one new auto-gen + one ADR).

### Negative

- Не покриває edge-кейси, які symbol-index пропускає: dynamic `await import()`, runtime resolution через `require()`, `package.json` `peerDependencies`. Mitigation: документуємо обмеження в auto-gen банері.
- Регекс-юседж-скан з Phase 2 — `import { x as y }` records `x`; aliased imports не дроп edge, але рахунок exports може бути неточний. Acceptable for visualization.

### Neutral

- C4 залишається ходу repo policy — нічого не змінюємо.
- Майбутній follow-up може додати окрему діаграму з turbo task-graph build-edges (covers tsconfig references, not imports).

## Compliance

- `pnpm docs:check-architecture-diagrams` (CI gate, wired у `pnpm lint`) — exit 1 якщо committed `c3-workspaces.md` ≠ regenerated.
- Initiative 0014 §Phase 4 — closed by цей PR з оновленим deviation note.
- HR-25 (Phase 5) — auto-gen marker check — automatically passes (новий файл починається з `<!-- AUTO-GENERATED -->`).

## Links

- [`docs/initiatives/0014-knowledge-graph-and-catalogs.md`](../initiatives/0014-knowledge-graph-and-catalogs.md) §Phase 4
