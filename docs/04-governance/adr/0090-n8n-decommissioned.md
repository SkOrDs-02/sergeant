# ADR-0090: Виведення n8n-шару з репозиторію

- **Status:** Proposed
- **Date:** 2026-09-02
- **Deciders:** @Skords-01
- **Supersedes:** [ADR-0026](./0026-n8n-workflow-source-of-truth.md)
- **Related:**
  - [ADR-0074](./0074-hosting-hetzner-coolify.md) — Railway виведено; n8n-інстанс, що жив у Railway-проєкті, не переїхав на Coolify
  - [ADR-0075](./0075-openclaw-gateway-decommissioned.md) — прецедент decommission-у цілого шару з permalink-снапшотом
  - [ADR-0081](./0081-repository-simplification.md) — конвенція permalink-посилань на видалені файли
  - [ADR-0089](./0089-job-substrates-outbox-broker-timer.md) — серверні таймери як субстрат періодичних задач, які раніше виконували n8n-крони

---

## Context and Problem Statement

n8n був самостійним шаром автоматизації: 25 workflow-JSON у `ops/n8n-workflows/` <!-- removed -->, manifest з owner/risk/secrets, reporting-матриця, валідатор `scripts/n8n/validate-n8n-workflows.mjs` <!-- removed --> як CI-крок, Plop-генератор, сервіси `n8n` + `n8n-db` у `ops/docker-compose.ops.yml`, Prometheus-scrape, Grafana-дашборд і alert-rules. ADR-0026 закріпив Git як джерело істини для цих workflow-ів.

Фактичний стан на 2026-09-02:

- **Інстанс не працює з 2026-06-28.** n8n жив у Railway-проєкті; після виведення Railway ([ADR-0074](./0074-hosting-hetzner-coolify.md)) його не розгортали на Coolify. Реєстр loop-ів (`docs/00-start/agents/loops/registry.yaml`) з того дня тримає статус `blocked-on-infra`.
- **Крони переїхали на сервер.** Ранковий брифінг, reminder-sweep, growth-snapshot, GDPR-cleanup, digest — усе це in-process таймери й outbox-полери ([ADR-0089](./0089-job-substrates-outbox-broker-timer.md)); Silpo-sync свідомо проєктували «не n8n» ще у серпні.
- **Шар продовжував коштувати.** CI ганяв валідатор на кожному PR, `manifest.json` вимагав синхронізації з env-vars, Grafana Alloy у проді довелося вручну розсинхронізувати з репо-конфігом (див. `ops/grafana-alloy/README.md`), а десятки доків описували інструкції, які нема чим виконати.

Тримати у репо джерело істини для системи, якої немає, — це не «Git як істина», а дрейф: код і доки описують один стан, прод — інший.

## Considered Options

1. **Прибрати n8n-шар з репо цілком** — workflow-и, скрипти, генератор, compose-сервіси, scrape/alert-конфіг, CI-крок; доки перевести на історичні permalink-и.
2. **Задеплоїти n8n на Coolify і повернути до життя** — відновити інстанс, перепідключити 25 workflow-ів, підтримувати два субстрати періодичних задач паралельно з ADR-0089.
3. **Лишити як є («заморозити»)** — статус `blocked-on-infra` безстроково, валідатор у CI, доки з інструкціями під неіснуючий інстанс.

## Decision

Обрано **варіант 1**. З репозиторію прибрано:

- `ops/n8n-workflows/` <!-- removed --> (25 workflow-JSON, `manifest.json`, `REPORTING-MATRIX.md`, `_lib/`, README error-handler-а);
- `scripts/n8n/` <!-- removed --> (`n8n-workflows.mjs` import/export, `validate-n8n-workflows.mjs`) і npm-скрипти `ops:n8n:validate`, `n8n:import`, `n8n:export`;
- CI-крок «Validate n8n workflow definitions» у `.github/workflows/ci.yml`;
- Plop-генератор `new-n8n-workflow` з шаблоном і хелперами у `plopfile.mjs`;
- ESLint-baseline-виняток для `_lib/**`;
- сервіси `n8n`, `n8n-db` і їхні volume-и в `ops/docker-compose.ops.yml`; job `n8n` у `ops/prometheus/prometheus.template.yml` і `ops/grafana-alloy/config.alloy`; `ops/prometheus/rules/n8n.yml` <!-- removed --> (server-алерти перенесено в `ops/prometheus/rules/server.yml`); `ops/grafana/dashboards/n8n-overview.json` <!-- removed -->;
- surface `n8n-workflows` у генераторі service-catalog і `n8n-runtime` зі схеми deploy-target-ів.

