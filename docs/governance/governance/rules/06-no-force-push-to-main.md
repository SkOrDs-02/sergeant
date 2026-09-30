# Rule 6 — No force push to main/master

> **Category:** `blocker-invariant`
> **Severity:** `blocker`
> **Last touched:** 2026-09-23 by @claude (enforced_by: GitHub branch protection позначено SUSPENDED - репо на Bitbucket). **Next review:** 2027-04-16.
> **Status:** Active

> Per-rule canonical body for Hard Rule #6. Compact summary lives in [`AGENTS.md § Hard rules`](../../../../AGENTS.md#hard-rules-do-not-break) (rendered as a table). The machine-readable registry lives in [`docs/governance/governance/hard-rules.json`](../hard-rules.json). The 3-way sync (AGENTS.md ↔ JSON ↔ this file) is enforced by `pnpm lint:hard-rules-registry`.

## Scope

- `main`
- `master`

## Enforced by

- **branch-protection** - GitHub branch protection на `main` (`SkOrDs-02/sergeant`): force-push і видалення гілки заборонені (2026-09-23..29 репо тимчасово жило на Bitbucket без цього захисту; з 2026-09-30 знову на GitHub, ADR-0101). Захист на дзеркалі Hetzner (другий pushurl `origin`) не перевірено

## Why / What is enforced

`--force-with-lease` on feature branches is OK.

## Related

- **agents** — #6

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
