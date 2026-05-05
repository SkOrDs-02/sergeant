# ADR-0032: Sergeant Console зливається в OpenClaw bot

- **Status:** Accepted
- **Date:** 2026-05-02
- **Deciders:** @Skords-01
- **Supersedes:** —
- **Related:**
  - [ADR-0027 — OpenClaw / Console / MCP policy](./0027-openclaw-console-mcp-policy.md) — оригінальна політика console + OpenClaw.
  - [ADR-0030 — Telegram reporting structure](./0030-telegram-reporting-channel-structure.md) — supergroup + 7 топіків.
  - [ADR-0031 — OpenClaw v0 Telegram co-founder bot](./0031-openclaw-v0-telegram-cofounder.md) — v0 scope, allowlist, audit-log.
  - [`docs/launch/tech/openclaw-roadmap.md`](../launch/tech/openclaw-roadmap.md) — phasing.
  - [`docs/architecture/apps-status-matrix.md`](../architecture/apps-status-matrix.md) — console deployment row.

---

## Context

ADR-0027 ввів дві окремі поверхні Telegram-автоматизації для команди:

1. `@sergeant_console_bot` (`tools/console/src/index.ts` + `tools/console/src/agents/`) — slash-команди (`/ops`, `/content`, `/plan`, `/assign`, `/run`, `/approve`, `/cancel`, `/review`, `/logs`, `/status`), free-text роутер, allowlist по `ALLOWED_USER_IDS`.
2. `@OpenClaw_sergeant_bot` (ADR-0031, `tools/console/src/openclaw/*`) — DM-only co-founder з memory + read-only tools + decision log.

Обидва живуть у одному Node-процесі (`tools/console`), але користуються різними `*_BOT_TOKEN`. На момент Sprint 0 (2026-05-02) console-бот ніколи не був створений у @BotFather: токен `CONSOLE_BOT_TOKEN` відсутній, а `tools/console/src/index.ts` `process.exit(1)`-ив при старті, що блокувало OpenClaw.

Проте архітектурно для **solo-founder** фази Sergeant три бота — це over-engineering:

- 80% read-tools console-агентів (Stripe, Sentry, server-stats, PostHog, GitHub releases) збігаються з тим, що OpenClaw і так робить через `query_app_db` + `read_workflow_logs` + `read_github`.
- DM-формат OpenClaw-а вже дає `/budget`, `/decisions`, `/reset` плюс free-text. Додавання `/status`, `/metrics`, `/digest`, `/logs`, `/review` як preset-prompts через той самий agent-loop коштує ~50 LOC і повністю замінює потребу в окремому console-боті.
- Audit-log (`openclaw_invocations`), budget cap ($5/добу), iteration cap (8) і allowlist (single founder) — це інваріанти, які console-bot не мав з коробки.

Цей ADR закріплює консолідацію: одна Telegram-поверхня для всього "командного" контролю — OpenClaw — поки команда складається з одного засновника.

## Decision

**Sergeant Console (ADR-0027) консолідується в OpenClaw bot (ADR-0031).** Окремого `@sergeant_console_bot` як runtime-сервісу не існує. Усі ops/marketing/dispatcher-команди стають OpenClaw slash-prefilled-prompts, керованими тими самими guardrails (`OPENCLAW_DAILY_USD_BUDGET`, `OPENCLAW_MAX_ITERATIONS`, allowlist, audit, MarkdownV2 escaping).

### Що міняється у коді

1. **Boot-fence:** `tools/console/src/index.ts` робить `CONSOLE_BOT_TOKEN` опціональним за тим самим fail-closed-патерном, що OpenClaw — warn + skip замість `exit(1)`. Якщо обидва токени відсутні — процес виходить `1` (sanity-guard, інакше Railway-slot тримає dead container).

2. **Server-side tool ports** (`apps/server/src/modules/openclaw/tools.ts`): додано п'ять fail-soft tool-helpers, портованих з legacy `tools/console/src/agents/ops.ts` + `tools/console/src/agents/marketing.ts`:

   | Tool                  | Upstream                       | Fail-soft trigger                                                   |
   | --------------------- | ------------------------------ | ------------------------------------------------------------------- |
   | `get_stripe_metrics`  | Stripe REST `/v1/charges`      | `STRIPE_SECRET_KEY` not set                                         |
   | `get_sentry_issues`   | Sentry REST `/issues/`         | `SENTRY_AUTH_TOKEN` not set                                         |
   | `get_server_stats`    | self HTTP `/healthz`           | завжди працює (fallback localhost)                                  |
   | `get_posthog_stats`   | PostHog REST `/insights/trend` | `POSTHOG_API_KEY` або `POSTHOG_PROJECT_ID` not set                  |
   | `get_github_releases` | GitHub REST `/releases`        | unauth fallback (60 RPH); `OPENCLAW_GITHUB_PAT` бустить до 5000 RPH |

   Кожен повертає `{ notConfigured: true, note }` коли upstream-секрет відсутній — той самий патерн, що `read_workflow_logs` для n8n.