Playbook `modify-n8n-workflow.md` стиснуто до redirect-стаба; ADR-0026 переведено у `Superseded by ADR-0090`. Історичний стан шару доступний за permalink-снапшотом: <https://github.com/SkOrDs-02/sergeant/blob/ffdf694cb60dcfeebc2c1de14887c5a8a1d71e6b/ops/n8n-workflows/>.

**Поза scope цього ADR (follow-up):** серверний залишок, який ще посилається на n8n як на зовнішнього клієнта — env `N8N_WEBHOOK_BASE_URL`, таблиці `n8n_webhook_events` / `n8n_failure_events`, replay-роути `/api/internal/webhook-events/*`, метрики `n8n_webhook_replay_*`, компонент `n8n` на StatusPage, Grafana-дашборди `ops-overview` / `ops-home` / `n8n-webhook-events` у `docs/03-operations/observability/dashboards/`, `ops/.env.ops.example`. Вони не ламають нічого без інстансу, але їхнє вилучення — окрема зміна з міграціями (Hard Rule #4, two-phase DROP) і контрактами API (Hard Rule #3). Сам n8n-інстанс (якщо десь ще живе) вимикає власник.

## Rationale

- Періодичні задачі вже мають ратифікований субстрат ([ADR-0089](./0089-job-substrates-outbox-broker-timer.md)); другий паралельний субстрат для тих самих задач — це подвійна логіка без переваг.
- Двомісячна пауза без інцидентів показала, що жоден workflow не був критичним шляхом: усе критичне вже або в сервері, або в GitHub Actions (`db-backup-verify.yml`, `deploy-api.yml`).
- «Заморозка» коштує реальних CI-хвилин і, головне, підтримує хибну картину в доках і onboarding-у агентів.

## Consequences

### Positive

- Одна система періодичних задач і одна модель алертів (server-side shipper → Telegram).
- Мінус CI-крок, мінус Plop-генератор, мінус два compose-сервіси й два volume-и; ops-стек стає «Prometheus + Grafana (+ Alloy)».
- Доки й скіли перестають відправляти агентів у неіснуючий UI.

### Negative

- Втрачено GUI-observability виконань (run history, ручний re-run), яку n8n давав; заміна — Sentry + Prometheus-метрики таймерів.
- Історія рішень про Telegram-routing тепер розкидана між ADR-0030, [`alert-bot-routing.md`](../../03-operations/observability/alert-bot-routing.md) і permalink-снапшотом.

### Neutral

- ADR-0030 (структура Telegram-каналів) чинний — він про канали, не про n8n.
- Серверні `/api/internal/*` роути й `INTERNAL_API_KEY` + HMAC-guard лишаються: у них є інші клієнти (CI, admin tooling).

## Compliance

- У репо немає каталогу `ops/n8n-workflows/` <!-- removed --> і `scripts/n8n/` <!-- removed -->; `package.json` не має скриптів з префіксом `n8n:` / `ops:n8n:`.
- `pnpm docs:check-service-catalog` — surface `n8n-workflows` відсутній у згенерованому каталозі.
- `pnpm docs:check-links` — усі посилання на видалені файли ведуть на permalink-снапшот.
- Playbook-каталог: `modify-n8n-workflow.md` у секції «Deprecated redirect anchors».

## Links

- [ADR-0026](./0026-n8n-workflow-source-of-truth.md) — рішення, яке цей ADR замінює.
- [`docs/00-start/agents/loops/registry.yaml`](../../00-start/agents/loops/registry.yaml) — запис про паузу 2026-06-28.
- [`ops/README.md`](../../../ops/README.md) — актуальний склад ops-стеку.
