# Rule 10 — Lifecycle markers — every file/doc declares its status

> **Category:** `lint-enforced-convention`
> **Severity:** `blocker`
> **Last validated:** 2026-09-06 by Codex. **Last touched:** 2026-09-23 by @claude (enforced_by: CI-only записи позначено SUSPENDED - CI на Bitbucket не запускається). **Next review:** 2027-03-06.
> **Status:** Active

> Per-rule canonical body for Hard Rule #10. Compact summary lives in [`AGENTS.md § Hard rules`](../../../../AGENTS.md#hard-rules-do-not-break) (rendered as a table). The machine-readable registry lives in [`docs/governance/governance/hard-rules.json`](../hard-rules.json). The 3-way sync (AGENTS.md ↔ JSON ↔ this file) is enforced by `pnpm lint:hard-rules-registry`.

## Scope

- `apps/**/*.{ts,tsx,js,jsx,mjs,cjs}`
- `packages/**/*.{ts,tsx,js,jsx,mjs,cjs}`
- `docs/**/*.md`
- `scripts/**/*.{mjs,js}`

## Enforced by

- **eslint-rule** — sergeant-design/ai-marker-syntax (error)
- **ci** - `.github/workflows/ai-legacy-scan.yml` (PR, path-filtered): `node scripts/check-ai-legacy.mjs --check --require-issue` (відновлено 2026-09-30, ADR-0101)
- **ci** - SUSPENDED: pnpm dead-code:files (honours @scaffolded markers) не стоїть ні в жодному workflow, ні в `pnpm lint`/`pnpm check`; сирий `pnpm knip` біжить у джобі `Dead Code (Knip)` у `ci.yml`

> **Не гейт, а лічильник:** `pnpm lint:lifecycle-markers`
> ([`check-lifecycle-markers.mjs`](../../../../scripts/docs/check-lifecycle-markers.mjs))
> рахує частку файлів `apps/web/src/**` з ЯВНИМ маркером. Це спостереження, а
> не enforcement цього правила — див. наступний абзац: файл без маркера
> правилу **відповідає**.
>
> Звірка 2026-09-19 знайшла, що і скрипт, і крок CI обіцяли «burn-down до
> 2026-Q3» і промоут у блокуючий гейт «при 100 % покриття». Ні тієї дати, ні
> тієї вимоги немає ні тут, ні в [`hard-rules.json`](../hard-rules.json) —
> вони жили лише в коментарях коду. Формулювання приведено до правила; щоб
> зробити явний маркер обов'язковим для ВСІХ файлів, треба спершу змінити
> саме це правило, а не вмикати прапорець.

## Why / What is enforced

