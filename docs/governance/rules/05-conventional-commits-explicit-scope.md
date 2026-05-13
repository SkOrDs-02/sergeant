# Rule 5 — Conventional Commits: explicit scope enum

> **Category:** `lint-enforced-convention`
> **Severity:** `blocker`
> **Last validated:** 2026-05-13 by @Skords-01
> **Next review:** 2026-08-11
> **Status:** Active

> Per-rule canonical body for Hard Rule #5. Compact summary lives in [`AGENTS.md § Hard rules`](../../../AGENTS.md#hard-rules-do-not-break) (rendered as a table). The machine-readable registry lives in [`docs/governance/hard-rules.json`](../hard-rules.json). The 3-way sync (AGENTS.md ↔ JSON ↔ this file) is enforced by `pnpm lint:hard-rules-registry`.

## Scope

- `**/*`

## Enforced by

- **ci** — Workflow lint (commitlint)
- **hook** — .husky/commit-msg

## Why / What is enforced

Format: `<type>(<scope>): <subject>`. Allowed types: `feat`, `fix`, `docs`, `chore`, `refactor`, `perf`, `test`, `build`, `ci`.

**Scopes (use one of these — do not invent new ones):**

| Scope              | When to use                                                               |
| ------------------ | ------------------------------------------------------------------------- |
| `web`              | `apps/web/**`                                                             |
| `server`           | `apps/server/**` (excluding migrations alone)                             |
| `mobile`           | `apps/mobile/**`                                                          |
| `mobile-shell`     | `apps/mobile-shell/**`                                                    |
| `console`          | _deprecated alias for `openclaw` (back-compat; removed in PR-47 phase 2)_ |
| `openclaw`         | `tools/openclaw/**`                                                       |
| `shared`           | `packages/shared/**`                                                      |
| `api-client`       | `packages/api-client/**`                                                  |
| `finyk-domain`     | `packages/finyk-domain/**`                                                |
| `fizruk-domain`    | `packages/fizruk-domain/**`                                               |
| `nutrition-domain` | `packages/nutrition-domain/**`                                            |
| `routine-domain`   | `packages/routine-domain/**`                                              |
| `insights`         | `packages/insights/**`                                                    |
| `design-tokens`    | `packages/design-tokens/**`                                               |
| `config`           | `packages/config/**`                                                      |
| `db-schema`        | `packages/db-schema/**`                                                   |
| `eslint-plugins`   | `packages/eslint-plugin-sergeant-design/**`                               |
| `openclaw-plugin`  | `packages/openclaw-plugin/**`                                             |
| `migrations`       | `apps/server/src/migrations/**` only                                      |
| `agents`           | `.agents/**`, `tools/openclaw/src/agents/**`, `ops/n8n-workflows/**`      |
| `deps`             | Renovate / dependency-only PRs                                            |
| `docs`             | `docs/**`, `README.md`, `AGENTS.md`, `CONTRIBUTING.md`                    |
| `ci`               | `.github/workflows/**`, `turbo.json`, scripts under `scripts/`            |
| `root`             | Repo-level config (`pnpm-workspace.yaml`, `package.json` at root)         |

If a PR genuinely spans multiple scopes (rare), use the most "user-visible" one and explain in the body. **Do not invent** scopes like `monorepo`, `app`, `core`, `all`.

## Related

- **agents** — #5
