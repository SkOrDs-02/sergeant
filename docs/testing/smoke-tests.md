# Post-deploy smoke tests — runbook

> **Last validated:** 2026-05-13 by @Skords-01 / Devin. **Next review:** 2026-08-08.
> **Status:** Active

Цей runbook описує, як працюють **post-deploy smoke tests** для Sergeant API — і що робити, коли cron / deploy-hook каже, що щось зламалось.

Sister-сторінки:

- [`docs/testing/pact-drift-runbook.md`](./pact-drift-runbook.md) — daily check, чи **wire shape** staging-у відповідає Pact-контрактам (schema regression).
- [`docs/architecture/api-contracts.md`](../architecture/api-contracts.md) — як працює Pact pipeline загалом.
- `.github/workflows/post-deploy-smoke.yml` — workflow (потрібно створити вручну — див. § Workflow YAML).
- [`scripts/post-deploy-smoke.mjs`](../../scripts/post-deploy-smoke.mjs) — CLI runner.
- [`scripts/smoke-tests.json`](../../scripts/smoke-tests.json) — конфіг із списком endpoint-ів.

> **Why the YAML lives in docs and not under `.github/workflows/`:** PR-42 (#2675), #2737 і ця PR використовують OAuth App без `workflow` scope, тож автоматизований push нового workflow-файла remote rejected-иться. До отримання scope-а — скопіюй YAML із § Workflow YAML у `.github/workflows/post-deploy-smoke.yml` вручну через GH UI.

## TL;DR

| Що бачу                                                                                      | Що це означає                                                                                                             | Перший крок                                                                             |
| -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| GitHub-issue `[Smoke] Post-deploy smoke failed — <env> YYYY-MM-DD` (label `smoke-test-fail`) | `post-deploy-smoke` workflow знайшов ≥1 endpoint з verdict `fail` (status / latency / shape mismatch).                    | Відкрий issue → `smoke-report` artifact → класифікуй failures.                          |
| `post-deploy-smoke` job `failure` на `deployment_status` trigger                             | Deploy завершився, але smoke завалився — кандидат на **rollback**.                                                        | Перевір `GITHUB_STEP_SUMMARY` цього run-у; якщо user-facing → пуш rollback або hotfix.  |
| `post-deploy-smoke` job `failure` на schedule                                                | Drift після deploy, який раніше пройшов smoke (e.g. dep-провайдер outage Mono/Anthropic, або running-handler regression). | Перевір зовнішні dep-status (Mono, Anthropic), Sentry на runtime-помилки, Railway logs. |
| Issue reopen-ається > 2x за тиждень                                                          | Flaky endpoint **або** real regression, який ще не закомічили.                                                            | Eskalate: pair з owner → patch або тимчасово понизь tier на `extended`.                 |

## Як працює workflow

- Файл (потрібно створити вручну — див. § Workflow YAML): `.github/workflows/post-deploy-smoke.yml`.
- Тригери:
  - `workflow_dispatch` з `base_url` / `tier` / `strict` inputs (ad-hoc прогон з UI Actions).
  - `deployment_status` — стартує одразу після успішного GitHub deployment-у (e.g. Vercel preview / Railway prod). `if: deployment_status.state == 'success'`.
  - `schedule: "30 6 * * *"` — 06:30 UTC щодня, на 30 хв пізніше за `pact-drift` (06:00 UTC), щоб триaге-лейн не coalesce-ився.
- Скрипт: [`scripts/post-deploy-smoke.mjs`](../../scripts/post-deploy-smoke.mjs) — параметри: `--base-url`, `--report`, `--json`, `--config`, `--tier`, `--only`, `--skip`, `--strict`, `--dry-run`, `--concurrency`.
- Конфіг: [`scripts/smoke-tests.json`](../../scripts/smoke-tests.json) — JSON-список тестів.
- Idempotent issue: один open issue з label `smoke-test-fail` (Mirrors `pact-drift.yml` + `db-backup-verify.yml`).

### Як читається verdict

Скрипт для кожного endpoint-а заміряє **status / latency / shape**, потім reducer вирішує verdict.

| Verdict   | Коли                                                                                                                                                                            | Деталі                                                                                                                                       |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| ✅ `pass` | HTTP-status == `expectedStatus`, latency ≤ `latencyBudgetMs`, response-shape (якщо описана) збігається.                                                                         | —                                                                                                                                            |
| ⚠️ `warn` | Status + shape OK, але latency `budget < latency ≤ 2×budget`.                                                                                                                   | Не блокує merge (без `--strict`). Сигнал «backend deps повільні». Часто dep-driven (Mono Open API throttle, Anthropic queue).                |
| ❌ `fail` | Status mismatch **або** latency > 2×budget **або** shape mismatch (missing field, type mismatch, null замість string) **або** fetch-error (connection refused / DNS / timeout). | Real liveness regression. Створюється issue `smoke-test-fail`. На `deployment_status` тригері — кандидат на rollback (якщо `critical` tier). |
| ⏭️ `skip` | Зарезервовано (наразі не використовується — конфіг включає всі тести; `--skip` flag-ом можна виключити named tests).                                                            | —                                                                                                                                            |

## Setup

### Required secrets

| Secret                   | Where                                 | Why                                                                                                                                                    |
| ------------------------ | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `STAGING_BASE_URL`       | GitHub → Settings → Secrets → Actions | Default target для cron-у. Override-иться `workflow_dispatch.base_url`.                                                                                |
| `STAGING_SESSION_COOKIE` | GitHub → Settings → Secrets → Actions | Better Auth session cookie (формат `session=...`) для тестів із `"auth": "session"`. Без нього вони ранять анонімно (часто → 401, що теж valid smoke). |

Для PR / preview deployment-ів `TARGET_BASE_URL` беруть із `deployment_status.environment_url` (Vercel populates це). Якщо deploy провайдер не сетить `environment_url` — упади fallback на `STAGING_BASE_URL`.

### Як отримати `STAGING_SESSION_COOKIE`

1. Відкрий staging app у браузері, залогінься як **smoke-test user** (рекомендую окремий dedicated account, не персональний).
2. DevTools → Application → Cookies → знайди `better-auth.session_token` (або тaнк назву ключа, який віддає Better Auth).
3. Скопіюй у форматі `better-auth.session_token=<value>` (з усіма `;`-separated cookie-attributes якщо треба передати кілька). Один-рядковий формат, бо ми кидаємо це у HTTP-header `cookie:`.
4. У GH Secrets збережи як `STAGING_SESSION_COOKIE`.
5. Cookie прострочується раз на ~30 днів — постав reminder продовжити, або налаштуй cron, що поновлює його через scripted login (далеко за межами цієї PR).

## Як прогнати локально

### Dry-run (без HTTP)

```bash
node scripts/post-deploy-smoke.mjs --dry-run
node scripts/post-deploy-smoke.mjs --dry-run --tier critical
```

Друкує список тестів із бюджетами і auth-mode-ами, без жодного HTTP-виклику.

### Проти локального dev-сервера

```bash
pnpm dev:server &  # http://localhost:3000

node scripts/post-deploy-smoke.mjs \
  --base-url http://localhost:3000 \
  --tier critical \
  --report /tmp/smoke-report.md
```

Anonymous-критичні endpoints (`/livez`, `/readyz`, `/healthz`, `/api/status`, `/api/push/vapid-public`) мають бути зеленими одразу. `auth:me-session` буде або skip-нутий, або 401 без cookie — це нормально для dry-перевірки скрипту.

### Проти staging (як CI)

```bash
export STAGING_BASE_URL=https://staging.sergeant.example.com
export STAGING_SESSION_COOKIE="better-auth.session_token=..."

node scripts/post-deploy-smoke.mjs --tier all --strict
```

`--strict` робить warn → fail (для жорсткої перевірки SLO).

## Як додати новий тест

1. Відкрий [`scripts/smoke-tests.json`](../../scripts/smoke-tests.json).
2. Додай новий запис у `tests`. Мінімум потрібно `name` і `path`. Решта береться з `defaults`.
3. Поля:
   - `name` — унікальний ID (e.g. `"finyk:transactions-list"`). Використовується у `--only` / `--skip`.
   - `method` — `GET` / `POST` / `PUT` / `PATCH` / `DELETE`. Default: `GET`.
   - `path` — relative-path від `base_url`, можна включати query-string (e.g. `"/api/v1/barcode?barcode=4820010840443"`).
   - `expectedStatus` — number. Default: `200`.
   - `latencyBudgetMs` — SLO. Default: `2500` ms.
   - `timeoutMs` — hard cutoff. Default: `8000` ms.
   - `auth` — `"none"` або `"session"` (передасть `cookie:` header).
   - `tier` — `"critical"` (rollback-candidate) або `"extended"` (informational).
   - `shape` — recursive type-skeleton, e.g. `{ "user": { "id": "string", "email": "string" } }`. Підтримує `"<type>?"` для optional / nullable полів.
   - `expectedBodyContains` — substring для non-JSON endpoints (e.g. `/metrics` має містити `# HELP`).
   - `headers` — додаткові headers.
   - `body` — request body (для POST/PUT/PATCH).
4. Прогон `node scripts/post-deploy-smoke.mjs --dry-run --only <new-name>` для перевірки, що config parse-иться.
5. Прогон проти dev-сервера: `node scripts/post-deploy-smoke.mjs --base-url http://localhost:3000 --only <new-name>`.
6. Open PR. CI прогонить unit-tests на pure-logic частину; новий тест автоматично включається у наступний staging-deploy + 06:30 UTC cron.

## Triage playbook

Якщо `[Smoke] Post-deploy smoke failed` issue з'явився:

1. **Класифікуй failures** з `smoke-report` artifact:
   - `fetch_error` (DNS / connection refused / timeout) — deploy не доступний з GH runner-а: перевір DNS staging-домену, статус деплоя на Railway/Vercel, чи WAF не блочить GH-IPS.
   - `status_mismatch` (5xx) — runtime crash; перевір Sentry → grouped by `route:<path>`.
   - `status_mismatch` (401 на endpoint, що раніше повертав 200) — `STAGING_SESSION_COOKIE` прострочився; поновіть.
   - `shape_mismatch` — handler змінив response shape; одна з: a) PR-42 contract update забутий, b) infra додала middleware, що нормалізує/обрізає тіло, c) handler bug.
   - `latency_severe_overrun` — DB connection pool exhausted? зовнішній API провайдер повільний? Перевір Railway → Database → Active queries, Anthropic / Voyage / Mono dashboards.