> Why a hard rule? Because PR [#1143](https://github.com/Skords-01/Sergeant/pull/1143) silently merged a "dead-code cleanup" that deleted scaffolded-but-not-yet-wired components (`PullToRefreshIndicator`, `usePullToRefresh`, `EmptyStateIllustrations`, `OptimizedImage`). They were dropped in by a `feat(web)` commit ahead of integration and `pnpm knip` correctly reported "no importers" — but cleaning them up was wrong, because they were the next-step UI scaffolding, not legacy. We need a way to tell intentional-zero-importers apart from real dead code.

Every non-trivial source file and every published doc declares **one** of these statuses. If a file/doc has no marker, treat it as `Active` (the default) — but if `pnpm knip` flags it as unused, you must check git log and possibly add a `@scaffolded` marker before deleting.

#### Code: JSDoc lifecycle tags

Place the marker in the **first JSDoc block of the file** (above imports is fine). Tags compose with TS-LSP — `@deprecated` shows strikethrough in editors automatically.

| Tag             | Meaning                                                                                   | When to add                                                         | When to remove                                                                       |
| --------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `@scaffolded`   | Ready for use but no live consumer yet. Intentional zero-importer. Knip MUST NOT flag it. | When you commit a component/hook ahead of its first wiring PR.      | In the PR that wires it into a page/route/registry — also delete the tag in that PR. |
| `@experimental` | API may change or be reverted. Live consumers exist but we are not promising stability.   | When shipping a feature flag or A/B candidate that may be reverted. | When stabilizing (delete tag), or when removing (replace with `@deprecated`).        |
| `@deprecated`   | Live consumers must migrate away. Will be removed by a target date.                       | When introducing a replacement.                                     | After the deletion PR lands and consumers are migrated.                              |
| _(no tag)_      | Active. Default for everything else.                                                      | —                                                                   | —                                                                                    |

Each non-Active marker is followed by a **machine-readable block** with the same shape:

```ts
/**
 * @scaffolded
 * @owner @Skords-01
 * @addedIn <commit-sha>  # short SHA of the commit that introduced the file
 * @nextStep <one-line plan> — link to a doc/issue describing the integration
 *
 * Scaffolded but not yet imported by any consumer. Do NOT delete as part of
 * dead-code cleanup — see Hard Rule #10 in AGENTS.md.
 */
```

`@deprecated` blocks add `@removeBy YYYY-MM-DD` (target removal date) and `@migration <link>` (where consumers learn how to switch).

Knip respects `@scaffolded` and `@deprecated` files via `knip.json` `ignore` glob entries that include the markers (see `scripts/knip-respects-scaffolded.mjs` for the regex list). When you add a marker, no knip config change is needed.

#### Docs: status badge under the freshness marker

Right after the existing `> **Last touched:** YYYY-MM-DD …` line, add:

```md
> **Status:** Active | Scaffolded | Deprecated | Reference | Draft
```

- `Active` — current source of truth. Default.
- `Scaffolded` — describes a feature/component that exists in code but isn't wired yet. Do NOT cite it as live behaviour. Pair with the matching `@scaffolded` JSDoc tag in code.
- `Deprecated` — describes a behaviour we're replacing; reference the replacement.
- `Reference` — знімок стану або довідковий зріз, а не джерело істини: читають, але не супроводжують як канон. Емітять генератори (`scripts/docs/generate-status.mjs`, `generate-today.mjs`) для `docs/STATUS.md` і `docs/today.md`; вручну ставлять на plan/audit-зрізи.
- `Draft` — незавершений чернетковий матеріал (spike-walkthrough, чернетка плану). Не цитувати як рішення; або дописати до `Active`, або видалити після фіксації потрібної історії в Git.

> Окремі піддерева мають **власний** доменний lifecycle поверх цього словника і НЕ порушують правило: ADR-и у `docs/governance/adr/**` живуть за MADR (`Proposed | Accepted | Deprecated | Superseded by ADR-NNNN`, гейт — `pnpm docs:check-adr-graph`), а ініціативи у `docs/work/specs/initiatives/**` — за `In progress | Done` (гейт — `pnpm lint:initiative-status-sync`).

`Archived` лишається legacy-значенням, яке старі commit snapshot-и можуть містити в Git history. Нові або відредаговані документи його не використовують: завершений frozen snapshot прибирається з checkout за Hard Rule #23.

#### What this rule blocks

- **Dead-code PRs** — agent/human MUST check for `@scaffolded`/`@deprecated` markers before deleting a "knip-says-unused" file. If a marker exists, leave the file. If knip flags an unmarked file, prefer to add `@scaffolded` (with owner + next step) rather than delete, unless `git log --follow` makes it obvious the file is truly orphaned (e.g. last touched > 12 months ago, no `feat(...)` commit). Document the reasoning in the PR description.
- **Doc cleanup PRs** — завершені frozen snapshot-и отримують Outcome та merge evidence, після чого видаляються з checkout; потрібні inbound references переводяться на immutable Git permalink.
- **AI agents** — when surfacing files for review, group by status. A file with `@scaffolded` is NOT a candidate for the "remove dead code" task type.

## Related

- **agents** — #10

<!-- AUTO-GENERATED: PR-BACKLINKS-START -->

## Recent PRs

| PR                                                              | Title                                                                                                             | Merged     |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ---------- |
| [#92](https://bitbucket.org/skords01/sergeant/pull-requests/92) | fix(server,web): живий прогін AI-пайплайнів: обірвані відповіді OpenRouter, зламаний чат, дайджест і формат чисел | 2026-09-28 |
| [#88](https://bitbucket.org/skords01/sergeant/pull-requests/88) | fix(web): виправлення за браузерним web-аудитом 2026-09-27                                                        | 2026-09-28 |
| [#61](https://bitbucket.org/skords01/sergeant/pull-requests/61) | docs(docs): синк реєстру PR (#41-#64)                                                                             | 2026-09-26 |
| [#42](https://bitbucket.org/skords01/sergeant/pull-requests/42) | fix(web): фаза 0 аналітики Фініка v2: чесність чисел (Р4-Р7)                                                      | 2026-09-24 |
| [#13](https://bitbucket.org/skords01/sergeant/pull-requests/13) | docs(agents): вирівняти governance з фактом після переїзду на Bitbucket                                           | 2026-09-23 |

_Auto-derived from `docs/governance/pr-ledger/index.json`. Top 5 most recent PRs touching this file._
<!-- AUTO-GENERATED: PR-BACKLINKS-END -->
