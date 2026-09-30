# ADR-0101: Повернення CI на GitHub Actions і автодеплой бекенду після зеленого CI

- **Status:** Proposed
- **Date:** 2026-09-30
- **Last validated:** 2026-09-30
- **Next review:** 2026-12-30
- **Deciders:** @SkOrDs-02
- **Supersedes:** —
- **Related:**
  - [ADR-0074](./0074-hosting-hetzner-coolify.md) (хостинг бекенду: Coolify на Hetzner, білд із `Dockerfile.api` на сервері)
  - [ADR-0082](./0082-private-storage-repo-posture.md) (постура репозиторію)
  - [`.github/workflows/ci.yml`](../../../.github/workflows/ci.yml), джоба `deploy-api`
  - [`.github/workflows/deploy-api.yml`](../../../.github/workflows/deploy-api.yml)
  - [`scripts/__tests__/ci-deploy-verify-gate.test.mjs`](../../../scripts/__tests__/ci-deploy-verify-gate.test.mjs)
  - [Аудит DG-1](../../work/specs/audits/2026-09-23-docs-governance-audit.md) (відкрите питання «чим замінити CI»)

---

## Context and Problem Statement

З 2026-09-23 код жив на Bitbucket, бо GitHub-акаунти заблокували. Bitbucket Pipelines ніхто не вмикав, тож тиждень репо не мало CI зовсім: `.github/workflows/*` лежали в дереві, але ніде не виконувались. Гейтами були лише локальні Husky-хуки і `pnpm check`, який автор запускає сам. Деплой бекенду був тільки ручний (`pnpm deploy:api`), бо міграції БД їдуть в ENTRYPOINT образу і кожен деплой застосовує схему з нового коду на живій базі.

2026-09-30 власник повернув основний репозиторій на GitHub: `SkOrDs-02/sergeant`, **публічний**, тож хвилини Actions безкоштовні. `main` на GitHub, Bitbucket і дзеркалі Hetzner збігався (`a9d8b28bd`). Перший же прогін CI на цьому коміті показав ціну тижня без гейтів: червоні `check` (дрейф lockfile і два застарілі серверні тести), Knip, `size-limit` (+5 kB над стелею), dependency audit (нові advisory `undici`), a11y (регресія на `/chat`), інтеграційні тести сервера (`DELETE /api/me` віддає 500) і 15 із 52 critical-flow E2E. Паралельно старий `deploy-api.yml` спробував задеплоїти бекенд одночасно з CI, не чекаючи на нього, і зупинився лише на 401 від Coolify.

## Considered Options

1. **GitHub Actions на PR і `main` (мінімальний набір) + автодеплой бекенду лише після обовʼязкових джоб.**
2. **GitHub Actions лише як гейт PR, деплой і далі ручний.** Прибирає ризик, але лишає прод відстаючим: `pnpm deploy:status` роками показував розрив, який ніхто не закривав вчасно.
3. **Лишити локальний merge-gate у `pre-push` (реплей комітів на свіжий `main` у тимчасовому worktree).** Рішення 2026-09-24 для світу без CI. Спека так і не дійшла до коду: у `.husky/pre-push` жила лише перевірка змердженого PR на Bitbucket.
4. **Нічого не міняти.** Тиждень показав, що без CI борг росте непомітно, а деплой тоді остаточно залежить від дисципліни.

## Decision

Обрано варіант 1.

- `ci.yml` біжить на кожен `pull_request` і на `push` у `main`. Обовʼязкові для деплою джоби: `check` (format, `pnpm lint`, typecheck + тести, білд), `Critical-flow E2E (Playwright)`, `migration-lint`, `migration-down-drill`. `check` і critical-flow разом із `Lighthouse CI` вже стоять required-чеками в branch protection `main`.
- Автодеплой бекенду: джоба `deploy-api` у `ci.yml` з `needs:` на чотири джоби вище, лише на `push` у `main`, викликає reusable `deploy-api.yml`. Власного `on: push` той воркфлоу не має. Кроки: пропуск, якщо не задані секрети `COOLIFY_URL` / `COOLIFY_TOKEN`; пропуск, якщо `main` уже пішов далі (Coolify збирає голову гілки, а не коміт); пропуск, якщо від коміту в проді (останній `finished` деплой у Coolify) не змінювались шляхи, що потрапляють в образ; `POST /api/v1/deploy?uuid=…`; опит `/api/v1/deployments/applications/<uuid>` до `finished`; звірка, що задеплоєний коміт дорівнює `github.sha`; `GET https://api.sergeant.com.ua/health` = 200. Будь-яке розходження фарбує джобу в червоне. `concurrency: deploy-api` без скасування.
- Старий ghcr-шлях (білд образу в Actions, пуш у `ghcr.io`, webhook у Coolify) прибрано: Coolify з 2026-09-23 сам клонує репо і збирає `Dockerfile.api`.
- `pnpm deploy:api -- --yes` лишається запасним ручним шляхом.
- **На PR і push у `main` біжить лише потрібне для мержу й деплою.** Перший же PR показав, що повний набір (`ci.yml` плюс ще ~15 workflow на кожен push) забиває чергу GitHub Actions на десятки хвилин. Тому:
  - `ci.yml` на PR/push: `check`, `Critical-flow E2E (Playwright)`, `migration-lint`, `migration-down-drill`, `commitlint`, `secret-scan`, на `main` ще `deploy-api`. Critical-flow лишається, бо це required-чек branch protection і частина `needs:` автодеплою; migration-джоби, бо міграції виконує прод; commitlint і gitleaks коштують менше хвилини і тримають Hard Rule #5 та secret scan.
  - `lighthouse-ci.yml` теж переведено на щопонеділковий розклад і ручний запуск. `Lighthouse CI` досі стоїть required-чеком у branch protection `main`, тож власник має прибрати його звідти, інакше PR чекатимуть на чек, який не стартує.
  - Решта джоб `ci.yml` (`bundle-budgets`, `coverage`, `a11y`, `mobile-ui-audit`, `landing-quality`, `knip-scan`, `security-audit`, `server-integration`, `rag-eval`, `tool-eval`, `actionlint`, `todo-freshness`, `pipeline-duration-summary`) - щопонеділка о 04:00 UTC і вручну.
  - Щопонеділка і вручну: `ai-legacy-scan`, `codeql`, `container-scan`, `contract-tests`, `docs-automation`, `docs-freshness`, `extended-e2e`, `skill-freshness`, `post-deploy-smoke` (без `deployment_status`), `docs-daily-brief`, `nightly-audit`, `pact-drift`, `web-route-ledger` (останні чотири були щоденні). Без змін: `db-backup-verify`, `mutation-testing`, `rag-eval-live` (уже щотижневі).
  - Лише вручну: `deploy-landing` (раніше автодеплой лендінгу на push), `deploy-config-staging-gate`, `mobile-shell-android`, `mobile-shell-ios` (мобільний контур на паузі, ADR-0094), `posthog-release-annotation`, `storybook-deploy`. Вже були ручними: `detox-*`, `mobile-flaky-verify`, `mobile-shell-*-release`.
  - `pr-backlinks.yml` лишається на `pull_request_target: closed`, але вимкнений змінною `PR_LEDGER_ON_GITHUB` (джоба одразу `skipped`).
