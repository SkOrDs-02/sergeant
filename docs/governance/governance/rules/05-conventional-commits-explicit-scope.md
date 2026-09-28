# Rule 5 — Conventional Commits: explicit scope enum

> **Category:** `lint-enforced-convention`
> **Severity:** `blocker`
> **Last touched:** 2026-09-23 by @claude (enforced_by: ci.yml-запис позначено SUSPENDED - CI на Bitbucket не запускається). **Next review:** 2026-12-16.
> **Status:** Active

> Per-rule canonical body for Hard Rule #5. Compact summary lives in [`AGENTS.md § Hard rules`](../../../../AGENTS.md#hard-rules-do-not-break) (rendered as a table). The machine-readable registry lives in [`docs/governance/governance/hard-rules.json`](../hard-rules.json). The 3-way sync (AGENTS.md ↔ JSON ↔ this file) is enforced by `pnpm lint:hard-rules-registry`.

## Scope

- `**/*`

## Enforced by

- **ci** - SUSPENDED з 2026-09-23 (CI на Bitbucket не запускається): ci.yml job `Commit messages (commitlint)` не виконується (`Workflow lint` у тому ж `ci.yml` - це actionlint, інший гейт)
- **hook** — .husky/commit-msg

## Why / What is enforced

Format: `<type>(<scope>): <subject>`. Allowed types: `feat`, `fix`, `docs`, `chore`, `refactor`, `perf`, `test`, `build`, `ci`.

**Scopes (use one of these — do not invent new ones):**

| Scope              | When to use                                                       |
| ------------------ | ----------------------------------------------------------------- |
| `web`              | `apps/web/**`                                                     |
| `server`           | `apps/server/**` (excluding migrations alone)                     |
| `mobile`           | `apps/mobile/**`                                                  |
| `mobile-shell`     | `apps/mobile-shell/**`                                            |
| `shared`           | `packages/shared/**`                                              |
| `api-client`       | `packages/api-client/**`                                          |
| `finyk-domain`     | `packages/finyk-domain/**`                                        |
| `fizruk-domain`    | `packages/fizruk-domain/**`                                       |
| `nutrition-domain` | `packages/nutrition-domain/**`                                    |
| `routine-domain`   | `packages/routine-domain/**`                                      |
| `insights`         | `packages/insights/**`                                            |
| `design-tokens`    | `packages/design-tokens/**`                                       |
| `config`           | `packages/config/**`                                              |
| `db-schema`        | `packages/db-schema/**`                                           |
| `dualwrite-core`   | `packages/dualwrite-core/**`                                      |
| `eslint-plugins`   | `packages/eslint-plugin-sergeant-design/**`                       |
| `migrations`       | `apps/server/src/migrations/**` only                              |
| `agents`           | `.agents/**`, `.claude/agents/**`, `.codex/agents/**`             |
| `deps`             | Renovate / dependency-only PRs                                    |
| `docs`             | `docs/**`, `README.md`, `AGENTS.md`, `CONTRIBUTING.md`            |
| `ci`               | `.github/workflows/**`, `turbo.json`, scripts under `scripts/`    |
| `root`             | Repo-level config (`pnpm-workspace.yaml`, `package.json` at root) |

If a PR genuinely spans multiple scopes (rare), use the most "user-visible" one and explain in the body. **Do not invent** scopes like `monorepo`, `app`, `core`, `all`.

## Related

- **agents** — #5

<!-- AUTO-GENERATED: PR-BACKLINKS-START -->

## Recent PRs

| PR                                                              | Title                                                                   | Merged     |
| --------------------------------------------------------------- | ----------------------------------------------------------------------- | ---------- |
| [#88](https://bitbucket.org/skords01/sergeant/pull-requests/88) | fix(web): виправлення за браузерним web-аудитом 2026-09-27              | 2026-09-28 |
| [#61](https://bitbucket.org/skords01/sergeant/pull-requests/61) | docs(docs): синк реєстру PR (#41-#64)                                   | 2026-09-26 |
| [#42](https://bitbucket.org/skords01/sergeant/pull-requests/42) | fix(web): фаза 0 аналітики Фініка v2: чесність чисел (Р4-Р7)            | 2026-09-24 |
| [#13](https://bitbucket.org/skords01/sergeant/pull-requests/13) | docs(agents): вирівняти governance з фактом після переїзду на Bitbucket | 2026-09-23 |

_Auto-derived from `docs/governance/pr-ledger/index.json`. Top 4 most recent PRs touching this file._
<!-- AUTO-GENERATED: PR-BACKLINKS-END -->
