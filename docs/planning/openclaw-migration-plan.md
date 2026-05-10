# OpenClaw Migration Plan: Internal Bot → External OpenClaw Gateway

> **Last validated:** 2026-05-10 by Devin. **Next review:** після Phase 0.5 PoC.
> **Status:** Scaffolded

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
- **Конфігурація:** `~/.openclaw/openclaw.json` всередині контейнера (mounted volume для persistence skills/canvas state).
- **Secrets:** Railway env, окремий namespace від `apps/server`. Немає `OPENCLAW_GITHUB_PAT` у production — Hard Rule #20.
- **Webhook vs long-poll:** Telegram через webhook на Gateway public URL (Railway exposes HTTPS). Channels-specific config — у `openclaw.json`.
- **Networking:** Gateway → server викликає `https://server.internal:3000/api/internal/openclaw/*` через приватний домен Railway.

---

## PR-стратегія

Робота розбита на ~5 PR замість одного великого. Кожен — самостійний, з власним rollback.

| #    | PR / гілка                                | Що включає                                                                                                                                                  | Залежить від             |
| ---- | ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| PR-A | `devin/<ts>-openclaw-plan-v2`             | Цей файл — оновлений план. Без коду.                                                                                                                        | —                        |
| PR-B | `devin/<ts>-openclaw-poc-spike`           | Phase 0.5 PoC: 1 read + 1 write tool, 1 hook, parity-харнес. Гілка не мерджиться у main без зеленої перевірки PoC, але живе у репі для review.              | PR-A                     |
| PR-C | `devin/<ts>-openclaw-plugin-readonly`     | Phase 1 (read-only tools) + Phase 2 (personas як skills + allowlist) + Phase 3 (strategic modes).                                                           | PR-B                     |
| PR-D | `devin/<ts>-openclaw-plugin-write-tools`  | Phase 4 (approval flow для write-tools) + Phase 6 (audit/invocation lifecycle hooks).                                                                       | PR-C                     |
| PR-E | `devin/<ts>-openclaw-council-roundtable`  | Phase 5 (council orchestration).                                                                                                                            | PR-D                     |
| PR-F | `devin/<ts>-openclaw-cutover-and-cleanup` | Phase 6.5 (parallel run + feature flag) → Phase 7 (вимкнення grammy bootstrap, ADR superseded, env cleanup). Grammy код **залишається** у репо як fallback. | PR-E + ≥1 тиждень parity |

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
  ├── Skills (SKILL.md)
  │   ├── sergeant-cofounder/    ← default persona, full tool-set
  │   ├── sergeant-ops/          ← agent config: tools allowlist
  │   ├── sergeant-growth/       ← agent config: tools allowlist
  │   ├── sergeant-eng/          ← agent config: tools allowlist
  │   └── sergeant-finance/      ← agent config: tools allowlist
  └── Plugin: @sergeant/openclaw-plugin
      ├── registerTool("recall_memory")
      ├── registerTool("read_strategy_docs")
      ├── registerTool("query_app_db")
      ├── registerTool("read_github")
      ├── registerTool("get_stripe_metrics")
      ├── registerTool("get_sentry_issues")
      ├── registerTool("get_posthog_stats")
      ├── registerTool("read_workflow_logs")
      ├── registerTool("get_server_stats")
      ├── registerTool("get_github_releases")
      ├── registerTool("read_telegram_topic_history")
      ├── registerTool("record_decision")
      ├── registerTool("commit_to_strategy_doc")   ← gated, optional:true
      ├── registerTool("create_github_issue")       ← gated, optional:true
      ├── registerTool("post_to_topic")             ← gated, optional:true
      ├── registerTool("pause_workflow")             ← gated, optional:true
      ├── registerTool("mute_alert")                 ← gated, optional:true
      ├── registerHook("llm_input")                  ← budget pre-check + invocation/open
      ├── registerHook("tool_call_pre")              ← write-tool approval gate
      ├── registerHook("tool_call_post")             ← write-audit log
      └── registerHook("agent_turn_end")             ← invocation/finalize + cost rollup
      │
      ▼ HTTP (той самий контракт)