3. **HTTP routes** (`apps/server/src/routes/internal/openclaw.ts`): нові endpoint-и, всі під тим самим `Authorization: Bearer ${INTERNAL_API_KEY}` middleware і Zod-валідацією:
   - `POST /api/internal/openclaw/metrics/stripe`
   - `POST /api/internal/openclaw/metrics/sentry`
   - `POST /api/internal/openclaw/metrics/server`
   - `POST /api/internal/openclaw/metrics/posthog`
   - `POST /api/internal/openclaw/github/releases`

4. **Tool definitions** (`tools/console/src/agents/openclaw.ts`): додано 5 нових `openClawTools` записів і 5 ентрі у `TOOL_ROUTE` map. Жодних змін у system-prompt, tone-modes, або iteration-loop.

5. **Slash-команди** (`tools/console/src/openclaw/handler.ts`): preset-prompts для `/status`, `/metrics`, `/digest`, `/logs`, `/review`. Кожна команда викликає той самий `runAgentTurn(ctx, preset, "dm")` що і free-text. Audit-row відкривається/закривається однаково; `trigger='dm'` залишається.

6. **Dispatcher write-команди НЕ переносяться в Sprint 0.** `/run`, `/approve`, `/cancel`, `/assign` heavy-version — це Phase 4 OpenClaw roadmap-у (write-tools з approval-button). До тих пір вони відсутні. Якщо founder напише `/run X` — Telegram повідомить "command not recognized" (grammy default).

### Що НЕ міняється

- ADR-0027 політика для самого console-коду (`tools/console/src/agents/`) — read-only за замовчуванням, escape Telegram output, allowlist — лишається валідною до моменту повного видалення коду.
- `@Sergeant_alert_bot` (id `7949536379`) — push-only бот з n8n — без змін; ADR-0030 не зачіпається.
- ADR-0031 OpenClaw v0 — без змін у scope (DM-only, read-only, single founder, hard caps); цей ADR лише розширює tool-set.
- Railway service `Sergeant` (`apps/server`) — без змін.

### Naming + deployment

- Railway service для bot-процесу: `sergeant-hubchat` (config-as-code path `railway.console.toml`, Dockerfile `Dockerfile.console`). Ім'я `hubchat` залишається з epoch `tools/console` нейминг-а; перейменовувати — Phase 1.5 task разом з повним видаленням `tools/console/src/agents/`.
- Логи: `console.log("Sergeant Console starting…")` лишається у `index.ts` під `if (botToken)` гілкою — спрощує grep-по-логах. Коли console-код буде видалено повністю, замінимо на `console.log("OpenClaw bot starting…")`.

## Consequences

### Positive

- **Один surface, один guardrail-set.** Founder бачить metrics (`/status`, `/metrics`), digests (`/digest`), logs (`/logs`), reviews (`/review`), і вільний DM-діалог в одному чаті, з audit-row на кожен запит, $5/добу cap, і MarkdownV2 escape.
- **Менше Railway slot-ів.** Один service `sergeant-hubchat` замість двох.
- **Lower cognitive load.** Коли founder задає питання, він не вибирає бота — пише в OpenClaw і LLM обере правильний tool-set.
- **Plan-prerollout test surface.** Ті ж 5 нових tool-ів використовуються Phase 2 ритуалами (morning ritual / weekly review / monthly OKR) без подвійного коду.

### Negative / debt

- **Втрата deterministic slash-команд.** Коли user пише `/status`, raw output з `tools/console/src/agents/ops.ts` був детермінований markdown. Тепер це prompt → LLM → output, з потенційним дрейфом форматування. **Mitigation:** prompt-и у `COMMAND_PROMPTS` явно вимагають `bullet-list, без зайвих коментарів`; калібрувати перші 7 діб після deploy. Якщо drift > 30% викликів — додати dedicated `formatter` tool, який бере raw JSON і дає шаблонний markdown.
- **Cost per command.** Кожна `/status` тепер коштує 1-2 ¢ Anthropic-токенами проти ~0¢ console-варіанту. Acceptable у $5/добу envelope (≈250-500 викликів/добу), але треба моніторити `openclaw_invocations.cost_usd` після deploy.
- **Dispatcher-команди (`/run`, `/approve`) тимчасово недоступні.** До Phase 4 OpenClaw — write-tools з approval-button. **Mitigation:** founder може попросити OpenClaw "run X" вільним текстом; OpenClaw відповість "це write-action — поза Phase 1 scope, треба ADR".
- **Console-код залишається у репо як dead-weight.** `tools/console/src/agents/`, `tools/console/src/dispatcher/`, `tools/console/src/router*.ts` ~1.2k LOC dormant. **Mitigation:** Sprint 1 видалить, або помітимо `@deprecated` зараз. Не критично у Sprint 0 — менший diff = швидша роль-аут.