- З `.husky/pre-push` знято перевірку змердженого PR на Bitbucket (`scripts/pre-push-merged-pr.mjs`) разом із нагадуванням про реєстр PR. Оновлення `main` у трунку `D:\Sergeant` лишилось: від Bitbucket воно не залежить, а без нього застарівають хуки в усіх worktree.
- PR створюються через `gh pr create`. Bitbucket лишається архівним remote `bitbucket`, дзеркало Hetzner - другою push-адресою `origin`.

## Rationale

- Автодеплой без гейта в цьому репо небезпечний саме через міграції в ENTRYPOINT. `needs:` робить залежність механічною, а не дисциплінарною; тест `ci-deploy-verify-gate` стереже, щоб ні `needs:`, ні умова на `main` тихо не зникли.
- Звірка коміту, а не статусу: Coolify відповідає 2xx на «прийнято» і потім може відкотитись на старий контейнер (інцидент 2026-09-14), а деплой коротший за хвилину найчастіше означає, що зібрано вже задеплоєний коміт.
- Відсутні секрети дають зелений пропуск, а не червону джобу: «автодеплой ще не ввімкнено» не є поломкою `main`.
- Critical-flow у `needs:` свідомо: це єдина джоба, що піднімає справжній API-сервер із міграціями проти браузера. Поки вона червона, бекенд сам не деплоїться.

## Consequences

### Positive

- Кожен PR і кожен мерж у `main` знову має вердикт, а прод-бекенд доганяє `main` без ручного кроку.
- Гейти, що з 2026-09-23 значились «вручну», знову виконуються: commitlint і secret scan на кожному PR, бандл-бюджети, a11y, mobile UI audit і Knip щотижня. Регресія між тижневими прогонами може прожити до шести днів - це свідома ціна короткої черги.

### Negative

- На дату рішення critical-flow червоний (15 із 52), тож автодеплой фактично не спрацює, доки E2E не полагодять. Це ціна безпечного гейта, а не дефект механізму.
- Реєстр PR (Hard Rule #26) лишився без механізму повноти: писач уміє читати лише Bitbucket API, `pr-backlinks.yml` вимкнено змінною репо `PR_LEDGER_ON_GITHUB`.
- Хвилини Actions: повний прогін `ci.yml` - близько 15-20 хвилин паралельних джоб. На PR застарілі прогони скасовуються (`cancel-in-progress`), на `main` ні.

### Neutral

- Рішення 2026-09-24 про локальний merge-gate у `pre-push` і fast-forward-only мерж у Bitbucket скасовано: їхню роль виконує CI.
- `pnpm deploy:status` лишається способом побачити розрив прод ↔ `main`.

## Фронт і Vercel

**Vercel, імовірно, знову збирає фронт із GitHub.** На PR #1233 зʼявились чеки `Vercel – sergeant` і `Vercel – sergeant-landing` (2026-09-30 червоні через денний ліміт збірок Hobby), тобто Git-інтеграція Vercel підключена до `SkOrDs-02/sergeant` і робить прев'ю на PR. Чи деплоїть вона Production-гілку `main` автоматично і як це співіснує з ручним `pnpm deploy:web`, не звірено: це налаштування Vercel-проєктів, їх перевіряє власник. Доки не звірено, не вважай `pnpm deploy:web` єдиним шляхом у прод фронта.

## Що має зробити власник

- Додати секрети репозиторію `COOLIFY_URL` (база інстансу Coolify без шляху) і `COOLIFY_TOKEN` (API-токен із правом deploy і читання деплоїв). Старі `COOLIFY_DEPLOY_WEBHOOK` і `COOLIFY_DEPLOY_TOKEN` більше не читаються.
- Полагодити critical-flow E2E, інакше автодеплой не спрацьовує.
- Прибрати `Lighthouse CI` з required-чеків branch protection `main` (він більше не біжить на PR).
- Звірити Vercel Git-інтеграцію: чи Production-гілка `main` деплоїться автоматично, і чи потрібен ще `pnpm deploy:web`.