apps/server /api/internal/openclaw/*
  └── (без змін — server API залишається як є)
```

**Ключовий принцип:** Server API (`apps/server/src/routes/internal/openclaw.ts` + `modules/openclaw/`) **не змінюється**. Це backend з tools, budget, audit, allowlists. Ми міняємо лише **frontend** — замість grammy бота підключаємо OpenClaw Gateway.

---

## Інвентаризація: що є зараз

### Env змінні (tools/console)

| Змінна                               | Опис                                 | Що робити                                                                                                       |
| ------------------------------------ | ------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| `OPENCLAW_BOT_TOKEN`                 | Telegram Bot API token               | Замінюється на OpenClaw Telegram channel config                                                                 |
| `OPENCLAW_FOUNDER_USER_ID`           | Better Auth user ID                  | Переноситься в plugin config                                                                                    |
| `OPENCLAW_FOUNDER_TG_USER_ID`        | Telegram user ID для allowlist       | Замінюється на OpenClaw DM pairing policy                                                                       |
| `OPENCLAW_MAX_ITERATIONS`            | Agent loop iteration cap             | Переноситься в skill/config                                                                                     |
| `OPENCLAW_RATE_LIMIT_PER_MIN`        | Rate limiter                         | OpenClaw має вбудований rate limiting                                                                           |
| `OPENCLAW_MAX_PER_CALL_USD`          | Per-call USD cap                     | Переноситься в plugin config + enforced через `llm_input` hook (server-side `/budget` лишається authoritative). |
| `OPENCLAW_COUNCIL_USD_BUDGET`        | Council session headroom             | Переноситься в plugin config (council-skill)                                                                    |
| `OPENCLAW_USE_WEBHOOK`               | Webhook vs long-poll                 | Не потрібен — OpenClaw сам handles delivery                                                                     |
| `OPENCLAW_WEBHOOK_URL`               | Webhook endpoint                     | Не потрібен                                                                                                     |
| `OPENCLAW_WEBHOOK_SECRET`            | Webhook secret                       | Не потрібен                                                                                                     |
| `OPENCLAW_WEBHOOK_PATH`              | Webhook path                         | Не потрібен                                                                                                     |
| `OPENCLAW_WEBHOOK_PORT`              | Webhook port                         | Не потрібен                                                                                                     |
| `OPENCLAW_AGENT_STATUS_CALLBACK_URL` | Status callback                      | Переноситься в plugin hook                                                                                      |
| `SERVER_INTERNAL_URL`                | Sergeant server URL                  | Переноситься в plugin config                                                                                    |
| `INTERNAL_API_KEY`                   | Internal API auth                    | Переноситься в plugin config                                                                                    |
| `ANTHROPIC_API_KEY`                  | Anthropic API key                    | Переноситься в OpenClaw model config                                                                            |
| `OPENCLAW_GATEWAY_ENABLED`           | **Новий feature flag** для Phase 6.5 | `false` за замовч., `true` вмикає Gateway-routing у grammy bootstrap                                            |

### DB таблиці (apps/server — залишаються)

| Таблиця                            | Міграція | Опис                                                           |
| ---------------------------------- | -------- | -------------------------------------------------------------- |
| `openclaw_invocations`             | 028      | Audit log усіх викликів (trigger, tool_calls, cost, status)    |
| `openclaw_decisions`               | 028      | Decision log (topic, context, decision, rationale, git_pr_url) |
| `openclaw_write_audit`             | 030      | Write-tool approve/executed/rejected transitions               |
| `ai_memories` (source='cofounder') | 028      | Cofounder memory namespace                                     |

**Всі таблиці залишаються** — plugin буде ходити в ті самі server endpoints, які пишуть/читають ці таблиці.

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

### Phase 1: Sergeant Tools Plugin (5–7 днів)

Створити TypeScript plugin `@sergeant/openclaw-plugin`, який реєструє всі Sergeant tools через `api.registerTool(...)`.

**Структура:**

```
packages/openclaw-plugin/
├── package.json
├── openclaw.plugin.json
├── tsconfig.json
├── src/
│   ├── index.ts           ← definePluginEntry + registerTool/registerHook calls
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

### Phase 2: Personas як Skills + tool allowlist (1–2 дні)

Перенести 5 personas як окремі OpenClaw skills + жорсткий allowlist на рівні agent config.

```
~/.openclaw/workspace/skills/
├── sergeant-cofounder/SKILL.md   ← default persona, повний tool-set
├── sergeant-ops/SKILL.md         ← ops primer + restricted tools
├── sergeant-growth/SKILL.md      ← growth primer + restricted tools
├── sergeant-eng/SKILL.md         ← eng primer + restricted tools
└── sergeant-finance/SKILL.md     ← finance primer + restricted tools
```

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

| Phase                       | Опис                                                                       | Оцінка          |
| --------------------------- | -------------------------------------------------------------------------- | --------------- |
| 0                           | Підготовка + встановлення Gateway на Railway                               | 1 день          |
| 0.5                         | Spike PoC (approval + budget + audit + parity-харнес)                      | 1–2 дні         |
| 1                           | Sergeant Tools Plugin (13 read tools + 5 write tools + hooks + governance) | 5–7 днів        |
| 2                           | Personas як Skills + agent allowlist                                       | 1–2 дні         |
| 3                           | Strategic Modes                                                            | 1 день          |
| 4                           | Approval Flow (variant locked у 0.5)                                       | 3–5 днів        |
| 5                           | Council Round-Table                                                        | 3–4 дні         |
| 6                           | Audit + Sentry/PostHog instrumentation                                     | 1–2 дні         |
| 6.5                         | Parallel run + feature flag (calendar wait)                                | ≥7 днів         |
| 7                           | Cutover (вимкнення grammy, ADR superseded, env cleanup)                    | 1–2 дні         |
| 8                           | WhatsApp channel                                                           | 1–2 дні         |
| **Загалом (engineering)**   |                                                                            | **~18–28 днів** |
| **Загалом з parity-window** |                                                                            | **~25–35 днів** |

---

## Ризики та мітигація

| Ризик                                                | Імовірність                                                 | Мітигація                                                                                                                                                                                      |
| ---------------------------------------------------- | ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| OpenClaw approval flow недостатній для наших потреб  | Середня                                                     | Phase 0.5 PoC фіксує варіант (native vs custom hook) до старту Phase 1; Варіант B як fallback.                                                                                                 |
| Breaking changes у OpenClaw API                      | **Середня-Висока** (141 реліз за ~6 місяців, активний beta) | Pin exact stable version у `package.json` + Railway lock; CI smoke-test plugin проти pinned SDK; renovate-only PR на апгрейди без auto-merge; інтеграційний тест-харнес з PoC переїжджає у CI. |
| Latency збільшується (додатковий hop через Gateway)  | Низька                                                      | Gateway на Railway у тому ж проєкті, що й server (intra-VPC). Phase 6.5 фіксує p95 baseline.                                                                                                   |
| Council orchestration складна в multi-agent          | Середня                                                     | Fallback на single-agent + tool підхід; PoC можна провалідувати у Phase 0.5 (опційно).                                                                                                         |
| Втрата edge cases з approval-store                   | Середня                                                     | Phase 4 інтеграційні тести покривають всі п'ять write-tools; Phase 6.5 parity-window фіксує реальні approval-сесії.                                                                            |
| **Витік PAT у Gateway env (Hard Rule #20)**          | Середня                                                     | Pre-deploy чек у Railway (script у `docs/playbooks/rotate-openclaw-credentials.md`); smoke-test у Phase 0 ловить наявність PAT-змінних.                                                        |
| **Parity gap (Gateway поводиться інакше за grammy)** | Середня                                                     | Golden-conversation харнес у Phase 0.5 + щоденний моніторинг у Phase 6.5; gate to Phase 7 — ≥7 днів без regressions.                                                                           |
| Persona tool-leakage (LLM ігнорує SKILL allowlist)   | Середня                                                     | Allowlist через `agents.<persona>.tools` config + `optional: true` write-tools; SKILL текст лишається hint-ом, не enforcement.                                                                 |
| WhatsApp pairing губиться при rebuild Railway image  | Низька                                                      | Persistent volume для `~/.openclaw`; backup auth-state у secret manager.                                                                                                                       |

---

## Rollback план

Завдяки тому, що grammy лишається у репо як fallback, rollback — це переключення feature flag, не code revert.

1. **Швидкий rollback (ad hoc):** `OPENCLAW_GATEWAY_ENABLED=false` на console Railway service → grammy bot піднімається наступним рестартом. Виставити назад `OPENCLAW_BOT_TOKEN`.
2. Server API не змінюється — internal endpoints працюють для обох клієнтів одночасно (Phase 6.5 саме це і робить).
3. DB таблиці не змінюються — дані compatible.
4. Якщо проблема в plugin — Gateway відключаємо у Railway (suspend service), grammy продовжує.
5. **Видалення коду grammy** — окрема ініціатива, не раніше ніж через 4 тижні стабільної роботи Gateway, окремим PR з власним rollback-планом.