2. **Якщо `deployment_status` тригер + `critical` tier завалився:**
   - **Rollback first, fix second.** GitHub → Deployments → revert.
   - Опен hotfix-PR, recreate smoke вручну через `workflow_dispatch` після hotfix-merge.
3. **Якщо schedule-тригер (06:30 UTC) завалився, але дeplоy 8h тому пройшов smoke:**
   - Зовнішній dep outage (Mono Open API частий suspect).
   - Anthropic queue / RAG endpoint timeout — перевір `pact-drift` (06:00 UTC) — якщо там теж warn-и, це не handler regression, це provider degradation.
4. **Persistent flaky:**
   - Опуст tier на `extended` (інформаційний). Issue має ремаінути open, поки root cause не виправлений.
   - Додай Sentry alert на той endpoint (через `apps/server/src/obs/anthropicBudgetGuard.ts` pattern) — тоді smoke на ньому стане **дублюючим сигналом**, а не primary.

## Як це доповнює pact-drift

| Аспект                  | `pact-drift.yml` (06:00 UTC)                               | `post-deploy-smoke.yml` (deployment + 06:30 UTC)                            |
| ----------------------- | ---------------------------------------------------------- | --------------------------------------------------------------------------- |
| Що ловить               | **Schema** drift (missing/typeswap/extra field).           | **Liveness** drift (5xx, timeout, latency SLO).                             |
| Джерело очікувань       | `packages/api-client/pacts/*.json` (consumer-driven Pact). | `scripts/smoke-tests.json` (curated list of critical endpoints).            |
| Виконується             | Тільки cron + manual.                                      | Cron + manual + **deployment_status** (запускається після кожного deploy).  |
| Critical/optional split | Один tier (всі mutations skipped by default).              | Two tiers: `critical` (rollback-кандидат) + `extended` (информаційний).     |
| Action on fail          | Issue `contract-drift` + tech-debt.                        | Issue `smoke-test-fail` + tech-debt. Можна rollback-нути у deploy provider. |

