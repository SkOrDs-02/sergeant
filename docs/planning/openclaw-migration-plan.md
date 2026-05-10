# OpenClaw Migration Plan: Internal Bot → External OpenClaw Gateway

> **Last validated:** 2026-05-10 by Devin. **Next review:** після Phase 0.5 PoC.
> **Status:** Scaffolded (v3 — team-shape, cost-aware routing, n8n tiers)

## Мета

Замінити внутрішній OpenClaw co-founder бот (ADR-0031, `tools/console/src/openclaw/`) зовнішнім [OpenClaw](https://github.com/openclaw/openclaw) — open-source персональним AI-асистентом (MIT, 370k+ зірок). Це дасть:

- **25+ каналів** (WhatsApp, Telegram, Slack, Discord, Signal, iMessage, тощо) замість лише Telegram
- **Голосовий ввід/вивід** (macOS/iOS/Android)
- **Multi-model підтримка** (не лише Anthropic)
- **Canvas UI** для візуалізації
- **Community plugins** і **ClawHub** реєстр
- **Self-hosted Gateway** з dashboard

---

## Передумови

Переконайся, що ці речі на місці перед початком:

- **Node 24** (або 22.16+) для Gateway
- **OpenClaw версія — pinned stable** (не beta). Перевірити останній stable tag на release-сторінці і зафіксувати його у `packages/openclaw-plugin/package.json` через `peerDependencies` + у Railway service env-конфігу. Renovate-only PR на апгрейди — без auto-merge.
- **Anthropic API key** (або інший provider)
- **Доступ до Sergeant server API** (`/api/internal/openclaw/*`) — endpoint stays internal, plugin звертається через `INTERNAL_API_KEY`.
- **Telegram Bot Token** — використовуємо існуючий бот (тимчасово паралельно з grammy через test-username) або новий test-bot для Phase 0.5 PoC.
- **GitHub App credentials** (`OPENCLAW_GITHUB_APP_ID`, `OPENCLAW_GITHUB_APP_PRIVATE_KEY`, `OPENCLAW_GITHUB_APP_INSTALLATION_ID`) — обов'язково для production-instance Gateway. Hard Rule #20 забороняє `OPENCLAW_GITHUB_PAT` / `Git_PAT` у production; `read_github` і `create_github_issue` tools у плагіні ходять через ту саму server-side прокладку, тож саме server-side вже використовує App-flow — plugin має лише не зберігати PAT-и в Railway env.

---

## Інфраструктура та deploy

- **Хостинг Gateway:** окремий Railway service (`sergeant-openclaw-gateway`) у тому ж проекті, що й `apps/server`. Це мінімізує latency на додатковий hop (intra-Railway мережа) і дозволяє ділити private VPC.
- **Конфігурація:** template `ops/openclaw/openclaw.json` живе у репо (config-as-code), на старті контейнера копіюється у `~/.openclaw/openclaw.json` всередині mounted volume. Persistence: skills, canvas state, WhatsApp/Telegram auth-state — на volume. Перезбірка контейнера auth не вбиває.
- **Що config-as-code (репо, PR-review):** `agents.<persona>.tools` allowlists, persona prompts (SKILL.md), model defaults per persona, n8n tier mapping, shortcut catalog, cheap-router config, budget caps.
- **Що через Railway env:** `ANTHROPIC_API_KEY`, `INTERNAL_API_KEY`, `OPENCLAW_FOUNDER_USER_ID`, `OPENCLAW_FOUNDER_TG_USER_ID`, `SERVER_INTERNAL_URL`, GSC/PSI/SerpAPI ключі (опційні, додаються по мірі готовності).
- **Що через dashboard / CLI один раз:** channel-pairing (Telegram webhook setup, WhatsApp QR), OAuth flows для майбутніх каналів, live-операції (mute channel, restart agent).
- **Secrets:** Railway env, окремий namespace від `apps/server`. Немає `OPENCLAW_GITHUB_PAT` у production — Hard Rule #20.
- **Webhook vs long-poll:** Telegram через webhook на Gateway public URL (Railway exposes HTTPS). Channels-specific config — у `openclaw.json`.
- **Networking:** Gateway → server викликає `https://server.internal:3000/api/internal/openclaw/*` через приватний домен Railway.

---

## Команда персон (10 ролей)

Продукт орієнтується на 10k+ MAU; персональні агенти змодельовані як невелика компанія з phantom-іменами, щоб founder спілкувався з конкретними «людьми», а не з абстрактними slug-ами. Кожна персона має `model_default` + `model_for_thinking` (Haiku / Sonnet / Opus) для cost-aware routing.

| Slug        | Ім'я    | Роль                                                                           | Aliases                           | Tools allowlist (high-level)                                                                                                                                                                                                 | `model_default` | `model_for_thinking` |
| ----------- | ------- | ------------------------------------------------------------------------------ | --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- | -------------------- |
| `cofounder` | Сергій  | CEO / Cofounder — синтез, OKR, executive decisions, опонент-mode               | `/Сергій`, `/cofounder`, `/co`    | full set (read + write всі), record_decision, council                                                                                                                                                                        | Sonnet          | Opus                 |
| `eng`       | Артем   | CTO / Engineering Lead — architecture, code review, PR queue, schema, security | `/Артем`, `/eng`, `/cto`          | read_github, search_code, read_github_tree, read_github_diff, list_open_prs, query_app_db (read-only views), recall_memory, record_decision, create_github_issue (gated)                                                     | Sonnet          | Opus                 |
| `devops`    | Олексій | DevOps / SRE — reliability, incidents, n8n health, deploy                      | `/Олексій`, `/devops`, `/sre`     | read_workflow_logs, list_n8n_workflows, describe_n8n_workflow, trigger_n8n_workflow (Tier A auto / Tier C gated), activate_workflow (gated), pause_workflow (gated), mute_alert (gated), get_sentry_issues, get_server_stats | Haiku           | Sonnet               |
| `pm`        | Олена   | Product Manager — roadmap, JTBD, customer interviews, prioritization           | `/Олена`, `/pm`, `/product`       | read_strategy_docs, get_posthog_stats, query_app_db, recall_memory, record_decision, create_github_issue (gated), commit_to_strategy_doc (gated)                                                                             | Sonnet          | Opus                 |
| `growth`    | Марта   | Growth / Marketing Lead — acquisition, activation, retention, lifecycle        | `/Марта`, `/growth`, `/marketing` | get_posthog_stats, get_stripe_metrics, query_app_db, read_github (releases), recall_memory, post_to_topic (gated)                                                                                                            | Sonnet          | Sonnet               |
| `seo`       | Назар   | SEO Specialist — technical + content SEO, GSC, competitor analysis             | `/Назар`, `/seo`                  | get_search_console_metrics (env-stub), get_lighthouse_score (env-stub), read_competitor_serp (env-stub), read_strategy_docs, read_github (sitemap/robots/meta), get_posthog_stats, recall_memory                             | Sonnet          | Sonnet               |
| `content`   | Софія   | Content / Copywriter — long-form, landing copy, emails, in-app text            | `/Софія`, `/content`, `/copy`     | read_strategy_docs, recall_memory, read_github (read-only), commit_to_strategy_doc (gated, контент-доки), post_to_topic (gated)                                                                                              | Sonnet          | Opus                 |
| `data`      | Ярема   | Data Analyst — cohorts, A/B tests, metrics deep-dive                           | `/Ярема`, `/data`, `/analytics`   | query_app_db (full read-allowlist), get_posthog_stats, get_stripe_metrics, get_server_stats, recall_memory                                                                                                                   | Sonnet          | Sonnet               |
| `cs`        | Ольга   | Customer Success — support, NPS, churn signals, user feedback                  | `/Ольга`, `/cs`, `/support`       | read_telegram_topic_history, query_app_db (support views), get_posthog_stats, recall_memory, post_to_topic (gated)                                                                                                           | Haiku           | Sonnet               |
| `finance`   | Ірина   | Finance — Stripe revenue, refunds, runway, vendor costs                        | `/Ірина`, `/finance`              | get_stripe_metrics, query_app_db (finance views), recall_memory, record_decision                                                                                                                                             | Haiku           | Sonnet               |

**Принципи:**

- Cofounder (Сергій) — єдиний з повним write-set + memory across personas.
- Кожен спеціаліст — read-mostly у своїй смузі + 1-2 write-tools з approval.
- Виклик — явний: `/Ім'я` або `/slug` (`/Артем` ≡ `/eng`). Default — Сергій якщо префікса немає.
- Council (round-table) — будь-яка підмножина персон; `/council Артем Назар Ярема "питання"`.
- Force-think: `/think <питання>` обходить cheap-router і запускає `model_for_thinking` (Opus у більшості випадків).

---

## 3-шарова cost-aware routing

Щоб не палити токенами на рутині, кожне повідомлення проходить трьома шарами фільтрації від найдешевшого до найдорожчого.

| Шар                                        | Хто                                                | Коли спрацьовує                                                                      | Cost / повідомлення                       |
| ------------------------------------------ | -------------------------------------------------- | ------------------------------------------------------------------------------------ | ----------------------------------------- |
| **Layer 0 — Shortcuts** (без LLM)          | Регулярки / slash-команди / pre-LLM hook у плагіні | Точна впізнавана рутина: status checks, digests, refresh, query                      | **$0** (тільки tool execute + cache read) |
| **Layer 1 — Cheap router** (Haiku 3.5)     | Один короткий LLM-call (~200 токенів)              | Природне формулювання → класифікує: routine / thinking / chat                        | **~$0.0002**                              |
| **Layer 2 — Full agent** (Sonnet або Opus) | Повний agent loop з персонами, tools, memory       | Тільки коли Layer 1 каже «thinking», або користувач явно покликав персону / `/think` | **~$0.02–0.50** залежно від задачі        |

**Маршрут message-а:**

1. `llm_input` hook → перевіряє Layer 0 регулярки (точне співпадіння на shortcut → execute, відповідь, exit без LLM).
2. Якщо немає match — Layer 1 cheap-router (Haiku) класифікує: `{ class: "routine_metrics" | "routine_recall" | "routine_remind" | "thinking" | "chat", shortcut?: string, persona?: string }`.
3. Якщо `class` починається з `routine_` — викликаємо відповідний Layer 0 shortcut з parsed params, exit.
4. Якщо `class=thinking` — ескалація до Layer 2 з визначеною персоною. Cofounder за замовч.; cheap-router може запропонувати конкретну (`eng`, `growth`, тощо).
5. Якщо `class=chat` — Haiku сама відповідає коротко (1-2 речення), без tools.

**Cheap-router system prompt** (commited у `ops/openclaw/cheap-router.system.md`):

```text
Класифікуй message українською:
A) routine_metrics — питання про поточні цифри (revenue, signups, PR queue, sentry, status)
B) routine_recall — запит на згадку («що ми вирішили по X», «де я писав про Y»)
C) routine_remind — встановити нагадування / cron
D) thinking — потрібен синтез, decision, planning, code review
E) chat — світська бесіда / уточнення

Output JSON: { "class": "...", "shortcut": "..."|null, "persona": "..."|null, "params": {...}|null }
```

### Каталог Layer 0 shortcut-ів

~17 детермінованих shortcut-ів. Кожен — окремий файл `packages/openclaw-plugin/src/shortcuts/<slug>.ts` з регулярним патерном + canned Mustache template для відповіді.

**Metrics & status (6):**

- `/metrics`, «як справи з метриками», «дай метрики» → Tier A refresh (`63 + 60` паралельно) → read PostHog daily + Stripe today + Sentry top 5 → canned template (опц. Canvas-чарт)
- `/runway` → query app DB + Stripe → «розрахунок runway = X місяців»
- `/status`, «як справи в продукті» → server `/health` + Railway latest deploy + Sentry rate → 3-рядковий статус
- `/sentry` → top 5 unresolved issues last 24h
- `/stripe` → today's revenue + failed payments + refunds
- `/posthog` → today's signups + MAU + key events

**Code & repo (3):**

- `/prs`, «що по PRs» → list open PRs + age + reviewer load
- `/releases` → last 5 GitHub releases
- `/builds` → last 10 Railway deploys + status

**Operations (3):**

- `/workflows` → list n8n workflows + last execution status
- `/refresh_metrics` → fire Tier A (3 workflows паралельно) + чекає 8 сек + читає
- `/heartbeat`, `/health` → ping всіх сервісів

**Memory & decisions (3):**

- `/recall <query>` → semantic search ai_memories → top 5
- `/decisions` → останні 10 record_decision записів
- `/digest day|week` → агрегований daily/weekly summary

**Reminders (1):**

- `/remind <when> <what>` → set_reminder без LLM (parse iso/relative)

**Force-think (1):**

- `/think <питання>` → bypass Layer 0/1, запуск Layer 2 з `model_for_thinking` (Opus) і `persona=cofounder` (або вказана префіксом `/Артем /think ...`).

---

## n8n: 4-tier classification

Замість плоского allowlist на trigger — 4 рівні з різною політикою.

| Tier                 | Що це                                                              | Approval | Коли агент використовує                                                                                |
| -------------------- | ------------------------------------------------------------------ | -------- | ------------------------------------------------------------------------------------------------------ |
| **A — Авто-refresh** | Snapshot-flows, output яких пишеться у нашу БД / cache             | Ні       | Коли потрібна свіжа дата. Fire & forget, потім читаємо з БД.                                           |
| **B — Не тригерити** | Digest-flows, output яких йде у конкретний Telegram topic / push   | n/a      | Агент **не** тригерить (не спамити #metrics). Замість цього сам читає raw sources і відповідає інлайн. |
| **C — З approval**   | Flows які пишуть зовні: push/email/broadcast до users, repo writes | Так      | Завжди approval-gate у Telegram DM.                                                                    |
| **D — Read-only**    | Webhook-driven flows (зовнішні сервіси їх тригерять)               | n/a      | Агент лише читає `executions` через `read_workflow_logs`.                                              |

### Розкладка по 19 active workflow-ах

| ID                 | Workflow                         | Tier | Чому                                              |
| ------------------ | -------------------------------- | ---- | ------------------------------------------------- |
| `OhDtiheODIp5nNLa` | 63 — Growth Acquisition Snapshot | A    | POST /api/internal/growth/acquisition — пише в БД |
| `lIz5LybDxnKKUNC0` | 60 — Growth Funnel Snapshot      | A    | POST /api/internal/growth/funnel — пише в БД      |
| `L2RZPTbR6RwHPoyB` | 99 — Heartbeat (alive check)     | A    | passive ping, no side effect                      |
| `ksN0PfQeKmi9qXOH` | 08 — Weekly Financial Digest     | B    | Telegram topic                                    |
| `gFd41GXrEFdc2hQo` | 16 — PostHog Daily Metrics       | B    | Telegram #metrics                                 |
| `ZPODB5HzEMzYUbEY` | 10 — Debt/Receivable Reminder    | B    | push + Telegram founder                           |
| `MS9GHZNYY1PLN1Qc` | 04 — Daily Backup Verification   | B    | Telegram-only result                              |
| `ar3BpvEEiPs2d5eT` | 19 — DB Health Report            | B    | Telegram #ops                                     |
| `pYq2LySdC2cL96Vi` | 18 — Nightly Security Audit      | B    | Telegram                                          |
| `T8qcO9Ku6o6wHO15` | 17 — GitHub PR Stale Alert       | B    | Telegram                                          |
| `cB3RqHdxka7WyVHH` | 07 — Morning Briefing Push       | C    | broadcast до **всіх** subscribers                 |
| `jRbQVcN0MaNajM4N` | 09 — Habit Streak At-Risk Alert  | C    | push до **користувачів**                          |
| `dZYn9scxQWOKaWeF` | 05 — Renovate PR Auto-Handler    | D    | GitHub webhook                                    |
| `fFMToeZXJLUQUl7l` | 02 — Failed Payment Recovery     | D    | Stripe webhook                                    |
| `b0c7OTo5ATcwqdQL` | 03 — Sentry Alert Routing        | D    | Sentry webhook                                    |
| `CygZ4vLxTm2ltuRW` | 15 — Railway Deployment Notify   | D    | Railway webhook                                   |
| `xdYhQTEARYVOeWcl` | 06 — Mono Webhook Enrichment     | D    | Mono webhook                                      |
| `0KTuLE8meOYjcNDw` | 01 — Billing Pipeline            | D    | Stripe webhook                                    |
| `iC82EFJzqBny9kxI` | 98 — Global Error Handler        | D    | dead-letter                                       |

Конфіг живе у `ops/openclaw/n8n-allowlist.json`:

```json
{
  "OhDtiheODIp5nNLa": {
    "tier": "A",
    "name": "63 — Growth Acquisition Snapshot"
  },
  "lIz5LybDxnKKUNC0": { "tier": "A", "name": "60 — Growth Funnel Snapshot" },
  "L2RZPTbR6RwHPoyB": { "tier": "A", "name": "99 — Heartbeat" },
  "cB3RqHdxka7WyVHH": { "tier": "C", "name": "07 — Morning Briefing Push" },
  "jRbQVcN0MaNajM4N": { "tier": "C", "name": "09 — Habit Streak At-Risk Alert" }
}
```

Tier B/D **не** з'являються у allowlist — їх просто немає у `trigger_n8n_workflow` scope. Зміна tier-у — 1 рядок у конфізі, без релізу плагіну.

---

## Memory schema extension

Isolated per persona, з cofounder-як-superuser:

- Міграція `036-ai-memories-persona-topic.sql`:
  - `ALTER TABLE ai_memories ADD COLUMN persona TEXT NOT NULL DEFAULT 'cofounder';`
  - `ALTER TABLE ai_memories ADD COLUMN topic TEXT;`
  - `CREATE INDEX idx_ai_memories_persona ON ai_memories (founder_user_id, persona);`
  - `CREATE INDEX idx_ai_memories_topic ON ai_memories (founder_user_id, topic);`
- Server-side `recall_memory` `query.persona` параметр:
  - Якщо caller = `cofounder` → читає everything (no filter).
  - Якщо caller = `<specialist>` → `WHERE persona = $caller OR topic = 'shared'`.
- Запис: `record_decision` і memory-write-tool пишуть з `persona = <current>` + inferred `topic`.
- `topic` — вільне поле (наприклад `tacmed-portal`, `finyk-launch`, `sergeant-mvp`, `cross`). Allowlist topics додамо у Phase 2 коли узгодимо проекти.

---

## Heartbeat morning digest

Щоранку 09:00 Kyiv cofounder надсилає zwijowany digest у founder's DM.

Skill `morning-digest` (cron всередині OpenClaw scheduler):

1. Stripe failures за 24h (через `get_stripe_metrics`)
2. Sentry top issues за 24h, severity ≥ warning (через `get_sentry_issues`)
3. PR queue: open PRs > 48h old + reviewer load (через `list_open_prs`)
4. Open decisions без owner (через `decisions/list`)
5. PostHog daily metrics: signups, MAU, key events (через `get_posthog_stats`)
6. n8n executions failed за 24h (через `read_workflow_logs` for each Tier A/B workflow)

**Формат:** коротка зведена відповідь у Telegram DM, з inline-keyboard «деталі по N». Якщо щось «червоне» (Sentry rate spike, Stripe failure spike) — додатково тегує `/Олексій`.

**Cron:** `0 9 * * *` Europe/Kyiv. Тригериться OpenClaw native scheduler-ом, не n8n.

---

## Voice & Canvas

- **Voice (on за замовч.):** OpenClaw native voice. Voice-нотатки з Telegram/WhatsApp → STT → agent. Reply-mode за замовч. text; toggle на voice-reply через `/voice on`.
- **Canvas (on за замовч.):** OpenClaw Canvas. Cofounder/data використовують для inline-чартів (revenue / funnel / Sentry trend) — replies містять structured canvas blocks, які OpenClaw native рендерить у preview.

---

## PR-стратегія

Робота розбита на ~5 PR замість одного великого. Кожен — самостійний, з власним rollback.

| #    | PR / гілка                                | Що включає                                                                                                                                                                            | Залежить від             |
| ---- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| PR-A | `devin/<ts>-openclaw-plan-v2`             | Цей файл — оновлений план (v3: 10 персон, 4-tier n8n, 3-layer routing). Без коду.                                                                                                     | —                        |
| PR-B | `devin/<ts>-openclaw-poc-spike`           | Phase 0.5 PoC: 1 read + 1 write tool, 1 hook, parity-харнес. Гілка не мерджиться у main без зеленої перевірки PoC, але живе у репі для review.                                        | PR-A                     |
| PR-C | `devin/<ts>-openclaw-plugin-readonly`     | Phase 1 (read-only tools, нові code/n8n/SEO/reminders tools, shortcut router + cheap router) + Phase 2 (10 personas як skills + allowlist + model tiers) + Phase 3 (strategic modes). | PR-B                     |
| PR-D | `devin/<ts>-openclaw-plugin-write-tools`  | Phase 4 (approval flow для write-tools, n8n Tier C gates) + Phase 6 (audit/invocation lifecycle hooks).                                                                               | PR-C                     |
| PR-E | `devin/<ts>-openclaw-council-roundtable`  | Phase 5 (council orchestration, multi-persona).                                                                                                                                       | PR-D                     |
| PR-F | `devin/<ts>-openclaw-cutover-and-cleanup` | Phase 6.5 (parallel run + feature flag) → Phase 7 (вимкнення grammy bootstrap, ADR superseded, env cleanup). Grammy код **залишається** у репо як fallback.                           | PR-E + ≥1 тиждень parity |

---

## Архітектура: До і Після

### Зараз (внутрішній OpenClaw)

```
Founder DM (Telegram)
      │
      ▼
tools/console (grammy Bot)
  ├── openclaw/handler.ts        ← slash-команди, message routing
  ├── openclaw/handler-agent-turn.ts  ← Anthropic agent loop
  ├── openclaw/handler-audit.ts  ← write-audit logging
  ├── openclaw/approval-store.ts ← inline-keyboard approve/reject
  ├── agents/openclaw.ts         ← agent loop + tool execution
  ├── agents/personas.ts         ← 5 personas (cofounder/ops/growth/eng/finance)
  └── agents/strategic-modes.ts  ← /plan, /analyze, /okr
      │
      ▼ HTTP
apps/server /api/internal/openclaw/*
  ├── modules/openclaw/tools.ts       ← read-only tools (recall, query, strategy docs, GitHub, etc.)
  ├── modules/openclaw/write-tools.ts ← write tools (commit strategy doc, create issue, etc.)
  ├── modules/openclaw/store.ts       ← PostgreSQL (invocations, decisions, write-audit)
  ├── modules/openclaw/prompts.ts     ← system prompts + tone selector
  └── modules/openclaw/budget.ts      ← daily USD budget
```

### Після (зовнішній OpenClaw Gateway)

```
Founder (Telegram / WhatsApp / …)
      │
      ▼
OpenClaw Gateway (Railway service, port 18789)
  ├── Anthropic / OpenAI / інший provider
  ├── Skills (SKILL.md, 10 personas + system skills)
  │   ├── sergeant-cofounder/    ← Сергій, default persona, full tool-set
  │   ├── sergeant-eng/          ← Артем, code review, PR queue
  │   ├── sergeant-devops/       ← Олексій, reliability, n8n
  │   ├── sergeant-pm/           ← Олена, roadmap, JTBD
  │   ├── sergeant-growth/       ← Марта, acquisition, retention
  │   ├── sergeant-seo/          ← Назар, technical + content SEO
  │   ├── sergeant-content/      ← Софія, copy, emails, landings
  │   ├── sergeant-data/         ← Ярема, cohorts, A/B, metrics
  │   ├── sergeant-cs/           ← Ольга, support, NPS, churn
  │   ├── sergeant-finance/      ← Ірина, Stripe, runway, refunds
  │   ├── morning-digest/        ← cron-skill, 09:00 Kyiv
  │   └── council-roundtable/    ← multi-persona orchestrator
  └── Plugin: @sergeant/openclaw-plugin
      ├── shortcut-router.ts                         ← Layer 0: regex/slash-команди
      ├── cheap-router.ts                            ← Layer 1: Haiku класифікація
      ├── registerTool("recall_memory")
      ├── registerTool("read_strategy_docs")
      ├── registerTool("query_app_db")
      ├── registerTool("read_github")
      ├── registerTool("search_code")                ← НОВА: GitHub Search API
      ├── registerTool("read_github_tree")           ← НОВА: листинг каталогу
      ├── registerTool("read_github_diff")           ← НОВА: PR diff
      ├── registerTool("list_open_prs")              ← НОВА: PR queue
      ├── registerTool("get_stripe_metrics")
      ├── registerTool("get_sentry_issues")
      ├── registerTool("get_posthog_stats")
      ├── registerTool("read_workflow_logs")
      ├── registerTool("list_n8n_workflows")         ← НОВА: список з tier-mapping
      ├── registerTool("describe_n8n_workflow")      ← НОВА: trigger node + last execs
      ├── registerTool("get_server_stats")
      ├── registerTool("get_github_releases")
      ├── registerTool("read_telegram_topic_history")
      ├── registerTool("get_search_console_metrics") ← НОВА (env-stub, GSC)
      ├── registerTool("get_lighthouse_score")       ← НОВА (env-stub, PSI)
      ├── registerTool("read_competitor_serp")       ← НОВА (env-stub, SerpAPI)
      ├── registerTool("record_decision")
      ├── registerTool("set_reminder")               ← НОВА: openclaw_reminders + n8n cron-poller
      ├── registerTool("refresh_business_snapshot")  ← НОВА meta: fire Tier A workflows паралельно
      ├── registerTool("commit_to_strategy_doc")     ← gated, optional:true
      ├── registerTool("create_github_issue")         ← gated, optional:true
      ├── registerTool("post_to_topic")               ← gated, optional:true
      ├── registerTool("pause_workflow")              ← gated, optional:true
      ├── registerTool("activate_workflow")           ← НОВА, gated, optional:true
      ├── registerTool("trigger_n8n_workflow")        ← НОВА: Tier A auto / Tier C gated (per allowlist)
      ├── registerTool("mute_alert")                  ← gated, optional:true
      ├── registerHook("llm_input")                   ← budget + shortcut/cheap router + invocation/open
      ├── registerHook("tool_call_pre")               ← write-tool approval gate + Tier C n8n gate
      ├── registerHook("tool_call_post")              ← write-audit log
      └── registerHook("agent_turn_end")              ← invocation/finalize + cost rollup
      │
      ▼ HTTP (той самий контракт)
apps/server /api/internal/openclaw/*
  └── (без змін — server API залишається як є)
```

**Ключовий принцип:** Server API (`apps/server/src/routes/internal/openclaw.ts` + `modules/openclaw/`) **не змінюється**. Це backend з tools, budget, audit, allowlists. Ми міняємо лише **frontend** — замість grammy бота підключаємо OpenClaw Gateway.

---

## Інвентаризація: що є зараз

### Env змінні (tools/console)

| Змінна                               | Опис                                         | Що робити                                                                                                       |
| ------------------------------------ | -------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `OPENCLAW_BOT_TOKEN`                 | Telegram Bot API token                       | Замінюється на OpenClaw Telegram channel config                                                                 |
| `OPENCLAW_FOUNDER_USER_ID`           | Better Auth user ID                          | Переноситься в plugin config                                                                                    |
| `OPENCLAW_FOUNDER_TG_USER_ID`        | Telegram user ID для allowlist               | Замінюється на OpenClaw DM pairing policy                                                                       |
| `OPENCLAW_MAX_ITERATIONS`            | Agent loop iteration cap                     | Переноситься в skill/config                                                                                     |
| `OPENCLAW_RATE_LIMIT_PER_MIN`        | Rate limiter                                 | OpenClaw має вбудований rate limiting                                                                           |
| `OPENCLAW_MAX_PER_CALL_USD`          | Per-call USD cap                             | Переноситься в plugin config + enforced через `llm_input` hook (server-side `/budget` лишається authoritative). |
| `OPENCLAW_COUNCIL_USD_BUDGET`        | Council session headroom                     | Переноситься в plugin config (council-skill)                                                                    |
| `OPENCLAW_USE_WEBHOOK`               | Webhook vs long-poll                         | Не потрібен — OpenClaw сам handles delivery                                                                     |
| `OPENCLAW_WEBHOOK_URL`               | Webhook endpoint                             | Не потрібен                                                                                                     |
| `OPENCLAW_WEBHOOK_SECRET`            | Webhook secret                               | Не потрібен                                                                                                     |
| `OPENCLAW_WEBHOOK_PATH`              | Webhook path                                 | Не потрібен                                                                                                     |
| `OPENCLAW_WEBHOOK_PORT`              | Webhook port                                 | Не потрібен                                                                                                     |
| `OPENCLAW_AGENT_STATUS_CALLBACK_URL` | Status callback                              | Переноситься в plugin hook                                                                                      |
| `SERVER_INTERNAL_URL`                | Sergeant server URL                          | Переноситься в plugin config                                                                                    |
| `INTERNAL_API_KEY`                   | Internal API auth                            | Переноситься в plugin config                                                                                    |
| `ANTHROPIC_API_KEY`                  | Anthropic API key                            | Переноситься в OpenClaw model config                                                                            |
| `OPENCLAW_GATEWAY_ENABLED`           | **Новий feature flag** для Phase 6.5         | `false` за замовч., `true` вмикає Gateway-routing у grammy bootstrap                                            |
| `OPENCLAW_CHEAP_MODEL`               | **Новий:** Layer 1 router model              | `claude-3-5-haiku-latest` за замовч.                                                                            |
| `N8N_API_URL`                        | **Новий:** n8n REST API endpoint             | Напр. `https://n8n-production-09ac.up.railway.app/api/v1`                                                       |
| `N8N_API_KEY`                        | **Новий:** n8n API token                     | Для `list_n8n_workflows`/`describe_n8n_workflow`/`trigger_n8n_workflow`/`activate_workflow`                     |
| `GSC_SERVICE_ACCOUNT_KEY`            | **Новий (opt-in):** Google Search Console SA | `seo` persona env-stub; якщо не задано — tool повертає `{ status: 'not_configured' }`                           |
| `GSC_PROPERTY_URL`                   | **Новий (opt-in):** GSC property URL         | Парний до `GSC_SERVICE_ACCOUNT_KEY`                                                                             |
| `PSI_API_KEY`                        | **Новий (opt-in):** PageSpeed Insights       | `get_lighthouse_score` env-stub                                                                                 |
| `SERP_API_KEY`                       | **Новий (opt-in):** SerpAPI / Ahrefs         | `read_competitor_serp` env-stub                                                                                 |
| `MORNING_DIGEST_CRON`                | **Новий:** override cron для heartbeat       | `0 9 * * *` Europe/Kyiv за замовч.; вимкнення = порожнє рядкове значення                                        |

### DB таблиці (apps/server — залишаються)

| Таблиця                                | Міграція   | Опис                                                           |
| -------------------------------------- | ---------- | -------------------------------------------------------------- |
| `openclaw_invocations`                 | 028        | Audit log усіх викликів (trigger, tool_calls, cost, status)    |
| `openclaw_decisions`                   | 028        | Decision log (topic, context, decision, rationale, git_pr_url) |
| `openclaw_write_audit`                 | 030        | Write-tool approve/executed/rejected transitions               |
| `ai_memories` (source='cofounder')     | 028        | Cofounder memory namespace                                     |
| `ai_memories.persona` (новий стовпець) | 036 (нова) | Cross-persona isolation: cofounder=all, інші=self∨shared       |
| `ai_memories.topic` (новий стовпець)   | 036 (нова) | Groupings: tacmed-portal / finyk-launch / sergeant-mvp / cross |
| `openclaw_reminders` (нова)            | 037 (нова) | `set_reminder` запис: due_at, channel, message, status         |

**Всі існуючі таблиці залишаються** — plugin буде ходити в ті самі server endpoints. Дві нові міграції (036, 037) додаються у Phase 1.

### Server API endpoints (залишаються без змін)

**Read-only tools:**

- `POST /api/internal/openclaw/recall` — recall cofounder memory
- `POST /api/internal/openclaw/strategy` — read strategy docs
- `POST /api/internal/openclaw/query` — query app DB (allowlisted tables)
- `POST /api/internal/openclaw/github` — read GitHub (files, issues, PRs)
- `POST /api/internal/openclaw/workflow` — n8n workflow logs
- `POST /api/internal/openclaw/telegram` — Telegram topic history
- `POST /api/internal/openclaw/metrics/stripe` — Stripe metrics
- `POST /api/internal/openclaw/metrics/sentry` — Sentry issues
- `POST /api/internal/openclaw/metrics/server` — server stats
- `POST /api/internal/openclaw/metrics/posthog` — PostHog stats
- `POST /api/internal/openclaw/github/releases` — GitHub releases
- `POST /api/internal/openclaw/decision` — record decision
- `POST /api/internal/openclaw/decisions/list` — list decisions

**Write tools (gated):**

- `POST /api/internal/openclaw/write/strategy-doc` — commit strategy doc PR
- `POST /api/internal/openclaw/write/github-issue` — create GitHub issue
- `POST /api/internal/openclaw/write/post-to-topic` — post to Telegram topic
- `POST /api/internal/openclaw/write/pause-workflow` — pause n8n workflow
- `POST /api/internal/openclaw/write/mute-alert` — mute Sentry alert

**Budget & Audit:**

- `POST /api/internal/openclaw/budget` — check daily budget
- `POST /api/internal/openclaw/invocations/open` — open invocation
- `POST /api/internal/openclaw/invocations/finalize` — finalize invocation
- `POST /api/internal/openclaw/invocations/list` — list invocations
- `POST /api/internal/openclaw/write-audit/log` — log write-audit event
- `POST /api/internal/openclaw/write-audit/list` — list write-audit events

### Console-side код (що **відключаємо**, не видаляємо)

| Шлях                                          | Файли             | Опис                                                                              |
| --------------------------------------------- | ----------------- | --------------------------------------------------------------------------------- |
| `tools/console/src/openclaw/`                 | 16 файлів (\*.ts) | Handler, session, approval, audit, security, bootstrap, webhook, commands, policy |
| `tools/console/src/agents/openclaw.ts`        | 1                 | Agent loop + tool execution                                                       |
| `tools/console/src/agents/personas.ts`        | 1                 | 5 personas + tool filters                                                         |
| `tools/console/src/agents/strategic-modes.ts` | 1                 | /plan, /analyze, /okr modes                                                       |
| `tools/console/src/agents/dispatcher.ts`      | 1                 | Agent network delegation                                                          |
| `tools/console/src/index.ts`                  | часткове          | OpenClaw bootstrap code                                                           |

**Стратегія:** ~20 файлів + ~30 тестів **залишаються в репо як fallback** після cutover. У Phase 7 ми лише вимикаємо bootstrap (через `OPENCLAW_GATEWAY_ENABLED=true` + `OPENCLAW_BOT_TOKEN` unset на console deploy) і помічаємо ADR як superseded. Видалення коду — окрема ініціатива не раніше ніж через 4 тижні стабільної роботи Gateway, окремим PR з власним rollback-планом.

---

## Phases міграції

### Phase 0: Підготовка (1 день)

1. **Підняти OpenClaw Gateway** як Railway service:
   - `Dockerfile` з pinned stable OpenClaw version
   - Persistent volume на `/root/.openclaw`
   - Healthcheck на `:18789/healthz`
2. **Підключити Telegram канал** — test-bot з власним username, **не** production `@sergeant_cofounder`. Production-бот пейримо лише в Phase 6.5.
3. **Переконатися**, що Gateway стартує, відповідає на DM, і Telegram channel працює.
4. **Зберегти конфігурацію** у Railway-env + `~/.openclaw/openclaw.json` (через volume).

### Phase 0.5: Spike PoC (1–2 дні)

**Мета:** до планування Phase 1 переконатися, що critical-path рішення дійсно лягають на OpenClaw Plugin SDK. Без цього оцінки нижче — спекуляція.

PoC plugin реєструє:

- 1 read tool (`recall_memory`) — перевіряє HTTP-клієнт + типи + serialization tool result.
- 1 write tool (`create_github_issue`) — перевіряє approval flow (native OpenClaw `requiresConfirmation` АБО custom `tool_call_pre` hook). **Це development gate**: якщо native не годиться — фіксуємо custom hook як baseline для Phase 4 і коригуємо estimate.
- 1 hook `llm_input` — перевіряє, що `/budget` cap працює і блокує LLM-call коли budget вичерпано.
- 1 hook `agent_turn_end` — перевіряє, що `invocation_id` корелює з OpenClaw `agent_run_id` для audit.
- Parity-харнес — мінімум 3 golden conversations, прогнані на старому grammy bot і новому plugin: tool-calls, cost, response shape мають збігатися (з толерантністю на формулювання).

**Вихід Phase 0.5:** короткий note `docs/notes/spikes/openclaw-poc.md` з висновками + go/no-go для Phase 1. Якщо критичні gap-и — оновлюємо план перед стартом Phase 1.

### Phase 1: Sergeant Tools Plugin (9–12 днів)

Створити TypeScript plugin `@sergeant/openclaw-plugin`, який реєструє всі Sergeant tools через `api.registerTool(...)`, включає shortcut router (Layer 0) + cheap router (Layer 1) + 4 нові code-understanding tools + n8n delegation tools + SEO env-stubs + reminders + refresh-helper.

**Нові server endpoints (додаємо у Phase 1):**

- `POST /api/internal/openclaw/github/search` — GitHub code search
- `POST /api/internal/openclaw/github/tree` — listing
- `POST /api/internal/openclaw/github/diff` — PR diff
- `POST /api/internal/openclaw/github/prs` — PR queue + age + reviewer load
- `POST /api/internal/openclaw/n8n/list` — list active workflows + tier mapping
- `POST /api/internal/openclaw/n8n/describe` — trigger node + last 5 executions
- `POST /api/internal/openclaw/n8n/trigger` — fire workflow (tier-aware approval)
- `POST /api/internal/openclaw/n8n/activate` — activate (gated)
- `POST /api/internal/openclaw/seo/gsc` — GSC metrics (env-stub)
- `POST /api/internal/openclaw/seo/lighthouse` — PSI score (env-stub)
- `POST /api/internal/openclaw/seo/serp` — competitor SERP (env-stub)
- `POST /api/internal/openclaw/reminders/set` — schedule reminder
- `POST /api/internal/openclaw/reminders/list-due` — cron-poller endpoint
- `POST /api/internal/openclaw/snapshot/refresh` — fire Tier A workflows паралельно

Всі нові endpoints — за `INTERNAL_API_KEY`, audit-logged у `openclaw_invocations`, budget-aware через `/budget`.

**Розкладка зусиль Phase 1 (9–12 днів):**

| Блок                                                                                                           | Оцінка     |
| -------------------------------------------------------------------------------------------------------------- | ---------- |
| 13 existing read-only tools (HTTP прокладка)                                                                   | 3–4 дні    |
| 4 code-understanding tools (search_code, read_github_tree, read_github_diff, list_open_prs) + server endpoints | 1.5–2 дні  |
| 4 n8n delegation tools + tier-aware approval logic + allowlist enforcement                                     | 1.5–2 дні  |
| 3 SEO env-stub tools + endpoints з graceful fallback                                                           | 0.5–1 день |
| `set_reminder` + міграція 037 + n8n cron-poller                                                                | 0.5 дня    |
| `refresh_business_snapshot` meta-tool                                                                          | 0.3 дня    |
| Shortcut router + 17 shortcuts + canned templates                                                              | 1.5–2 дні  |
| Cheap router (Haiku) + JSON schema classifier + integration tests                                              | 0.5–1 день |
| Plugin governance (CODEOWNERS, turbo, ESLint, tests)                                                           | 0.5 дня    |

**Структура:**

```
packages/openclaw-plugin/
├── package.json
├── openclaw.plugin.json
├── tsconfig.json
├── src/
│   ├── index.ts           ← definePluginEntry + registerTool/registerHook calls
│   ├── shortcut-router.ts ← Layer 0: regex патерни + slash-команди + Mustache templates
│   ├── cheap-router.ts    ← Layer 1: Haiku-call з JSON schema classifier
│   ├── shortcuts/         ← ~17 файлів, кожен — один shortcut
│   ├── canned-templates/  ← Mustache .md темплейти відповідей
│   ├── config.ts          ← plugin config schema (serverUrl, apiKey, founderUserId, perCallUsdCap)
│   ├── http-client.ts     ← thin HTTP wrapper for /api/internal/openclaw/*
│   ├── budget.ts          ← shared budget gate, used by llm_input hook
│   ├── audit.ts           ← invocation lifecycle helpers
│   ├── tools/
│   │   ├── recall-memory.ts
│   │   ├── read-strategy-docs.ts
│   │   ├── query-app-db.ts
│   │   ├── read-github.ts
│   │   ├── get-stripe-metrics.ts
│   │   ├── get-sentry-issues.ts
│   │   ├── get-posthog-stats.ts
│   │   ├── read-workflow-logs.ts
│   │   ├── get-server-stats.ts
│   │   ├── get-github-releases.ts
│   │   ├── read-telegram-topic.ts
│   │   └── record-decision.ts
│   └── write-tools/
│       ├── commit-strategy-doc.ts
│       ├── create-github-issue.ts
│       ├── post-to-topic.ts
│       ├── pause-workflow.ts
│       └── mute-alert.ts
└── skills/
    └── sergeant-cofounder/
        └── SKILL.md        ← shipped skill with plugin
```

**Кожен tool — thin HTTP proxy:**

```typescript
// Приклад: recall-memory.ts
api.registerTool({
  name: "recall_memory",
  description: "Recall cofounder memory from Sergeant AI memory store",
  parameters: Type.Object({
    query: Type.String({ description: "Semantic search query" }),
    topK: Type.Optional(
      Type.Number({ description: "Max results (default 5)" }),
    ),
  }),
  async execute(_id, params) {
    const res = await httpClient.post("/api/internal/openclaw/recall", {
      founderUserId: config.founderUserId,
      query: params.query,
      topK: params.topK,
    });
    return { content: [{ type: "text", text: JSON.stringify(res.data) }] };
  },
});
```

**Workspace package governance** — без цього CI не зелений:

- Додати `packages/openclaw-plugin/**` до `CODEOWNERS` (Owner: `@Skords-01`, Secondary: `TBD (backend-engineer)`); `pnpm lint:codeowners` валідовує.
- Підключити до `turbo.json` pipeline (build/test/typecheck/lint).
- Додати ESLint/TypeScript конфіги через shared presets (`@sergeant/eslint-config`, base tsconfig).
- Hard Rule #18 (max-lines: 600) діє на TS файли — кожен tool у власному файлі.
- Якщо bundling — врахувати у `size-limit` (швидше за все плагін не bundled, бо завантажується в Node-runtime Gateway, тож skip).

### Phase 2: Personas як Skills + tool allowlist + model tiers (2–3 дні)

Перенести 10 персон з іменами як окремі OpenClaw skills + жорсткий allowlist на рівні agent config + per-persona model tier.

```
ops/openclaw/skills/                    ← живе в репо (config-as-code)
├── sergeant-cofounder/SKILL.md   ← Сергій, default, повний tool-set
├── sergeant-eng/SKILL.md         ← Артем, code/PR queue
├── sergeant-devops/SKILL.md      ← Олексій, reliability
├── sergeant-pm/SKILL.md          ← Олена, roadmap/JTBD
├── sergeant-growth/SKILL.md      ← Марта, acquisition
├── sergeant-seo/SKILL.md         ← Назар, SEO
├── sergeant-content/SKILL.md     ← Софія, copy
├── sergeant-data/SKILL.md        ← Ярема, analytics
├── sergeant-cs/SKILL.md          ← Ольга, support
└── sergeant-finance/SKILL.md     ← Ірина, finance
```

На старті Gateway container копіює це у `~/.openclaw/workspace/skills/`.

**Важливо:** SKILL.md — це prompt, він **не** enforcement. LLM може проігнорувати фразу «використовуй ТІЛЬКИ ці tools». Tool restriction робиться через:

- Реєстрація write-tools з `{ optional: true }` — тоді вони не доступні без явного allowlist.
- Per-agent (per-skill) `tools` allowlist у `openclaw.json` → `agents.<persona>.tools`.
- `cofounder` — full set; `ops/growth/eng/finance` — обмежений підсет (як у `tools/console/src/agents/personas.ts`).

**Приклад `sergeant-ops/SKILL.md`:**

```markdown
---
name: sergeant-ops
description: Sergeant Ops persona — reliability, incidents, n8n health, deployment stability.
---

# Sergeant Ops Persona

PERSONA: ops-engineer. Reliability, incidents, n8n health, deployment
stability. Ти аналізуєш Sentry, Stripe failures, server /healthz і n8n
execution traces. Reply у тоні reliability eng (короткі recommendations,
приоритезація severity, action items).

## Доступні tools

Використовуй ТІЛЬКИ ці tools:

- read_workflow_logs
- get_sentry_issues
- get_server_stats
- get_stripe_metrics
- recall_memory
- pause_workflow (потребує approval)
- mute_alert (потребує approval)
- post_to_topic (потребує approval)

Якщо питання — про strategy або growth — м'яко скажи, що це поза
твоєю смугою, і запропонуй переключитись на sergeant-growth або
sergeant-cofounder.
```

### Phase 3: Strategic Modes (1 день)

Перенести `/plan`, `/analyze`, `/okr` як:

- **Skills** з structured-thinking primers
- **Або** custom slash-commands через OpenClaw command system

Primers з `strategic-modes.ts` стають частиною відповідного SKILL.md.

### Phase 4: Approval Flow для Write-Tools (3–5 днів)

Найскладніша частина. Внутрішній OpenClaw мав inline-keyboard approve/reject у Telegram. Дизайн фіксується у Phase 0.5 PoC; нижче — варіанти, з яких PoC обере один.

**Варіант A: OpenClaw native gated tools.**
OpenClaw має вбудований механізм approval (перевірити у PoC чи підтримується inline-keyboard у Telegram channel + persistence декларації approval).

**Варіант B: Custom approval через `tool_call_pre` hook.**
Plugin реєструє `tool_call_pre` hook, який:

1. Перехоплює write-tool call
2. Надсилає повідомлення founder-у з describe tool + input (через `api.services.messaging`)
3. Чекає на confirmation (callback або reply)
4. Виконує або відхиляє
5. Логує `approved/rejected/executed` через `/api/internal/openclaw/write-audit/log`

**Варіант C: Hybrid** — native approval + custom audit hook.

**Рекомендація:** PoC у Phase 0.5 фіксує конкретний варіант перед оцінкою. Якщо native (A) — 2-3 дні; custom (B) — 4-5 днів.

### Phase 5: Council Round-Table (3–4 дні)

`/council` запускав sequential personas (ops → growth → eng → finance → cofounder synthesis). Реалізація:

**Варіант A: Multi-agent orchestration.**
OpenClaw підтримує multi-agent setups. Кожна persona — окремий agent. Створити orchestrator-skill, який послідовно викликає кожного.

**Варіант B: Single-agent з tool.**
Один agent з custom `council_roundtable` tool, який послідовно змінює persona context і збирає відповіді.

**Council budget cap** (`OPENCLAW_COUNCIL_USD_BUDGET`) — окрема перевірка перед запуском, через `/budget` endpoint з `kind: "council"`.

### Phase 6: Audit, Invocation Tracking & Observability (1–2 дні)

Зберегти audit logging через ті самі server endpoints + додати observability instrumentation:

- Plugin lifecycle hooks: на `agent_turn_start` → `POST /invocations/open` (зберегти `agent_run_id` ↔ `invocation_id` мапу).
- На `agent_turn_end` → `POST /invocations/finalize` з cost rollup.
- На `tool_call_post` (write-tools) → `POST /write-audit/log` з approve/reject/executed transition.
- **Sentry:** обернути `execute()` кожного tool у `Sentry.startSpan`, помістити `agent_run_id` у `tags`. Errors з tool execute → `Sentry.captureException` з `extra: { tool, params }`.
- **PostHog:** capture `openclaw_tool_invoked`, `openclaw_write_approved`, `openclaw_council_started` events з `distinct_id = founderUserId`.

### Phase 6.5: Parallel Run + Feature Flag (мінімум 1 тиждень)

Не cutover до Phase 7 поки немає parity-доказу.

1. Додати feature flag `OPENCLAW_GATEWAY_ENABLED` (env у `tools/console`).
2. Коли `false` (default) — bootstrap піднімає grammy bot як зараз.
3. Коли `true` — bootstrap **не** реєструє Telegram webhook на grammy; production-бот пейриться у Gateway.
4. Дозволяємо паралельно: grammy на test-username, Gateway на production-username (чи навпаки), founder перевіряє реальні взаємодії.
5. Метрики, що моніторимо щодня:
   - кількість invocations у Gateway vs grammy за добу
   - p50/p95 latency tool execute
   - cost rollup
   - кількість approved/rejected write-tools
   - Sentry error rate
6. **Gate to Phase 7:** ≥7 днів без regressions, всі 5 personas exercised, ≥3 successful write-tool approval цикли, council запущено хоча б раз.

### Phase 7: Cutover та Cleanup (1–2 дні)

**Що робимо:**

1. Виставити `OPENCLAW_GATEWAY_ENABLED=true` на production console deploy (Railway).
2. **Не видаляти** код — `tools/console/src/openclaw/` і `tools/console/src/agents/{openclaw,personas,strategic-modes,dispatcher}.ts` залишаються в репо. Bootstrap у `index.ts` обмортує їхню реєстрацію через flag.
3. Прибрати з Railway env-конфігу `OPENCLAW_BOT_TOKEN` (тимчасово невикористовуваний; зберігається у secret manager на випадок rollback).
4. **Документація:**
   - `AGENTS.md` — додати посилання на новий `packages/openclaw-plugin/AGENTS.md` (якщо створимо), оновити Module ownership map.
   - ADR-0031 (`docs/adr/0031-openclaw-v0-telegram-cofounder.md`) → Status: Superseded by ADR-XXXX.
   - ADR-0036 (`docs/adr/0036-openclaw-write-tools-with-approval.md`) → Status: Superseded.
   - ADR-0037 (`docs/adr/0037-openclaw-write-audit-persistence.md`) — лишається Active (server-side).
   - ADR-0041 (`docs/adr/0041-openclaw-telegram-webhook.md`) → Status: Superseded.
   - Новий ADR `docs/adr/00XX-openclaw-external-gateway.md` — фіксує кінцеву архітектуру.
   - Hard Rule #20 — оновити «Why» секцію, що Gateway теж не зберігає PAT-и.
   - `docs/launch/tech/openclaw-roadmap.md` — позначити завершені віхи.
   - `docs/playbooks/rotate-openclaw-credentials.md` — оновити список secrets.
5. **Залишається без змін:**
   - `apps/server/src/modules/openclaw/` — server API
   - `apps/server/src/routes/internal/openclaw.ts` — endpoints
   - DB таблиці — дані
   - Міграції — immutable
   - Hard Rule #20 enforcement — `assertStartupEnv()`
   - **Grammy fallback** — код у `tools/console/src/openclaw/` та `agents/`

### Phase 8: Додаткові канали (in-scope: WhatsApp; решта — за бажанням)

Після стабілізації Telegram у Phase 6.5/7 — підключити WhatsApp як підтверджений in-scope канал, плюс опційні.

**WhatsApp (1–2 дні):**

- Виділена WhatsApp business-лінія (друга SIM/eSIM/препейд) — рекомендований two-phone setup з документації OpenClaw.
- Pairing через QR (`openclaw channels login` всередині Railway shell або одноразовий локальний пейринг з ре-аплоадом auth.json до volume).
- `channels.whatsapp.allowFrom` — лише founder's number.
- Tone selector у persona prompts враховує медіум (короткі WhatsApp DM-style replies).

**Опційні канали (поза цим планом, окремі ініціативи):**

- Slack (Bolt workspace app + OAuth)
- Discord (server + DMs + bot intents)
- Signal
- iMessage (macOS only)

Для кожного — окремий micro-ADR з security review (allowlist, identity mapping → `founderUserId`, rate limits per channel). «Просто конфіг» — це лише після того, як identity-pipeline для каналу готовий.

---

## Per-call USD cap і budget enforcement

- **Source of truth:** server-side `apps/server/src/modules/openclaw/budget.ts` + `POST /api/internal/openclaw/budget`. Не дублюємо логіку у плагіні.
- **Plugin** перевіряє budget у `llm_input` hook (перед кожним LLM-call) і у `tool_call_pre` (перед write-tool, якщо підвищує cost).
- Якщо `/budget` повертає `{ allowed: false, reason }` — plugin перериває turn з користувацьким message-ом (через `api.services.messaging.send`), пише `invocation finalize` зі `status: "budget_exceeded"`.
- `OPENCLAW_MAX_PER_CALL_USD` зберігається як plugin config; перевірка локальна (швидко, без HTTP) на оцінку cost перед `model.complete`.
- `OPENCLAW_COUNCIL_USD_BUDGET` — Phase 5 council orchestrator перевіряє через `/budget` з `kind: "council"`.

---

## GitHub App credentials у production

- Hard Rule #20 забороняє `OPENCLAW_GITHUB_PAT` і `Git_PAT` у production. `assertStartupEnv()` блокує запуск `apps/server`, якщо ці змінні присутні.
- `read_github` і `create_github_issue` tools у плагіні **не** ходять у GitHub напряму. Вони викликають `POST /api/internal/openclaw/github` і `POST /api/internal/openclaw/write/github-issue`, де server-side вже використовує GitHub App-flow (`OPENCLAW_GITHUB_APP_ID` + `_PRIVATE_KEY` + `_INSTALLATION_ID`).
- Railway service `sergeant-openclaw-gateway` **не повинен** мати у env жодного з `OPENCLAW_GITHUB_PAT`/`Git_PAT`/`GITHUB_TOKEN`. Це закріплюється у `docs/playbooks/rotate-openclaw-credentials.md` як обов'язковий чек.
- Smoke-тест у Phase 0 / 0.5: спроба викликати `read_github` з Gateway → має пройти (через server) без жодного PAT-у в Gateway env.

---

## Workspace package governance

Новий `packages/openclaw-plugin/`:

- **CODEOWNERS:** `packages/openclaw-plugin/ @Skords-01` + secondary placeholder (TBD backend-engineer). Без цього `pnpm lint:codeowners` падає.
- **Module ownership map** (`docs/architecture/module-ownership.md` + AGENTS.md) — додати рядок про новий пакет.
- **Turbo pipeline:** build/test/typecheck/lint підключений через `turbo.json` (workspace pattern matching).
- **ESLint:** використовує shared `eslint.config.mjs` через extends.
- **TypeScript:** окремий `tsconfig.json`, що extends-ить root config; `noUncheckedIndexedAccess: true` (Hard Rule #19).
- **Pre-commit:** lint-staged ESLint/Prettier + staged-typecheck покриває новий шлях автоматично.
- **Tests:** Vitest, тести `*.test.ts` поряд з кодом.
- **`pnpm lint:plugins`** (новий?) — якщо ні, додаємо у Phase 1, що валідовує `openclaw.plugin.json` schema.

---

## Оцінка зусиль

| Phase                       | Опис                                                                                                                                            | Оцінка          |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | --------------- |
| 0                           | Підготовка + встановлення Gateway на Railway                                                                                                    | 1 день          |
| 0.5                         | Spike PoC (approval + budget + audit + parity-харнес)                                                                                           | 1–2 дні         |
| 1                           | Sergeant Tools Plugin (13 existing + 4 code + 4 n8n + 3 SEO + reminders + refresh-helper + shortcut router + cheap router + hooks + governance) | 9–12 днів       |
| 2                           | 10 Personas як Skills + agent allowlist + model tiers                                                                                           | 2–3 дні         |
| 3                           | Strategic Modes + heartbeat (morning digest skill)                                                                                              | 1–2 дні         |
| 4                           | Approval Flow (variant locked у 0.5) + n8n Tier C gates + memory schema migrations (036/037)                                                    | 3–5 днів        |
| 5                           | Council Round-Table (multi-persona, 10 ролей)                                                                                                   | 3–4 дні         |
| 6                           | Audit + Sentry/PostHog instrumentation + Layer 0/1 routing telemetry                                                                            | 1–2 дні         |
| 6.5                         | Parallel run + feature flag (calendar wait)                                                                                                     | ≥7 днів         |
| 7                           | Cutover (вимкнення grammy, ADR superseded, env cleanup)                                                                                         | 1–2 дні         |
| 8                           | WhatsApp channel                                                                                                                                | 1–2 дні         |
| **Загалом (engineering)**   |                                                                                                                                                 | **~26–36 днів** |
| **Загалом з parity-window** |                                                                                                                                                 | **~33–43 днів** |

**Обгрунтування наросту vs v2 (+8 днів):**

- +2-3 дні у Phase 1: 4 code-understanding tools, 4 n8n tools, 3 SEO env-stubs, reminders, refresh-helper.
- +2 дні у Phase 1: shortcut router (17 shortcuts) + canned templates.
- +1 день у Phase 1: cheap router + Haiku integration tests.
- +1–2 дні у Phase 2: з 5 до 10 personas (+ model tiers config).
- +1 день у Phase 3: morning-digest cron skill.
- +0.5 дня у Phase 4: n8n Tier C approval logic + 2 нові міграції (036/037).
- +0.5 дня у Phase 5: 10 персон взаємодія, тест sequencing.

---

## Ризики та мітигація

| Ризик                                                                                                | Імовірність                                                 | Мітигація                                                                                                                                                                                      |
| ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| OpenClaw approval flow недостатній для наших потреб                                                  | Середня                                                     | Phase 0.5 PoC фіксує варіант (native vs custom hook) до старту Phase 1; Варіант B як fallback.                                                                                                 |
| Breaking changes у OpenClaw API                                                                      | **Середня-Висока** (141 реліз за ~6 місяців, активний beta) | Pin exact stable version у `package.json` + Railway lock; CI smoke-test plugin проти pinned SDK; renovate-only PR на апгрейди без auto-merge; інтеграційний тест-харнес з PoC переїжджає у CI. |
| Latency збільшується (додатковий hop через Gateway)                                                  | Низька                                                      | Gateway на Railway у тому ж проєкті, що й server (intra-VPC). Phase 6.5 фіксує p95 baseline.                                                                                                   |
| Council orchestration складна в multi-agent                                                          | Середня                                                     | Fallback на single-agent + tool підхід; PoC можна провалідувати у Phase 0.5 (опційно).                                                                                                         |
| Втрата edge cases з approval-store                                                                   | Середня                                                     | Phase 4 інтеграційні тести покривають всі п'ять write-tools; Phase 6.5 parity-window фіксує реальні approval-сесії.                                                                            |
| **Витік PAT у Gateway env (Hard Rule #20)**                                                          | Середня                                                     | Pre-deploy чек у Railway (script у `docs/playbooks/rotate-openclaw-credentials.md`); smoke-test у Phase 0 ловить наявність PAT-змінних.                                                        |
| **Parity gap (Gateway поводиться інакше за grammy)**                                                 | Середня                                                     | Golden-conversation харнес у Phase 0.5 + щоденний моніторинг у Phase 6.5; gate to Phase 7 — ≥7 днів без regressions.                                                                           |
| Persona tool-leakage (LLM ігнорує SKILL allowlist)                                                   | Середня                                                     | Allowlist через `agents.<persona>.tools` config + `optional: true` write-tools; SKILL текст лишається hint-ом, не enforcement.                                                                 |
| WhatsApp pairing губиться при rebuild Railway image                                                  | Низька                                                      | Persistent volume для `~/.openclaw`; backup auth-state у secret manager.                                                                                                                       |
| Cheap router (Haiku) невірно класифікує рутину як thinking (спалює буджет)                           | Середня                                                     | Telemetry: логувати всі router рішення у `openclaw_invocations` + щотижневий огляд; fallback Layer 0 keyword catch-all; `OPENCLAW_MAX_PER_CALL_USD` cap.                                       |
| n8n Tier A workflow упаде під час auto-trigger (без approval)                                        | Середня                                                     | `trigger_n8n_workflow` всередині 8s timeout; якщо провал — агент відповідає stale-cache + тегує `/Олексій`; allowlist enforce-ує тільки 3 workflows без user-side effect.                      |
| Cross-persona memory leak (cofounder бачить persona-only записи, але specialist слухає cofounder DM) | Низька-Середня                                              | ACL пишеться у `recall_memory` server-side, не у плагіні (не обхідно); migration 036 покриває backfill: всі існуючі записи отримують `persona='cofounder'`.                                    |

---

## Rollback план

Завдяки тому, що grammy лишається у репо як fallback, rollback — це переключення feature flag, не code revert.

1. **Швидкий rollback (ad hoc):** `OPENCLAW_GATEWAY_ENABLED=false` на console Railway service → grammy bot піднімається наступним рестартом. Виставити назад `OPENCLAW_BOT_TOKEN`.
2. Server API не змінюється — internal endpoints працюють для обох клієнтів одночасно (Phase 6.5 саме це і робить).
3. DB таблиці не змінюються — дані compatible.
4. Якщо проблема в plugin — Gateway відключаємо у Railway (suspend service), grammy продовжує.
5. **Видалення коду grammy** — окрема ініціатива, не раніше ніж через 4 тижні стабільної роботи Gateway, окремим PR з власним rollback-планом.

---

## Гнучкість після merge: що можна змінювати без релізу плагіна

Все нижче — конфіг (репо, PR-review, 1 file change), без коду:

- **Новий n8n workflow** → 1 рядок у `ops/openclaw/n8n-allowlist.json` + tier. PR на 5 хвилин.
- **Зміна tier workflow-у (B→A, A→C)** → 1 рядок у тому ж файлі.
- **Нова persona / переіменування** → copy SKILL.md template + рядок у `agents.<slug>` config + alias. ~15 хв.
- **Новий shortcut** → 1 файл `shortcuts/<name>.ts` + регулярка + canned template. ~30 хв.
- **Зміна `model_default` або `model_for_thinking` для persona** → 1 рядок у `openclaw.json`. Зміна без релізу плагіна.
- **Cost cap / per-call limit** → Railway env var, restart container.
- **Topic enum для memory** → ADD VALUE до `ai_memories.topic` (PG text field, без міграції на enum).
- **SEO credentials (GSC/PSI/SerpAPI)** → set env vars у Railway, tools перемикаються з `not_configured` на `live` автоматично.
- **Heartbeat schedule** → `MORNING_DIGEST_CRON` env override.
- **Voice/Canvas on/off** → `openclaw.json` feature flags.
- **Новий канал** (Slack/Discord/Signal/iMessage) → канал-pairing у dashboard + persona tone-tweak у відповідних SKILL.md.

Цей плагін navmisno design-driven: код знає **як** виконати tool/route/persona, але **що саме** — read-only configuration. Зміна вимог `ops/openclaw/*` змінює поведінку без зачіпання `packages/openclaw-plugin/src/`.

---

## Артефакти PR-A v3

Цей PR не вносить runtime код. Він додає:

- `docs/planning/openclaw-migration-plan.md` (v3, поточний файл)
- `ops/openclaw/openclaw.example.json` (skeleton config: routing + 10 personas + 17 shortcuts + n8n tier mapping)
- `ops/openclaw/n8n-allowlist.json` (19 workflows + tier)
- `ops/openclaw/shortcuts/catalog.md` (17 shortcut-ів, спеці-документ)
- `ops/openclaw/skills/sergeant-cofounder/SKILL.md` (Сергій)
- `ops/openclaw/skills/sergeant-eng/SKILL.md` (Артем)
- `ops/openclaw/skills/sergeant-devops/SKILL.md` (Олексій)
- `ops/openclaw/skills/sergeant-pm/SKILL.md` (Олена)
- `ops/openclaw/skills/sergeant-growth/SKILL.md` (Марта)
- `ops/openclaw/skills/sergeant-seo/SKILL.md` (Назар)
- `ops/openclaw/skills/sergeant-content/SKILL.md` (Софія)
- `ops/openclaw/skills/sergeant-data/SKILL.md` (Ярема)
- `ops/openclaw/skills/sergeant-cs/SKILL.md` (Ольга)
- `ops/openclaw/skills/sergeant-finance/SKILL.md` (Ірина)

Усі config-файли — **examples / templates** для майбутніх PR-C/D. Поки що ні Gateway, ні плагін не існують, тож `ops/openclaw/*` — це довідкові артефакти для review.

---

## Community plugins policy (ClawHub)

[ClawHub](https://clawhub.ai/) — community marketplace OpenClaw плагінів (52k+ tools). Наша політика:

- **NOT install:** жодних community плагінів, які пишуть/читають Sergeant-дані (Stripe, GitHub, Sentry, PostHog, n8n, etc.). Все це йде через наш `@sergeant/openclaw-plugin` → `apps/server /api/internal/openclaw/*` з `INTERNAL_API_KEY` + budget + audit. Community плагіни обходять цей boundary і порушують Hard Rule #20 + audit invariants.
- **OK to reference (research-only) під час PoC:** approval-flow patterns, n8n wrappers, Telegram channel configs. Запис у `docs/notes/spikes/openclaw-poc.md` як baseline для Phase 4 design choice.
- **OK to install після Gateway production (post-Phase 7), кожен — micro-ADR:** voice STT/TTS поверх native, Canvas теми, knowledge-base connectors (Notion/GDrive read-only), додаткові channel plugins (Slack/Discord/Signal/iMessage). Security review обов'язковий: identity-mapping → `founderUserId`, rate-limit per channel, allowlist, audit pipeline.
- **NEVER auto-install:** Renovate-only PR (без auto-merge), human approval, smoke-test на test-Gateway перед production.

Підсумок: ClawHub — це extension marketplace для **post-Gateway** опціональних надбудов, не source-of-truth для core tools.
