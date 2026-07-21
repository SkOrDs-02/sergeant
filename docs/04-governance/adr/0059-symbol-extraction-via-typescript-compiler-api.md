# ADR-0059: Symbol extraction via TypeScript compiler API (no ts-morph)

> **Last touched:** 2026-07-21 by @github-actions[bot]. **Next review:** 2026-10-19.
> **Status:** Active

- **Status:** Accepted
- **Date:** 2026-05-15
- **Deciders:** @Skords-01
- **Supersedes:** —
- **Related:**
  - [`docs/90-work/initiatives/archive/_0014-knowledge-graph-and-catalogs.md`](../../90-work/initiatives/archive/_0014-knowledge-graph-and-catalogs.md) §Phase 2
  - [`docs/04-governance/adr/0058-knowledge-graph-schema.md`](./0058-knowledge-graph-schema.md)
  - [`scripts/docs/generate-symbol-catalog.mjs`](../../../scripts/docs/generate-symbol-catalog.mjs)
  - [`docs/04-governance/governance/schemas/symbol-catalog.schema.json`](../governance/schemas/symbol-catalog.schema.json)

---

## Context and Problem Statement

Phase 2 ініціативи 0014 потребує per-workspace symbol catalog (`packages/*/symbols.json`, `apps/*/symbols.json`) — ~~`tools/openclaw/symbols.json` видалено разом із OpenClaw (ADR-0075)~~ — це разблоковує точніший dead-code detection, convention-drift detection і feed-ить C4 діаграми (Phase 4) через cross-package usage counts.

Для парсингу TypeScript-експортів є три реалістичні підходи:

1. **ts-morph** — high-level wrapper над TypeScript compiler API. Зручний DX (Project / SourceFile / ExportedDeclarations), але heavy dep (~5MB зі залежностями, повторно тримає TS instance у пам'яті, +30–60s install time на cold).
2. **TypeScript compiler API directly** (`import ts from "typescript"`). TypeScript уже у `devDependencies` як `^6.0.3` — нульова додаткова вага. Boilerplate `ts.createSourceFile` + `ts.forEachChild` AST walking, але повна гнучкість.
3. **Regex-based** парсинг `export …` рядків. Швидко, але крихко: не обробляє multi-line declarations, condition-imports, dynamic export forms (`Object.assign(module.exports, ...)`), і не валідуэ синтаксис.

Початковий план (Initiative 0014 Phase 2) вказував **ts-morph** як default. Під час імплементації стало очевидно, що TypeScript compiler API напряму закриває всі потреби Phase 2 без додавання залежності.

## Considered Options

1. **ts-morph** — як планувалось у Initiative 0014.
2. **TypeScript compiler API directly** — `import ts from "typescript"` + `ts.createSourceFile` без додаткових залежностей.
3. **Regex-based** — швидкий, але крихкий.
4. **Hybrid:** regex для усього monorepo + TS compiler API для valid AST walking entry-файлів.

## Decision

Обираємо **Option 2 — TypeScript compiler API directly**.

Конкретно:

- `scripts/docs/generate-symbol-catalog.mjs` імпортує `import ts from "typescript"` напряму.
- Для кожного workspace, що має `package.json`, генератор резолвить entry file через resolution order:
  1. `exports["."].types | .import | .default`
  2. `pkg.types`
  3. `pkg.main`
  4. `./src/index.ts` → `./src/index.tsx` → `./index.ts`
- AST walk через `ts.createSourceFile` + `ts.forEachChild` collects top-level export forms: `export function | class | enum | interface | type | const`, `export { a, b } [from "..."]`, `export * from "..."`, `export default`.
- Cross-package usage scan — **regex-based** на всіх `.ts/.tsx/.mts/.cts` файлах під workspace `src/` (skip-list: `node_modules`, `dist`, `build`, `.turbo`, `coverage`, `__tests__`).
- Output: `<workspace>/symbols.json` (per-package) + `docs/04-governance/governance/symbol-index.{json,html}` (aggregated).
- `--check` flag для CI gate, mirroring `generate-knowledge-graph.mjs` pattern.

Hybrid не обираємо — entry-AST + cross-package regex вже є де-факто hybrid; додатковий шар не додає accuracy для Phase 2 use-cases.

## Rationale

- **Zero new dependency.** ts-morph внесе ~5MB у `node_modules`, +30–60s до cold `pnpm install`, і свій трекінг TS compiler instance — Сергеант уже керує TS через `@types/node` pin (ADR-0050). Менше surface area = менше з чим Renovate (ADR-0044) має боротись.
- **TypeScript 6 compatibility певне.** ts-morph 25.x офіційно підтримує TS 5.x; TS 6.x — мажорна версія, ts-morph майже завжди катчиться up із затримкою (історично — 2–6 тижнів). Compiler API напряму завжди працює з ту версією TS, що встановлена.
- **API surface для Phase 2 вузький.** Нам потрібні: top-level export declarations + module specifiers. Це ~5 `ts.SyntaxKind` гілок. ts-morph було б over-engineering — ми не використовуємо його ExportedDeclarations, type-checker, symbol resolution.
- **Performance.** Без ts-morph немає init overhead (`Project.addSourceFilesAtPaths`); compiler API `ts.createSourceFile` працює inline за O(N) file size. Cold-run на всі 17 workspace-ів: ~0.8s, well under 5s warm-cache target.
- **Reusable у Phase 4.** Той самий compiler-API pattern (entry file → AST → declarations) масштабується на C4 діаграми (cross-reference graph). Один навчальний шар у репо, не два.

**Cross-package usage — regex, не AST**, оскільки:

1. Усі імпорти у Sergeant — ESM static (`import { x } from "@sergeant/foo"`). Dynamic `await import()` для `@sergeant/*` не зустрічається у production коді (лише у scripts/test-fixtures, які skip-list виключає).
2. Regex `/import.*from\s+["']@sergeant\/[\w-]+["']/g` — O(N) per file vs full AST parse O(N · constant) — а constant tут 10–50×.
3. Trade-off: `import { x as y }` → records `x` (the original export name). Це **правильно** для usage tracking — `usedBy[]` має мапити на declared export, не on call-site alias.

## Consequences

### Positive

- Нульова нова dependency у repo.
- Compiler-API pattern переноситься у Phase 4 (architecture diagrams), Phase 3 (service catalog — server route walk).
- Faster CI: ~0.8s cold-run для всього monorepo.
- Менший risk surface для TS major bumps.

### Negative

- Boilerplate ~50 рядків (визначення `ts.isFunctionDeclaration`, `ts.isClassDeclaration`, etc.) — vs ~10 з ts-morph.
- Регекс-юседж-скан не розв'язує type-only re-exports крізь tree of barrels (`export type * from "./a/b/c"` глибше за 1 рівень). Phase 2 v1 рахує лише top-level entry exports; deep re-export chains позначаються як `re-export-star` без розкриття.
- Aliased imports (`import { x as y }`) маплються на `x`, не на `y`. Для usage-count це коректно, але для convention-drift detection знадобиться додатковий pass.

### Neutral

- TypeScript 6 vendor lock не змінюється — ADR-0050 уже фіксує major-version policy.
- Per-package `symbols.json` додає 17 файлів у git (committed для diffability + simpler downstream consumption).

## Compliance

- `pnpm docs:check-symbols` (CI gate, wired у `pnpm lint`) — exit 1 якщо committed `symbols.json` / `symbol-index.{json,html}` ≠ regenerated.
- Initiative 0014 §Phase 2 DoD — закривається merge-ом цього PR.
- Майбутній Hard Rule (HR-24, доданий у Phase 5 PR) — «All catalogs у `knowledge-graph.json` MUST мати `--check` generator» — automatically satisfied (symbol-index.json node-type буде доданий до граф-генератора у Phase 5 follow-up).

## Links

- [`docs/90-work/initiatives/archive/_0014-knowledge-graph-and-catalogs.md`](../../90-work/initiatives/archive/_0014-knowledge-graph-and-catalogs.md) §Phase 2

<!-- AUTO-GENERATED: PR-BACKLINKS-START -->

## Recent PRs

| PR                                                       | Title                                                                | Merged     |
| -------------------------------------------------------- | -------------------------------------------------------------------- | ---------- |
| [#364](https://github.com/Skords-01/Sergeant/pull/364)   | docs(adr): sync ADR registry and operator docs with Coolify/ADR-0075 | 2026-07-21 |
| [#2889](https://github.com/Skords-01/Sergeant/pull/2889) | feat(docs): per-package symbol catalog (Initiative 0014 Phase 2)     | 2026-05-15 |

_Auto-derived from `docs/04-governance/pr-ledger/index.json`. Top 2 most recent PRs touching this file._
<!-- AUTO-GENERATED: PR-BACKLINKS-END -->