Обидва running side-by-side — schema drift не блокує deploy (бо ловиться щодня), liveness drift блокує deploy (бо ловить regression миттєво після rollout).

## Майбутні розширення

- **Rollback automation:** на `critical`-tier fail після `deployment_status` — автоматичний revert у Railway / Vercel API.
- **Latency histograms:** замість єдиного `latencyBudgetMs`, мати p50/p95/p99 budgets, заміряти кілька runs.
- **Sentry route**: окремий alert-route `smoke-test-fail` через існуючий n8n WF-98 alert-bot pipeline (#2535).
- **Mutation tests opt-in:** `--include-mutations` для `POST /api/auth/sign-in` із dedicated test-user-ом — щоб ловити Better Auth regression. Зараз skipped, бо мутації забруднюють staging state.

## Workflow YAML

Закомить як `.github/workflows/post-deploy-smoke.yml`:

```yaml
name: Post-deploy smoke

# Owner: @Skords-01 (solo maintainer per .github/CODEOWNERS).
# Triage: if this job fails, an issue tagged `smoke-test-fail` is auto-opened
#         (idempotent — same pattern as pact-drift / db-backup-verify). Runbook:
#         `docs/testing/smoke-tests.md`.
# Why this workflow exists: complements `pact-drift.yml` (schema regression)
#         with **liveness** regression. Pact-drift catches "wire shape
#         changed"; this catches "endpoint stopped responding / SLO
#         regressed". Triggered after deploys (manual + deployment_status).

on:
  workflow_dispatch:
    inputs:
      base_url:
        description: "Target base URL override (default: $TARGET_BASE_URL / $STAGING_BASE_URL)"
        required: false
        type: string
      tier:
        description: "Test tier filter"
        required: false
        type: choice
        options:
          - critical
          - extended
          - all
        default: all
      strict:
        description: "Treat latency-over-budget warnings as failures"
        required: false
        type: boolean
        default: false
  deployment_status:
  schedule:
    # 06:30 UTC daily — 30 min after pact-drift so the same issue triage lane
    # is staggered. Pact-drift is the canary for schema regression; this is
    # the canary for liveness regression on staging.
    - cron: "30 6 * * *"

permissions:
  contents: read
  issues: write
  deployments: read

concurrency:
  group: post-deploy-smoke-${{ github.event.deployment_status.environment || github.event.inputs.base_url || 'default' }}
  cancel-in-progress: false

jobs:
  smoke:
    name: Run post-deploy smoke tests
    runs-on: ubuntu-latest
    timeout-minutes: 10
    # Only run on successful deployments or manual triggers / scheduled runs.
    if: |
      github.event_name != 'deployment_status' ||
      github.event.deployment_status.state == 'success'
    env:
      TARGET_BASE_URL: >-
        ${{ github.event.inputs.base_url
            || github.event.deployment_status.environment_url
            || secrets.STAGING_BASE_URL }}
      STAGING_SESSION_COOKIE: ${{ secrets.STAGING_SESSION_COOKIE }}

    steps:
      # actions/checkout v6.0.2 (SHA-pinned for supply-chain hardening)
      - uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd

      # actions/setup-node v6.4.0 (SHA-pinned for supply-chain hardening)
      - uses: actions/setup-node@48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e
        with:
          node-version: "20"

      - name: Run smoke checker
        id: smoke
        continue-on-error: true
        run: |
          set -euo pipefail

          if [ -z "${TARGET_BASE_URL:-}" ]; then
            echo "::error::TARGET_BASE_URL is not set. Configure STAGING_BASE_URL secret or pass base_url input. See docs/testing/smoke-tests.md § Setup."
            exit 2
          fi

          mkdir -p dist
          ARGS=(
            --base-url "$TARGET_BASE_URL"
            --report dist/smoke-report.md
            --json dist/smoke-report.json
            --tier "${{ inputs.tier || 'all' }}"
          )
          if [ "${{ inputs.strict }}" = "true" ]; then
            ARGS+=(--strict)
          fi

          set +e
          node scripts/post-deploy-smoke.mjs "${ARGS[@]}"
          SMOKE_EXIT=$?
          set -e

          echo "smoke_exit=$SMOKE_EXIT" >> "$GITHUB_OUTPUT"

          {
            echo "### Post-deploy smoke"
            echo ""
            echo "- **Base URL:** \`$TARGET_BASE_URL\`"
            echo "- **Tier:** \`${{ inputs.tier || 'all' }}\`"
            echo "- **Exit code:** \`$SMOKE_EXIT\` (0=clean, 1=failures, 2=script error)"
            echo ""
            echo "<details><summary>Full report</summary>"
            echo ""
            cat dist/smoke-report.md
            echo ""
            echo "</details>"
          } >> "$GITHUB_STEP_SUMMARY"

          exit "$SMOKE_EXIT"

      - name: Upload smoke report
        if: always()
        # actions/upload-artifact v4.4.3 (SHA-pinned for supply-chain hardening)
        uses: actions/upload-artifact@b7c566a772e6b6bfb58ed0dc250532a479d7789f
        with:
          name: smoke-report
          path: dist/smoke-report.*
          retention-days: 14

      - name: Create / refresh smoke-test-fail issue
        if: steps.smoke.outcome == 'failure' && github.event_name != 'workflow_dispatch'
        # actions/github-script v8.0.0 (SHA-pinned for supply-chain hardening)
        uses: actions/github-script@ed597411d8f924073f98dfc5c65a23a2325f34cd
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
          script: |
            const fs = require('node:fs');
            const date = new Date().toISOString().slice(0, 10);

            let report = '';
            try {
              report = fs.readFileSync('dist/smoke-report.md', 'utf-8');
            } catch (err) {
              report = `_No report artifact: ${err.message}_`;
            }

            const trigger = context.eventName;
            const env =
              context.payload?.deployment_status?.environment ?? 'staging';
            const title = `[Smoke] Post-deploy smoke failed — ${env} ${date}`;
            const runUrl = `${context.serverUrl}/${context.repo.owner}/${context.repo.repo}/actions/runs/${context.runId}`;
            const body = [
              '## Post-deploy smoke failed',
              '',
              `**Run:** ${runUrl}`,
              `**Date:** ${new Date().toISOString()}`,
              `**Environment:** \`${env}\``,
              `**Triggered by:** \`${trigger}\``,
              '',
              'One or more critical endpoints returned an unexpected status,',
              'latency above SLO budget, or shape mismatch right after deploy.',
              'This is a **liveness regression** signal — the deployed copy is',
              'not serving the expected contract.',
              '',
              'Follow [`docs/testing/smoke-tests.md`](../blob/main/docs/testing/smoke-tests.md)',
              'for triage. TL;DR:',
              '',
              '1. Open the run above → `smoke-report` artifact for the full table.',
              '2. Classify: dep outage (Anthropic/Mono/Voyage) vs handler regression vs config.',
              '3. If regression — block next deploy + rollback if user-facing.',
              '',
              '---',
              '',
              '<details><summary>Latest report (markdown)</summary>',
              '',
              report,
              '',
              '</details>',
              '',
              'cc @Skords-01',
            ].join('\n');

            const { data: issues } = await github.rest.issues.listForRepo({
              owner: context.repo.owner,
              repo: context.repo.repo,
              state: 'open',
              labels: 'smoke-test-fail',
              per_page: 5,
            });
            const existing = issues.find((i) =>
              i.title.startsWith('[Smoke]'),
            );

            if (existing) {
              await github.rest.issues.createComment({
                owner: context.repo.owner,
                repo: context.repo.repo,
                issue_number: existing.number,
                body: [
                  `### Re-detected on ${date} (${env})`,
                  '',
                  `**Run:** ${runUrl}`,
                  '',
                  '<details><summary>Latest report (markdown)</summary>',
                  '',
                  report,
                  '',
                  '</details>',
                ].join('\n'),
              });
              core.info(`Updated existing issue #${existing.number}.`);
            } else {
              const created = await github.rest.issues.create({
                owner: context.repo.owner,
                repo: context.repo.repo,
                title,
                body,
                labels: ['smoke-test-fail', 'tech-debt'],
              });
              core.info(`Created new issue #${created.data.number}.`);
            }

      - name: Fail the job on smoke failure
        if: steps.smoke.outcome == 'failure'
        run: |
          echo "::error::Post-deploy smoke detected ≥1 failure. See dist/smoke-report.md."
          exit 1
```
