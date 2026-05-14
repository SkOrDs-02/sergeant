# Pact contract drift — runbook

> **Last validated:** 2026-05-13 by @Skords-01 / Devin. **Next review:** 2026-08-11.
> **Status:** Active

> **Single source of truth → [`docs/architecture/api-contracts.md`](../architecture/api-contracts.md).** Той файл описує **що** живе у Pact-контракті і **як** працює consumer/provider pipeline. Цей runbook описує **що робити**, коли daily-cron детектує drift проти live staging.

## TL;DR

| Сигнал                                                                                           | Що це означає                                                                                      | Перша дія                                                            |
| ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| GitHub-issue `[Pact drift] Daily contract drift detected — YYYY-MM-DD` (label: `contract-drift`) | `pact-drift` workflow знайшов ≥1 інтеракцію з verdict `fail` проти `STAGING_BASE_URL` o 06:00 UTC. | Відкрий issue → `pact-drift-report` artifact → класифікуй falures.   |
| `pact-drift` job `failure` на ad-hoc dispatch                                                    | Хтось вручну запустив workflow (`workflow_dispatch`); або strict-mode пройшов на warns.            | Глянь `Pact drift check` секцію у `GITHUB_STEP_SUMMARY` цього run-у. |
| Issue закрита, але повторно reopen-ається > 2x за тиждень                                        | Drift fluky-ий (data state на staging нестабільний) **або** real regression який ще не закомічили. | Eskalate: pair з owner → patch staging + freeze deploys до фіксу.    |

## Як workflow працює

- Файл (потрібно створити вручну — див. § Workflow YAML): `.github/workflows/pact-drift.yml`.
- Тригери: cron `0 6 * * *` (06:00 UTC щодня) + `workflow_dispatch` з опціями (`base_url`, `include_mutations`, `strict`).
- Скрипт: [`scripts/pact-drift-check.mjs`](../../scripts/pact-drift-check.mjs).
- Контракти: `packages/api-client/pacts/*.json` (зараз — один файл `sergeant-api-client-sergeant-server.json` з 10 інтеракціями).
- Idempotent issue logic: один open issue `[Pact drift] …` із label `contract-drift`. Наступні детекції → comment у той самий issue, а не дубльований issue. Mirrors `db-backup-verify.yml`.

