# Operations runbook — як оперувати Sergeant без `@Skords-01`

> **Last validated:** 2026-05-06 by Devin. **Next review:** 2026-08-04.
> **Status:** Active

Цей runbook — bus-factor мітигація: коли єдиний оператор `@Skords-01`
тимчасово недоступний (відпустка, sick-leave, hand-off), цей документ дає
другому інженеру **точку входу в усі підсистеми Sergeant** так, щоб не
довелося реверсити архітектуру з git-blame-у. PR-37 з
[`docs/planning/pr-plan-2026-05.md`](../planning/pr-plan-2026-05.md).

> **Не дублює** інші runbook-и, а служить **routing-картою** до них.
> Канонічні «як саме виконати» команди живуть у:
>
> - [`docs/observability/runbook.md`](../observability/runbook.md) — production incident-flow, alert-decoder
> - [`docs/runbooks/database-backup-restore.md`](./database-backup-restore.md), [`./database-connection-pooling.md`](./database-connection-pooling.md), [`./postgres-read-replica.md`](./postgres-read-replica.md), [`./encryption-key-rotation.md`](./encryption-key-rotation.md) — конкретні DB-операції
> - [`docs/deploy/`](../deploy/README.md) — Railway / Vercel / `tools/console` deploy walkthrough-и
> - [`docs/playbooks/`](../playbooks/README.md) — repeatable процедури (incident, release, rotation, hotfix)

## 0. TL;DR — що зробити, якщо щось горить

