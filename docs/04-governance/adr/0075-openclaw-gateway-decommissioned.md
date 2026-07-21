# ADR-0075: OpenClaw Gateway decommissioned

- **Status:** accepted
- **Date:** 2026-07-20
- **Reviewers:** @SkOrDs-02
- **Supersedes:** [ADR-0027](./0027-openclaw-console-mcp-policy.md), [ADR-0032](./0032-console-consolidated-into-openclaw.md), [ADR-0033](./0033-openclaw-multi-personas-and-council.md), [ADR-0037](./0037-openclaw-write-audit-persistence.md), [ADR-0055](./0055-openclaw-external-gateway.md)
- **Related:**
  - [ADR-0055](./0055-openclaw-external-gateway.md) — external Gateway infra + cutover (superseded цим ADR).
  - [ADR-0074](./0074-hosting-hetzner-coolify.md) — Railway виведено з експлуатації; gateway був окремим Railway-сервісом.
  - [ADR-0037](./0037-openclaw-write-audit-persistence.md) — таблиця `openclaw_invocations` (write-audit) лишається у схемі; тепер її пише лише `ai-memory /forget`.

---

## 0. TL;DR

Зовнішній **OpenClaw Gateway** (окремий Railway-сервіс `sergeant-openclaw-gateway`,
ADR-0055) виведено з експлуатації разом із Railway (ADR-0074) і **повністю
прибрано з репозиторію**: `Dockerfile.openclaw-gateway`, пакет
`@sergeant/openclaw-plugin` (`packages/openclaw-plugin/`), config-as-code
`ops/openclaw/`, серверний модуль `apps/server/src/modules/openclaw/**` +
внутрішні маршрути `apps/server/src/routes/internal/openclaw*`, а також
gateway-специфічні env-змінні (`OPENCLAW_*`, n8n-делегація).

## Context and Problem Statement

ADR-0055 запустив зовнішній OpenClaw Gateway як заміну bespoke grammy-бота: окремий
Railway-контейнер із плагіном-містком над серверними `/api/internal/openclaw/*`
ендпоінтами. Після рішення про виведення Railway (ADR-0074) сам gateway-сервіс
згас, а вся його поверхня в репо стала мертвим кодом: плагін ніхто не імпортує,
внутрішні openclaw-маршрути не мають виклику, а конфіг-образ не білдиться й не
деплоїться.

Тримати ~200 файлів мертвого коду + ~30 env-змінних + окремий Docker-recipe —
чистий maintenance-борг і джерело плутанини для агентів (routing-таблиця вела на
неіснуючу поверхню).

## Decision

**Прибрати OpenClaw повністю.** Зокрема:

- Видалити `Dockerfile.openclaw-gateway`, `packages/openclaw-plugin/`, `ops/openclaw/`.
- Видалити серверний модуль `apps/server/src/modules/openclaw/**`, внутрішні
  маршрути `routes/internal/openclaw*` та зняти їх монтування з internal-router.
- Прибрати gateway-специфічні env-змінні з `apps/server/src/env/env.ts`
  (`OPENCLAW_*` config: founder-id, budget, ритуали, GitHub-App, SEO-stubs,
  reminder-poller, approval-nonce; n8n-делегація `N8N_API_URL`/`N8N_API_KEY`;
  telegram-tool env).
- Видалити gateway-документацію та agent-скіл `sergeant-openclaw` / `qa-openclaw`.
- Прибрати gateway-крони n8n (morning-briefing / weekly-review / monthly-okr /
  alert-escalation) з `ops/n8n-workflows/`.

### Що свідомо **лишається**

- **Таблиці** `openclaw_invocations`, `openclaw_mute_state`, `openclaw_write_audit`,
  `openclaw_decisions`, `openclaw_reminders` — міграції immutable (Hard Rule #4).
  Назви історичні; таблиці не перейменовуються.
- **Invocation-audit helper-и** (`openInvocation` / `finalizeInvocation`) —
  перенесено у `apps/server/src/modules/ai-memory/invocation-audit.ts`; тепер їх
  єдиний писар — `ai-memory /forget` (audit LLM-інвокації, ADR-0037 лишається
  Active у частині таблиці).
- **Founder-mute guard** (`isFounderMuted`) — перенесено у
  `apps/server/src/modules/alerts/mute-state.ts`; alerts-shipper і далі поважає
  «do not disturb» для founder-DM каналів.
- **Hard Rule #20 PAT-guard** у `assertStartupEnv()` — лишається як
  defense-in-depth: leftover `OPENCLAW_GITHUB_PAT` / `Git_PAT` у prod-env і далі
  fail-close-ить старт. Правило #20 у реєстрі не знімається.

### Immutable-ADR link-graph

Docs, на які лінкують immutable-ADR (`openclaw-roadmap.md`, `deploy/openclaw.md`,
`rotate-openclaw-credentials.md`, `openclaw-migration-plan.md`), **не видаляються** —
позначені `Deprecated` in-place з вказівником на цей ADR, щоб internal-link-checker
(`--strict-external`) лишався зеленим.

## Consequences

### Positive

- ~200 файлів мертвого коду й окремий Docker-recipe прибрано; менша cognitive load.
- Env-схема серверу коротша на ~30 змінних; менше секрет-провенансу для аудиту.
- Routing-таблиця агентів більше не веде на неіснуючу поверхню.

### Neutral

- Історичні OpenClaw-таблиці лишаються у схемі (immutable-міграції). `ai-memory
/forget` і alerts-mute продовжують працювати без змін поведінки.
- Immutable-ADR (0031/0032/0033/0036/0037/0041/0055) лишаються історичним записом;
  статус 0055 → `Superseded by ADR-0075`.

### Negative

- Якщо колись знадобиться co-founder-асистент — це буде нова реалізація з нуля
  (external Gateway як продукт лишається доступним, але інтеграцію треба відновлювати).

<!-- AUTO-GENERATED: PR-BACKLINKS-START -->

## Recent PRs

| PR                                                     | Title                                                                | Merged     |
| ------------------------------------------------------ | -------------------------------------------------------------------- | ---------- |
| [#364](https://github.com/Skords-01/Sergeant/pull/364) | docs(adr): sync ADR registry and operator docs with Coolify/ADR-0075 | 2026-07-21 |

_Auto-derived from `docs/04-governance/pr-ledger/index.json`. Top 1 most recent PRs touching this file._
<!-- AUTO-GENERATED: PR-BACKLINKS-END -->