> **Why the YAML lives in docs and not under `.github/workflows/`:** PR-42 (#2675) і ця PR використовують OAuth App без `workflow` scope, тож автоматизований push нової workflow-файла remote rejected-иться (`refusing to allow an OAuth App to create or update workflow … without 'workflow' scope`). До отримання scope-а — скопіюй YAML нижче у `.github/workflows/pact-drift.yml` вручну (через GH UI: "Add file" → "Create new file" → шлях `.github/workflows/pact-drift.yml`).

### Як читається verdict

Скрипт перетворює тіло pact-response і live-response на **schema skeleton** (recursive `{key: type}`) і diff-ить два skeleton-и. Він не порівнює значення (staging завжди має різні numbers/IDs/timestamps).

| Verdict   | Коли                                                                                                                                                              | Bloack PR?                                                                |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| ✅ `pass` | HTTP-status == pact + body schema == pact.                                                                                                                        | —                                                                         |
| ⚠️ `warn` | HTTP-status == pact, але body має **додаткові** поля (additive) або **порожні** масиви замість елементів (data-drift на staging, не schema-drift).                | Ні, default mode. `--strict` (workflow input) робить `warn` → `fail`.     |
| ❌ `fail` | HTTP-status mismatch **або** missing field **або** type mismatch (string ≠ number, null ≠ string, object ≠ array). Реальний contract break — клієнт буде падати.  | Так — daily-cron створює issue `contract-drift`; deploy слід заблокувати. |
| ⏭️ `skip` | Mutation-endpoint (POST/PUT/PATCH/DELETE) без `--include-mutations`, **або** endpoint вимагає auth але `STAGING_SESSION_COOKIE` не сетнутий, **або** `--dry-run`. | —                                                                         |

## Налаштування

### Required secrets

| Secret                   | Опис                                                                                                      | Як отримати                                                                                                                                                                                                                                                                 |
| ------------------------ | --------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `STAGING_BASE_URL`       | Provider base URL (e.g. `https://api.staging.sergeant.app`). Без trailing slash.                          | З deploy-config (Railway → staging service → public URL).                                                                                                                                                                                                                   |
| `STAGING_SESSION_COOKIE` | Повне значення для HTTP `Cookie` header — типово `better-auth.session_token=<...>` (без подвійних лапок). | Логін у staging як test-user `user-pact-001` → DevTools → Application → Cookies → копія `better-auth.session_token`. Test user створюється через staging seed-скрипт; password rotation — щонеділі (`.agents/skills/sergeant-data-and-migrations/SKILL.md § seed scripts`). |

Без `STAGING_SESSION_COOKIE` всі auth-required endpoints отримають verdict `skip / missing_auth` (workflow зелений, але coverage обмежений до публічних endpoints). Hard-fail тільки коли `STAGING_BASE_URL` відсутній.

### Local dry-run

```bash
# Без HTTP — просто парсить pact + друкує план:
node scripts/pact-drift-check.mjs --dry-run

# Проти локального dev-сервера:
node scripts/pact-drift-check.mjs --base-url http://127.0.0.1:3000
node scripts/pact-drift-check.mjs --base-url http://127.0.0.1:3000 --include-mutations

# Strict-mode (additive drift = fail):
node scripts/pact-drift-check.mjs --base-url http://127.0.0.1:3000 --strict

# З авторизацією:
STAGING_SESSION_COOKIE="better-auth.session_token=..." \
  node scripts/pact-drift-check.mjs --base-url http://127.0.0.1:3000
```

CLI друкує markdown-репорт у stdout + опціонально пише його у файл (`--report path.md`) і структурований JSON (`--json path.json`). Exit-коди: `0` clean / `1` drift / `2` script-error.

### Unit-tests

Pure diff-engine має 16 unit-тестів — `node --test scripts/__tests__/pact-drift-check.test.mjs`. Бажано доганяти при будь-якій правці шейп-екстракту або diff-логіки. HTTP runner deliberately не тестується (live HTTP — це і є вся суть).

## Triage playbook

### Крок 1 — Класифікуй кожен `fail`

Відкрий артифакт `pact-drift-report` у failed run → секція `## Failures (detail)`. Для кожної failed-інтеракції підготуй відповідь на питання:

1. **Чи це регресія сервера?** Запусти `pnpm --filter @sergeant/server test -- contracts/provider.test.ts` локально проти `main`. Якщо provider-replay теж червоний → сервер змінив shape, треба patch.
2. **Чи це data-drift на staging?** Глянь `warn` записи: `array_now_empty` / `array_now_populated` — це state-drift (test user не має записів / має нові записи), не schema-drift. Без strict-mode вони не блокують.
3. **Чи контракт сам застарів?** Це normal flow після свідомого refactor. Тоді consumer (`@sergeant/api-client`) уже оновлений у попередньому PR — pact-файл потребує regenerate. Дивись § Крок 3.

### Крок 2 — Server-side regression

Якщо handler шипить інший shape ніж pact обіцяв:

```bash
# Repro локально:
DATABASE_URL=postgresql://hub:hub@127.0.0.1:5432/hub pnpm --filter @sergeant/server dev
# Інший термінал:
node scripts/pact-drift-check.mjs --base-url http://127.0.0.1:3000
```

Якщо drift повторюється — fix handler (response shape), додай regression unit-test у `apps/server/src/__tests__/contracts/provider.test.ts`, відкрий PR з `fix(server):` scope. PR закриває drift-issue через `Closes #<NN>` у description.

### Крок 3 — Contract regenerate (свідомий refactor)

Якщо drift очікуваний (наприклад додали нове поле у response, deprecated стару форму):

1. Onsume side: онови `*.contract.test.ts` у `packages/api-client/src/__tests__/contracts/` → новий shape.
2. Regenerate pact: `pnpm --filter @sergeant/api-client test -- contracts/` — Pact автоматично пише `packages/api-client/pacts/sergeant-api-client-sergeant-server.json`.
3. Provider replay: `pnpm --filter @sergeant/server test -- contracts/` — переконайся що handler під оновлений shape проходить.
4. Closing comment на drift-issue з лінком на PR. Issue буде closed автоматично через `Closes #<NN>`.

### Крок 4 — Якщо `fail`-и persist > 24h

Це означає що або:

- Drift досі не виправлений → escalate owner-а (CODEOWNERS → `@Skords-01`).
- Workflow flaky (network до staging) → запусти `workflow_dispatch` вручну з `strict: false` і подивись чи repro-ситься. Якщо ні — додай коммент у issue («tried `workflow_dispatch` at HH:MM UTC — clean. Marking flaky and watching for tomorrow's cron.») і close.

### Крок 5 — Якщо `flake-rate` > 2x/тиждень

Передай у `docs/initiatives/` як окреме завдання — або контракт надто чутливий до даних на staging (треба матчери, `like()` / `term()`), або staging-state нестабільний (треба seed-стабілізація). Не tightening поза runbook-ом без обговорення.

## Як це працює разом із `provider.test.ts`

| Шар                         | Коли запускається                                      | Що ловить                                                                                               |
| --------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| `provider.test.ts` (Vitest) | Per-PR у `ci.yml` (`check` + `Test coverage (vitest)`) | Handler logic ≠ pact (in-process через `createApp()` + supertest з mocked DB / Anthropic / Voyage).     |
| `pact-drift.yml` (daily)    | Cron 06:00 UTC + manual `workflow_dispatch`            | Live staging response shape ≠ pact (real Express, real middleware, real Postgres, real CDN/WAF if any). |

Перший ловить логіку, другий — інфраструктуру. Обидва обовʼязкові: deploy без перших — handler шипить bug; deploy без другого — handler-фікс не дійшов до staging через rollout / feature-flag drift.

## Workflow YAML

Закомить як `.github/workflows/pact-drift.yml`:

```yaml
name: Pact contract drift (daily cron)

# Owner: @Skords-01 (solo maintainer per .github/CODEOWNERS).
# Triage: false-positive runs → close the auto-created `contract-drift` issue
#         з коментарем; reopen якщо повторюється > 2x за тиждень. Full runbook:
#         `docs/testing/pact-drift-runbook.md`.
# Schedule rationale: PR-42 (#2675) + persona-extend (#2703) ship Pact
#         contract coverage that is verified at PR-time against the in-process
#         `createApp()` mock. This workflow runs the same contracts against
#         **live staging** every day so wire-level drift from infra changes
#         (WAF rewrites, middleware ordering, response-header normalisation,
#         feature-flag rollouts that change shape per environment) gets caught
#         within ~24h of introduction, well before the next prod deploy. Sister
#         job to `db-backup-verify.yml` — same idempotent-issue pattern.

on:
  schedule:
    # 06:00 UTC daily — ~09:00 Kyiv. After nightly audit (`nightly-audit.yml`
    # at 02:00 UTC) and `db-backup-verify.yml` (Sundays 04:00 UTC); keeps the
    # alert lane separate so cron-noise does not coalesce.
    - cron: "0 6 * * *"
  workflow_dispatch:
    inputs:
      base_url:
        description: "Provider base URL override (default: $STAGING_BASE_URL)"
        required: false
        type: string
      include_mutations:
        description: "Also run POST/PUT/PATCH/DELETE interactions"
        required: false
        type: boolean
        default: false
      strict:
        description: "Treat warnings (additive drift) as failures"
        required: false
        type: boolean
        default: false

permissions:
  contents: read
  issues: write

concurrency:
  group: pact-drift
  cancel-in-progress: true

jobs:
  drift:
    name: Run Pact drift check against staging
    runs-on: ubuntu-latest
    timeout-minutes: 10
    env:
      STAGING_BASE_URL: ${{ inputs.base_url || secrets.STAGING_BASE_URL }}
      STAGING_SESSION_COOKIE: ${{ secrets.STAGING_SESSION_COOKIE }}

    steps:
      # actions/checkout v6.0.2 (SHA-pinned for supply-chain hardening)
      - uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd

      # actions/setup-node v6.4.0 (SHA-pinned for supply-chain hardening)
      - uses: actions/setup-node@48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e
        with:
          node-version: "20"

      - name: Run drift checker
        id: drift
        # Continues on error so the "Upload artifacts" + "Create issue"
        # steps still run when shape drift is detected (exit code 1).
        continue-on-error: true
        run: |
          set -euo pipefail

          if [ -z "$STAGING_BASE_URL" ]; then
            echo "::error::STAGING_BASE_URL secret is not configured. See docs/testing/pact-drift-runbook.md § Setup."
            exit 2
          fi

          mkdir -p dist
          ARGS=(
            --base-url "$STAGING_BASE_URL"
            --report dist/pact-drift-report.md
            --json dist/pact-drift-report.json
          )
          if [ "${{ inputs.include_mutations }}" = "true" ]; then
            ARGS+=(--include-mutations)
          fi
          if [ "${{ inputs.strict }}" = "true" ]; then
            ARGS+=(--strict)
          fi

          # Capture exit code separately so the step does not abort before
          # the markdown summary is added.
          set +e
          node scripts/pact-drift-check.mjs "${ARGS[@]}"
          DRIFT_EXIT=$?
          set -e

          echo "drift_exit=$DRIFT_EXIT" >> "$GITHUB_OUTPUT"

          {
            echo "### Pact drift check"
            echo ""
            echo "- **Base URL:** \`$STAGING_BASE_URL\`"
            echo "- **Exit code:** \`$DRIFT_EXIT\` (0=clean, 1=drift, 2=script error)"
            echo ""
            echo "<details><summary>Full report</summary>"
            echo ""
            cat dist/pact-drift-report.md
            echo ""
            echo "</details>"
          } >> "$GITHUB_STEP_SUMMARY"

          exit "$DRIFT_EXIT"

      - name: Upload drift report
        # actions/upload-artifact v4.4.3 (SHA-pinned for supply-chain hardening)
        if: always()
        uses: actions/upload-artifact@b7c566a772e6b6bfb58ed0dc250532a479d7789f
        with:
          name: pact-drift-report
          path: dist/pact-drift-report.*
          retention-days: 30

      - name: Create / refresh contract-drift issue on failure
        if: steps.drift.outcome == 'failure' && github.event_name == 'schedule'
        # actions/github-script v8.0.0 (SHA-pinned for supply-chain hardening)
        uses: actions/github-script@ed597411d8f924073f98dfc5c65a23a2325f34cd
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
          script: |
            const fs = require('node:fs');
            const date = new Date().toISOString().slice(0, 10);

            let report = '';
            try {
              report = fs.readFileSync('dist/pact-drift-report.md', 'utf-8');
            } catch (err) {
              report = `_No report artifact: ${err.message}_`;
            }

            const title = `[Pact drift] Daily contract drift detected — ${date}`;
            const runUrl = `${context.serverUrl}/${context.repo.owner}/${context.repo.repo}/actions/runs/${context.runId}`;
            const body = [
              '## Pact contract drift detected',
              '',
              `**Run:** ${runUrl}`,
              `**Date:** ${new Date().toISOString()}`,
              `**Triggered by:** \`${context.eventName}\` (cron 06:00 UTC)`,
              '',
              'The daily `pact-drift` cron has detected drift between one or more',
              'consumer-driven Pact contracts (`packages/api-client/pacts/*.json`)',
              'and the live staging server. Drift means a deployed Web/Mobile',
              'client will likely break on the next prod release.',
              '',
              'Follow [`docs/testing/pact-drift-runbook.md`](../blob/main/docs/testing/pact-drift-runbook.md)',
              'for triage. TL;DR:',
              '',
              '1. Open the run above → `pact-drift-report` artifact for the full diff.',
              '2. Classify each failure: handler change vs contract obsolete.',
              '3. Either ship a server fix or update the consumer pact + replay.',
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

            // Idempotent: refresh the existing open issue rather than creating
            // a new one every day. Same pattern as db-backup-verify.yml.
            const { data: issues } = await github.rest.issues.listForRepo({
              owner: context.repo.owner,
              repo: context.repo.repo,
              state: 'open',
              labels: 'contract-drift',
              per_page: 5,
            });
            const existing = issues.find((i) =>
              i.title.startsWith('[Pact drift]'),
            );

            if (existing) {
              await github.rest.issues.createComment({
                owner: context.repo.owner,
                repo: context.repo.repo,
                issue_number: existing.number,
                body: [
                  `### Re-detected on ${date}`,
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
                labels: ['contract-drift', 'tech-debt'],
              });
              core.info(`Created new issue #${created.data.number}.`);
            }

      - name: Fail the job on drift
        if: steps.drift.outcome == 'failure'
        run: |
          echo "::error::Pact drift detected. See dist/pact-drift-report.md."
          exit 1
```

## Related

- [`docs/architecture/api-contracts.md`](../architecture/api-contracts.md) — Pact pipeline overview, як додати новий endpoint.
- [`apps/server/src/__tests__/contracts/provider.test.ts`](../../apps/server/src/__tests__/contracts/provider.test.ts) — per-PR provider replay.
- [`packages/api-client/src/__tests__/contracts/`](../../packages/api-client/src/__tests__/contracts/) — consumer-side pact specs.
- [`scripts/pact-drift-check.mjs`](../../scripts/pact-drift-check.mjs) — drift CLI.
- [`.github/workflows/db-backup-verify.yml`](../../.github/workflows/db-backup-verify.yml) — sibling cron-job (same idempotent-issue pattern).