### Re-evaluation triggers

- Команда росте до >1 active operator → multi-allowlist + per-user budget OpenClaw і паралельно повертаємо `@sergeant_console_bot` як "team console" (з deterministic команд).
- LLM-format drift на slash-команді > 30% → dedicated formatter tool (як вище).
- Phase 4 OpenClaw landing → `/run`, `/approve`, `/cancel`, `/assign` перебудовуються на approve-button-flow всередині OpenClaw (без console-bot).
- Якщо OpenClaw надійшов > $10/d три тижні поспіль і phasing не дозволяє підняти cap — split metrics-tools у дешевший model (`claude-haiku`) тільки для `/status`-style команд, через окремий agent-handler.

## Alternatives considered

### A. Залишити три боти (status quo, нічого не міняти)

Створити `@sergeant_console_bot` у @BotFather, додати токен на Railway, deploy окремо.

**Чому ні:** founder уже спитав "а чому бот 2 цього не може?" — і chunked нашу архітектуру правильно. Solo-founder не має use-case для двох слухачів-ботів плюс push-бота. Більше surface = більше способів збити state-у. Cost у Railway-slot-ах і у memory-моделі (де коли яка команда) перевищує користь deterministic-формату.

### B. Повне видалення `tools/console/src/agents/` і `dispatcher/` зараз

Спустити Sprint 0 із заодно видаленням 1.2k LOC.

**Чому ні:** raises diff size з ~500 до ~1700 LOC, requires deeper test-coverage rework і збільшує ризик регресій у момент, коли OpenClaw має йти у prod негайно. Краще merge-нути малий PR зараз і прибрати dead-code у Sprint 1 окремим cleanup-PR-ом, де можна спокійно перевіряти що нічого зі shared utility-ів не залежить.

### C. Console як "deterministic command relay" перед OpenClaw

Зробити console proxy: `/status` → структурований API call → форматований Markdown без LLM. Залишити OpenClaw тільки для DM.

**Чому ні:** дублює вартість в обслуговуванні. Той самий `get_stripe_metrics` має бути викликаним з двох code-paths. Тести пишуться двічі. Коли в Phase 2 OpenClaw отримує morning-ritual з тими ж даними — третій code-path. Простіше: один tool, один code-path, один LLM-shape.

### D. OpenClaw як "second brain" + console як "ops surface"

Окремі бота, OpenClaw читає `openclaw_invocations` console-а як дані. Канонічна multi-bot архітектура.

**Чому ні:** працює коли є multi-operator команда. Solo-founder з одного TG-аккаунту шукає не "поділ ролей", а одного співрозмовника. Це повертається на стіл коли тригер re-evaluation спрацює.

## Migration steps

1. ✅ Code: `CONSOLE_BOT_TOKEN` optional, 5 tools ported, 5 routes added, 5 slash-команд додано в OpenClaw.
2. ✅ ADR-0032 (this).
3. ✅ Update `docs/architecture/apps-status-matrix.md`: console row → `Status: dormant (consolidated into OpenClaw, ADR-0032)`.
4. ✅ Update `docs/deploy/console.md`: rename intent to `sergeant-hubchat` deployment, додати ENV-list для нових tool-ів.
5. ✅ Update `docs/launch/tech/openclaw-roadmap.md`: Phase 1 scope включає `/status`, `/metrics`, `/digest`, `/logs`, `/review`.
6. ✅ Update `docs/runbooks/openclaw-runbook.md`: команди + troubleshooting + persona-roadmap.
7. ✅ Update `tools/console/.env.example`: 5 нових tool-ENV (Stripe / Sentry / PostHog / GitHub PAT) як optional.
8. Sprint 1 (окремий PR): видалити `tools/console/src/agents/`, `tools/console/src/dispatcher/`, `tools/console/src/router*.ts` і перейменувати package на `@sergeant/openclaw-bot`.
