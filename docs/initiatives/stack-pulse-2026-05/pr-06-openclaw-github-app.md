# PR-06: OpenClaw → GitHub App, прибрати `Git_PAT` fallback

> **Last validated:** 2026-05-06 by Codex. **Next review:** 2026-08-04.
> **Status:** In progress / partial — Phase 1 GitHub App auth-flow merged [#1816](https://github.com/Skords-01/Sergeant/pull/1816); PAT fallback removal pending

|              |                                                                              |
| ------------ | ---------------------------------------------------------------------------- |
| **Severity** | Critical (C6)                                                                |
| **Owner**    | TBD                                                                          |
| **Effort**   | 2–3 дні                                                                      |
| **Risk**     | Medium (зачіпає live OpenClaw integration, може зламати Devin-orchestration) |
| **Touches**  | `apps/server/src/openclaw/`, `apps/server/src/env*`, secrets                 |

## Контекст

> **Update 2026-05-06:** [#1816](https://github.com/Skords-01/Sergeant/pull/1816) додав GitHub App auth-flow паралельно до legacy PAT-path і feature-flag `OPENCLAW_USE_GITHUB_APP` з default `false`. Цей PR-план ще не закритий: Phase 2 має flip-нути default, видалити `OPENCLAW_GITHUB_PAT` / `Git_PAT` production-path і зареєструвати no-PAT production rule.

```ts
// apps/server/src/env.ts:413–414
OPENCLAW_GITHUB_PAT: process.env.OPENCLAW_GITHUB_PAT ?? process.env.Git_PAT;
```

OpenClaw — Devin-кероваджувальник, що приймає Telegram-команди і виконує git-операції від імені людини. Сьогодні він автентифікується через **plain personal access token** з:

- `contents:write` — може push-ити у головну гілку (правило в репо це не дозволяє, але token-сам в принципі може).
- `actions:read`, `pull-requests:write`.
- `Git_PAT` — Devin-only convention (бо у Devin VM ця змінна провіжиться через org-secret), у production-коді не повинно бути такого fallback.

Ризики:

- **Compromise blast radius:** один зкомпрометований PAT = full access до всіх рев-ї і всіх PR-ів.
- **Rotation:** plain PAT не має auto-rotation. Last rotated date — невідомо, у `docs/security/` нема runbook.
- **Audit trail:** дії не помічаються як `bot[X]`-actor, лишають шум в історії від real-user-а.
- `Git_PAT` як fallback робить production-codepath **залежним від Devin-org-environment** — це зайва coupling.

## Scope

### 1. Migrate to GitHub App

- Створити Sergeant GitHub App з:
  - Permissions: `contents:read` (тільки read), `pull-requests:write`, `issues:write`, `actions:read`.
  - `contents:write` тільки на feature-branches (по path-фільтру, якщо доступно; інакше — explicit `git push --force-with-lease` denied на main у branch-protection rule).
- Production secret: `OPENCLAW_GITHUB_APP_ID` + `OPENCLAW_GITHUB_APP_PRIVATE_KEY` + `OPENCLAW_GITHUB_APP_INSTALLATION_ID`.
- Server-side обмінює private-key на short-lived installation-token (1 година TTL).

### 2. Видалити PAT-fallback

- `process.env.Git_PAT` — видалити з `env.ts` повністю.
- Якщо OpenClaw user-tier потребує PAT (для test-org) — окремий ENV з префіксом `OPENCLAW_TEST_PAT`, документований і не тригериться у production.
- Hard rule: «No personal access tokens in production code; use GitHub App or short-lived OIDC tokens».

### 3. Rotation runbook

- `docs/playbooks/rotate-openclaw-credentials.md`:
  - Який ключ де лежить (1Password / Vercel / Railway).
  - Кроки: генерація нового key-pair → upload у GitHub App → deploy → revoke old.
  - Quarterly cron у `docs/observability/alerts.md` — нагадує про expiration.

### 4. Branch protection enforcement

- На `main` — `require pull-request before merging`, `require code-owner review`, `restrict who can push` (тільки GitHub App + maintainer-team).
- Дублювати у `.github/repository-rulesets.json` (якщо такий файл є — інакше створити).

## Out of scope

- Перехід на GitHub OIDC tokens for CI (це окремий PR на CI/CD security).
- Refactor Telegram-bot UX (це окреме roadmap).

## Acceptance criteria (DoD)

- [ ] GitHub App `Sergeant OpenClaw` створений з minimum permissions.
- [ ] `apps/server/src/openclaw/auth.ts` обмінює App private-key на installation-token + caches його з expiry.
- [ ] `OPENCLAW_GITHUB_PAT` і `Git_PAT` видалені з `env*.ts` (включно з PR-01 unify).
- [ ] Якщо `OPENCLAW_GITHUB_APP_*` не встановлений у production → startup fails з clear error.
- [ ] `docs/playbooks/rotate-openclaw-credentials.md` створений.
- [ ] Branch protection rule на `main` явно включений (видно у `Settings → Branches`).
- [ ] Hard rule зареєстрований у `docs/governance/hard-rules-registry.json` («No-PAT-in-production»).

## Тести

- `apps/server/src/openclaw/__tests__/auth.test.ts` — fake App-credentials, перевірка JWT-generation, mock GitHub API → installation-token.
- Integration smoke: на staging створити test-PR через OpenClaw → перевірити що actor у webhook payload-і є `sergeant-openclaw[bot]`, не real-user.

## Rollout

- Phase 1 (single PR): додати App-flow паралельно до PAT-flow, feature-flag `OPENCLAW_USE_GITHUB_APP=true` (default false на 1 тиждень).
- Phase 2 (наступний PR через 1 тиждень): default `true`, видалити PAT-flow повністю.
- Rollback: feature-flag → false, повернутися на PAT.

## Risks & mitigations

| Risk                                                                | Mitigation                                                                                                                |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Installation-token expires в середині operation                     | Refresh-логіка з 5-min headroom перед expiry                                                                              |
| GitHub App rate-limit vs PAT (5000 req/h vs 5000 req/h — однаковий) | OK; додати retry з exponential backoff на 403                                                                             |
| Devin VM не має GitHub App credentials                              | Devin-only PATH використовує окремий `OPENCLAW_TEST_PAT` для test-org, production codepath ніколи не торкається `Git_PAT` |

## Touchpoints (file:line)

- `apps/server/src/env.ts:413–414` — DELETE
- `apps/server/src/openclaw/` — auth-flow rewrite
- `docs/governance/hard-rules-registry.json` — додати rule
- `docs/playbooks/rotate-openclaw-credentials.md` — новий
- `.github/repository-rulesets.json` (якщо є) — branch protection

## Refs

- [GitHub Apps vs PATs](https://docs.github.com/en/apps/creating-github-apps/about-creating-github-apps/about-creating-github-apps)
- ADR-0027 (якщо існує — про OpenClaw architecture)
- OWASP «Secret Management Cheat Sheet»