1. **Підтвердь incident:** перевір `https://api.sergeant/healthz` (детальний JSON) і `https://api.sergeant/health/workers`. Якщо `status: unhealthy` — incident; якщо `healthy` — швидше за все user-error / Vercel-side проблема.
2. **Дізнайся що саме впало:** [§7 «Куди дивитися першим»](#7-куди-дивитися-першим).
3. **Знайди відповідний runbook:** [`docs/observability/runbook.md`](../observability/runbook.md) має алерт-decoder («Що робити, якщо ALERT-NAME триггериться»).
4. **Якщо runbook відсутній або не допомагає:** [`docs/playbooks/declare-incident.md`](../playbooks/declare-incident.md) — escalation flow + Telegram комунікація.
5. **Backout-варіант завжди є:** [§5 «Як зробити rollback»](#5-як-зробити-rollback).

## 1. Доступи і креденшали — що потрібно отримати

Перш ніж брати on-call, новий оператор повинен мати:

| Доступ                  | Куди                                                              | Що дає                                                                                                                                                                                                                                                   |
| ----------------------- | ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **GitHub repo write**   | `Skords-01/Sergeant`                                              | PR / merge / branch protection bypass для hotfix-у. Required reviewer лишається `@Skords-01`, тому emergency-merge через admin-override (GitHub repo → Settings → Branches → відключити protection на час hotfix-у) — тільки за direct запит у Telegram. |
| **Railway workspace**   | `Sergeant Workspace` (`46c491e1-...`)                             | Деплой / env-vars / DB-shell / logs. Project `humorous-eagerness` (Sergeant API + redis + Postgres + sergeant-hubchat). Project `grateful-nurturing` (n8n self-hosted).                                                                                  |
| **Vercel team**         | `skords-01` team                                                  | Деплой / env-vars `apps/web`. Hosting split рознесений з API (Railway) — див. [ADR-0009](../adr/0009-hosting-split-railway-vercel.md).                                                                                                                   |
| **Sentry org**          | `sergeant-ops`                                                    | Errors / replay для web + server + console. Alert-routing через [WF-03](../../ops/n8n-workflows/03-sentry-alert-routing.json).                                                                                                                           |
| **PostHog project**     | `Sergeant`                                                        | Product analytics. Канонічні events — у [`packages/shared/src/lib/analyticsEvents.ts`](../../packages/shared/src/lib/analyticsEvents.ts).                                                                                                                |
| **Telegram bot tokens** | 1Password vault `sergeant-bots`                                   | `TELEGRAM_BOT_TOKEN`, `TELEGRAM_ALERT_BOT_TOKEN` (Sergeant_alert_bot для n8n), `OPENCLAW_BOT_TOKEN` (OpenClaw_sergeant_bot для `tools/console`).                                                                                                         |
| **n8n credentials**     | n8n self-hosted UI (`https://n8n-production-09ac.up.railway.app`) | Workflow editing. Login через Railway-managed Postgres-backed auth. Owner: `dmytro.skords@gmail.com`.                                                                                                                                                    |
| **Monobank API token**  | 1Password vault `sergeant-monobank`                               | Webhook-rotation. Не використовується для daily ops — тільки для `sergeant-finyk` setup-у нових юзерів.                                                                                                                                                  |
| **Anthropic API key**   | Railway env (`humorous-eagerness` project, `production` env)      | Per-user budget control. Quota — у [Anthropic console](https://console.anthropic.com/).                                                                                                                                                                  |
| **Voyage API key**      | Railway env (`humorous-eagerness` project, `production` env)      | AI memory embeddings. Quota — у Voyage dashboard ([voyageai.com](https://www.voyageai.com/) → sign-in).                                                                                                                                                  |
| **PostgreSQL prod DSN** | Railway env var `DATABASE_URL` (sergeant-server-api service)      | НЕ для daily ops — тільки для emergency `psql`-investigation. Звичайні запити йдуть через `apps/server` API.                                                                                                                                             |

> **Hard rule:** Ніколи не commit-ити жодного з токенів вище в репо.
> `.env.production` НЕ існує в git. Локальний `.env` має `.env.example` як
> reference. Rotation API-токенів — [`docs/playbooks/rotate-secrets.md`](../playbooks/rotate-secrets.md);
> rotation encryption-ring-у — [`./encryption-key-rotation.md`](./encryption-key-rotation.md).

## 2. Топологія — що де живе

```
┌─────────────────────────────────────────────────────────────────────┐
│  Production runtime — 3 platform-и, 1 source-of-truth (Railway DB)  │
└─────────────────────────────────────────────────────────────────────┘

Vercel ──── apps/web (PWA)          Railway "humorous-eagerness"     Railway "grateful-nurturing"
            ↓                       ┌─ apps/server (sergeant-api)    ┌─ n8n self-hosted
            HTTPS API calls   ───── ├─ sergeant-hubchat (OpenClaw)   ├─ Postgres (n8n state only)
                                    ├─ Postgres (sergeant-db)        └─ Telegram webhooks → workflows
                                    └─ Redis (BullMQ + rate-limit)
```

Surface-і та їх deploy targets:

- `apps/web` → Vercel — [`docs/deploy/vercel.md`](../deploy/vercel.md)
- `apps/server` → Railway service `sergeant-server-api` — Railway Buildpacks, auto-deploy з `main`
- `tools/console` (OpenClaw_sergeant_bot) → Railway service `sergeant-hubchat` — [`docs/deploy/console.md`](../deploy/console.md)
- `apps/mobile` → Expo / TestFlight — [`docs/playbooks/release-expo-mobile.md`](../playbooks/release-expo-mobile.md)
- `apps/mobile-shell` → App Store / Play Store wrap — [`docs/playbooks/release-mobile-shell.md`](../playbooks/release-mobile-shell.md)
- n8n workflows → self-hosted у Railway (project `grateful-nurturing`) — git source-of-truth у [`ops/n8n-workflows/`](../../ops/n8n-workflows/)

Канонічна service-таблиця з alerts/runbook/rollback per surface — [`docs/architecture/service-catalog.md`](../architecture/service-catalog.md).

## 3. Daily операції — що дивитися щоранку

5-min health-check на початку дня:

1. **Sentry weekly digest** (Telegram `Sergeant_ops:⚙ Контрол-план`, тема `incidents`) — будь-які `level: fatal` за ніч?
2. **PostHog dashboards** — [`docs/observability/posthog-ftux-dashboards.md`](../observability/posthog-ftux-dashboards.md). Drop ≥ 30% у `signup_completed` = щось зламалось у auth flow.
3. **`/health/workers`** (PR-31): `curl https://api.sergeant/health/workers | jq '.workers.aiMemoryIngest.jobCounts.failed'` — має бути 0 або тренд-вниз. Якщо росте >24h — Anthropic / Voyage incident.
4. **Railway logs tail** — `railway logs -s sergeant-server-api -e production --tail 100` (з `production` env). Шукай `level: error` / `level: fatal`.
5. **n8n executions** — [`https://n8n-production-09ac.up.railway.app/`](https://n8n-production-09ac.up.railway.app/) → Executions → filter `Failed`. Найчастіше — WF-15 Railway deploy (post-PR-16 noise dropped) і WF-01 Mono webhook (Anthropic-side timeouts).

Тижневий ритуал:

- **Вівторок** — Renovate PR-batch. [`docs/observability/runbook.md §«Як обробити Renovate PR»`](../observability/runbook.md). Auto-merge label `automerge-eligible` для green CI; manual review для groups з ADR-0044.
- **Четвер** — `pnpm db:backup` smoke-test (на staging БД, не production). [`./database-backup-restore.md`](./database-backup-restore.md).
- **Неділя** — pre-week governance pass: `pnpm lint`, `pnpm docs:check-links`, `pnpm ops:n8n:validate`. Лежать у repo, не в CI.

## 4. Як задеплоїти hot-fix без `@Skords-01`

```bash
# 1. Branch + fix + PR
git checkout main && git pull origin main
git checkout -b hotfix/$(date +%s)-<short-description>
# ... fix ...
git commit -m "fix(<scope>): <subject>"  # див. AGENTS.md §5 для scope enum
git push -u origin hotfix/...
gh pr create --base main --title "fix(<scope>): <subject>" --body-file <(cat .github/PULL_REQUEST_TEMPLATE.md)

# 2. CI має пройти. Якщо CI зелений + PR має одного approving reviewer →
#    merge через "Squash and merge". Якщо approving reviewer відсутній і
#    incident severity SEV-1/SEV-2:
#    - адмін override через Settings → Branches (потрібні admin права на repo)
#    - АБО merge through admin-bypass і одразу post у Telegram з посиланням на PR
#    - повний flow → docs/playbooks/hotfix-prod-regression.md

# 3. Auto-deploy:
#    - apps/server → Railway redeploy ~2-3min після merge у main
#    - apps/web → Vercel preview-merge ~1-2min, production promote auto-on-main
#    - tools/console → Railway redeploy ~2min

# 4. Smoke-verify:
curl https://api.sergeant/healthz | jq '.status'         # "healthy"
curl https://api.sergeant/health/workers | jq '.status'  # "healthy"
curl -I https://app.sergeant.bot/                        # 200 OK + COOP header
```

Якщо CI fail-ить на hotfix-PR-і — НЕ скіпай Husky (`--no-verify` заборонено
hard-rule-ом #15). Виправ root-cause; якщо нема часу — залиш PR-чернетку
і запропиши інженеру з review-доступу руки на руль.

Канонічний repeatable-recipe: [`docs/playbooks/hotfix-prod-regression.md`](../playbooks/hotfix-prod-regression.md).

## 5. Як зробити rollback

| Surface             | Швидкий rollback                                                                                             | Тривалість  |
| ------------------- | ------------------------------------------------------------------------------------------------------------ | ----------- |
| **`apps/web`**      | Vercel UI → Deployments → попередній зелений → «Promote to Production». Або revert PR + auto-deploy.         | ~30 сек     |
| **`apps/server`**   | Railway UI → service `sergeant-server-api` → Deployments → попередній build → «Redeploy».                    | ~1-2 хв     |
| **`tools/console`** | Railway UI → service `sergeant-hubchat` → Deployments → попередній build → «Redeploy».                       | ~1-2 хв     |
| **DB schema**       | НЕ запускати `down.sql` у production. Compensating migration → див. AGENTS.md hard-rule #4 (two-phase DROP). | години-доба |
| **Feature flag**    | `apps/server` env var у Railway → toggle → Redeploy (no code change). Окрема `flags.ts` змінна.              | ~2 хв       |
| **n8n workflow**    | n8n UI → workflow → Versions → попередня → «Restore». Або import JSON з git pre-PR.                          | ~30 сек     |

Загальне правило: **rollback — single-step операція; recovery — багато-step**.
Якщо incident активний, спочатку rollback, потім root-cause-investigate.

## 6. Як працювати з n8n workflow-ами

n8n live state і git source-of-truth розходяться, тому:

1. **Git source-of-truth:** [`ops/n8n-workflows/<NN>-<name>.json`](../../ops/n8n-workflows/). 23 workflow-и. `manifest.json` — реєстр з env-vars, credentials, owner.
2. **Live state:** [`https://n8n-production-09ac.up.railway.app/`](https://n8n-production-09ac.up.railway.app/). Workflow ID-и фіксовані у README кожного workflow-у.
3. **Деплой змін:** PR з оновленим JSON → merge → `pnpm n8n:import` (manual step) або `n8n` UI → workflow → «Import from JSON». **Active=true у git ніколи не комітимо** — це стан на боці n8n, керується UI.
4. **Validation:** `pnpm ops:n8n:validate` локально перед commit-ом — перевіряє схему, env-vars, connections, manifest.
5. **README per-workflow:** `ops/n8n-workflows/<NN>-<name>.README.md` описує webhook-source, payload, side-effects, smoke-test.
6. **Modify-recipe:** [`docs/playbooks/modify-n8n-workflow.md`](../playbooks/modify-n8n-workflow.md).

> **Common mistake:** редагувати workflow в n8n UI без оновлення git. Через тиждень
> import-ом з git ти затреш зміни. **Завжди:** UI-edit → export JSON → PR → merge.

## 7. Куди дивитися першим

Decision-tree коли щось «не працює»:

```
                    ┌─ user-facing 5xx? ─────────► Sentry [server] + Railway logs
                    │
                    ├─ user-facing 4xx? ─────────► PostHog → user_session timeline
                    │
                    ├─ analytics drop? ──────────► PostHog → events page (signup_completed, etc)
                    │
"щось не так"  ─────┼─ alert у Telegram? ────────► docs/observability/runbook.md §alert-decoder
                    │
                    ├─ DB / pool issue? ─────────► /healthz + ./database-connection-pooling.md
                    │
                    ├─ background job stuck? ────► /health/workers + Sentry [server]
                    │
                    ├─ Telegram bot не відповідає? ─► Railway logs sergeant-hubchat
                    │
                    └─ n8n workflow stuck? ─────► n8n UI → Executions → filter Failed
```

Точкові посилання:

- **Sentry:** `https://sergeant-ops.sentry.io/issues/?project=<id>` — окремі projects per surface (web, server, console).
- **PostHog:** `https://app.posthog.com/project/<id>/events` — funnel breakdown за подіями з `analyticsEvents.ts`.
- **Railway logs:** `railway logs -s <service> -e production --tail 200` локально, або UI.
- **Prometheus / Grafana:** немає — observability-стек це Sentry + PostHog + Railway-вбудовані metrics + n8n executions. ADR-0034.
- **PgAdmin / DB shell:** Railway → service `sergeant-db` → «Connect» → temporarily-issued DSN. **НЕ** використовуй для writes без compensating migration.

## 8. Routine maintenance

Регулярні задачі, які не повинні зупинитися без `@Skords-01`:

| Завдання                                       | Частота               | Runbook                                                                        |
| ---------------------------------------------- | --------------------- | ------------------------------------------------------------------------------ |
| DB backup smoke-test                           | Тижнева               | [`./database-backup-restore.md`](./database-backup-restore.md)                 |
| Encryption key rotation                        | Раз на 90 днів        | [`./encryption-key-rotation.md`](./encryption-key-rotation.md)                 |
| API token rotation (Anthropic / Voyage / Mono) | Раз на 90 днів        | [`docs/playbooks/rotate-secrets.md`](../playbooks/rotate-secrets.md)           |
| Monobank token re-bind (per-user)              | On-demand (юзер-flow) | `apps/server/src/modules/mono/setup.ts` — endpoint `POST /api/mono/setup`      |
| Renovate PR-batch                              | Тижнева (вівторок)    | [`docs/observability/runbook.md §Renovate`](../observability/runbook.md)       |
| n8n workflows audit                            | Місячна               | `pnpm ops:n8n:validate` + manual review executions-tab                         |
| `pnpm docs:check-links`                        | Перед-merge per PR    | CI робить sам; локально для draft-PR-ів                                        |
| Disaster-recovery drill                        | Раз на 6 місяців      | [`docs/playbooks/test-backup-restore.md`](../playbooks/test-backup-restore.md) |
| Access review (хто має які доступи)            | Квартальна            | [`docs/playbooks/run-access-review.md`](../playbooks/run-access-review.md)     |

## 9. Як написати postmortem

Якщо incident → SEV-2+ або duration > 30min → обов'язково postmortem.

1. Branch: `postmortem/YYYY-MM-DD-<incident-name>`.
2. Файл: `docs/postmortems/YYYY-MM-DD-<incident-name>.md` з template-ом з [`docs/playbooks/write-postmortem.md`](../playbooks/write-postmortem.md).
3. Структура: timeline (UTC) → impact (users + revenue) → root cause → fix → action items.
4. Action items → GitHub issues з label `postmortem-action-item`.
5. Review через PR (звичайний flow); merge після того, як `@Skords-01` (або acting on-call) одобрив.

## 10. Що НЕ робити

- ❌ `git push --force` у `main` або захищених гілках. Branch protection блокує, але не у admin-override-режимі — не override-и без incident.
- ❌ `pnpm db:migrate -- --rollback` у production. `down.sql` — для local rollbacks. Production rollback = compensating migration.
- ❌ Edit n8n workflow у UI без подальшого export-у в git. Втратиш зміни на наступному import-і.
- ❌ Commit `.env`, `.env.production`, `*.pem`, `*.key`, `credentials.json`. `.gitignore` ловить більшість, але не все.
- ❌ Skip Husky hooks (`--no-verify`, `--no-gpg-sign`). Hard-rule #15. Якщо hook падає — fix root cause.
- ❌ Direct write у Postgres з psql-shell-у без compensating migration на наступний deploy. State drift = silent regressions.
- ❌ Rotate API-токен без оновлення відповідного env-var у Railway/Vercel + redeploy. Production миттєво почне 401-ити upstream.
- ❌ Merge в `main` PR-и з failed CI. Branch protection блокує, але не у admin-override.

## Cross-links

- [AGENTS.md](../../AGENTS.md) — repo policy, hard rules, scope enum, conventional-commit format.
- [`docs/observability/runbook.md`](../observability/runbook.md) — production incident-flow, alert-decoder, Renovate.
- [`docs/architecture/service-catalog.md`](../architecture/service-catalog.md) — surface-by-surface deploy + healthcheck + rollback table.
- [`docs/security/disaster-recovery.md`](../security/disaster-recovery.md) — RPO/RTO targets, disaster classes.
- [`docs/governance/incident-severity-policy.md`](../governance/incident-severity-policy.md) — SEV-1/2/3/4 mapping.
- [`docs/planning/pr-plan-2026-05.md`](../planning/pr-plan-2026-05.md) — поточний 90-day roadmap (PR-37 — це він).
