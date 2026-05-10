# OpenClaw Migration Plan: Internal Bot → External OpenClaw Gateway

> **Last validated:** 2026-05-10 by Devin. **Next review:** після Phase 1 завершення.
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

- Node 24 (або 22.16+) для Gateway
- Anthropic API key (або інший provider)
- Доступ до Sergeant server API (`/api/internal/openclaw/*`)
- Telegram Bot Token (новий або існуючий)

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
Founder (Telegram / WhatsApp / Slack / Discord / Signal / …)
      │
      ▼
OpenClaw Gateway (self-hosted, port 18789)
  ├── Anthropic / OpenAI / інший provider
  ├── Skills (SKILL.md)
  │   ├── sergeant-cofounder/    ← personas, tone-mode, strategic modes
  │   ├── sergeant-ops/
  │   ├── sergeant-growth/
  │   ├── sergeant-eng/
  │   └── sergeant-finance/
  └── Plugin: @sergeant/openclaw-tools
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
      ├── registerTool("commit_to_strategy_doc")   ← gated
      ├── registerTool("create_github_issue")       ← gated
      ├── registerTool("post_to_topic")             ← gated
      ├── registerTool("pause_workflow")             ← gated
      └── registerTool("mute_alert")                 ← gated
      │
      ▼ HTTP (той самий контракт)
apps/server /api/internal/openclaw/*
  └── (без змін — server API залишається як є)
```

**Ключовий принцип:** Server API (`apps/server/src/routes/internal/openclaw.ts` + `modules/openclaw/`) **не змінюється**. Це backend з tools, budget, audit, allowlists. Ми міняємо лише **frontend** — замість grammy бота підключаємо OpenClaw Gateway.

---

## Інвентаризація: що є зараз

### Env змінні (tools/console)

| Змінна | Опис | Що робити |
|--------|------|-----------|
| `OPENCLAW_BOT_TOKEN` | Telegram Bot API token | Замінюється на OpenClaw Telegram channel config |
| `OPENCLAW_FOUNDER_USER_ID` | Better Auth user ID | Переноситься в plugin config |
| `OPENCLAW_FOUNDER_TG_USER_ID` | Telegram user ID для allowlist | Замінюється на OpenClaw DM pairing policy |
| `OPENCLAW_MAX_ITERATIONS` | Agent loop iteration cap | Переноситься в skill/config |
| `OPENCLAW_RATE_LIMIT_PER_MIN` | Rate limiter | OpenClaw має вбудований rate limiting |
| `OPENCLAW_MAX_PER_CALL_USD` | Per-call USD cap | Переноситься в plugin config |
| `OPENCLAW_COUNCIL_USD_BUDGET` | Council session headroom | Переноситься в plugin config |
| `OPENCLAW_USE_WEBHOOK` | Webhook vs long-poll | Не потрібен — OpenClaw сам handles delivery |
| `OPENCLAW_WEBHOOK_URL` | Webhook endpoint | Не потрібен |
| `OPENCLAW_WEBHOOK_SECRET` | Webhook secret | Не потрібен |
| `OPENCLAW_WEBHOOK_PATH` | Webhook path | Не потрібен |
| `OPENCLAW_WEBHOOK_PORT` | Webhook port | Не потрібен |
| `OPENCLAW_AGENT_STATUS_CALLBACK_URL` | Status callback | Переноситься в plugin hook |
| `SERVER_INTERNAL_URL` | Sergeant server URL | Переноситься в plugin config |
| `INTERNAL_API_KEY` | Internal API auth | Переноситься в plugin config |
| `ANTHROPIC_API_KEY` | Anthropic API key | Переноситься в OpenClaw model config |

### DB таблиці (apps/server — залишаються)

| Таблиця | Міграція | Опис |
|---------|----------|------|
| `openclaw_invocations` | 028 | Audit log усіх викликів (trigger, tool_calls, cost, status) |
| `openclaw_decisions` | 028 | Decision log (topic, context, decision, rationale, git_pr_url) |
| `openclaw_write_audit` | 030 | Write-tool approve/executed/rejected transitions |
| `ai_memories` (source='cofounder') | 028 | Cofounder memory namespace |

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

### Console-side код (що видаляємо)

| Шлях | Файли | Опис |
|------|-------|------|
| `tools/console/src/openclaw/` | 16 файлів (*.ts) | Handler, session, approval, audit, security, bootstrap, webhook, commands, policy |
| `tools/console/src/agents/openclaw.ts` | 1 | Agent loop + tool execution |
| `tools/console/src/agents/personas.ts` | 1 | 5 personas + tool filters |
| `tools/console/src/agents/strategic-modes.ts` | 1 | /plan, /analyze, /okr modes |
| `tools/console/src/agents/dispatcher.ts` | 1 | Agent network delegation |
| `tools/console/src/index.ts` | часткове | OpenClaw bootstrap code |

**Разом: ~20 файлів + ~30 тестів** до видалення (після того, як plugin повністю працює).

---

## Phases міграції

### Phase 0: Підготовка (1 день)

1. **Встановити OpenClaw Gateway** на dev-машину (або Railway staging):
   ```bash
   npm install -g openclaw@latest
   openclaw onboard --install-daemon
   ```
2. **Підключити Telegram канал** — той самий бот або новий test-bot.
3. **Переконатися**, що Gateway стартує, відповідає на DM, і Telegram channel працює.
4. **Зберегти конфігурацію** у `~/.openclaw/config.json`.

### Phase 1: Sergeant Tools Plugin (3-4 дні)

Створити TypeScript plugin `@sergeant/openclaw-tools`, який реєструє всі Sergeant tools через `api.registerTool(...)`.

**Структура:**
```
packages/openclaw-plugin/
├── package.json
├── openclaw.plugin.json
├── src/
│   ├── index.ts           ← definePluginEntry + registerTool calls
│   ├── config.ts          ← plugin config schema (serverUrl, apiKey, founderUserId)
│   ├── http-client.ts     ← thin HTTP wrapper for /api/internal/openclaw/*
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
│   │   ├── record-decision.ts
│   │   └── budget.ts
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
    topK: Type.Optional(Type.Number({ description: "Max results (default 5)" })),
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

**Budget guard** — реалізувати як pre-execute hook:
```typescript
// Перед кожним tool-call — перевіряємо budget
async function checkBudget(): Promise<boolean> {
  const res = await httpClient.post("/api/internal/openclaw/budget", {
    founderUserId: config.founderUserId,
  });
  return res.data.allowed;
}
```

### Phase 2: Personas як Skills (1-2 дні)

Перенести 5 personas як окремі OpenClaw skills:

```
~/.openclaw/workspace/skills/
├── sergeant-cofounder/SKILL.md   ← default persona, повний tool-set
├── sergeant-ops/SKILL.md         ← ops primer + restricted tools
├── sergeant-growth/SKILL.md      ← growth primer + restricted tools
├── sergeant-eng/SKILL.md         ← eng primer + restricted tools
└── sergeant-finance/SKILL.md     ← finance primer + restricted tools
```

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

### Phase 4: Approval Flow для Write-Tools (2 дні)

Це найскладніша частина. Внутрішній OpenClaw мав inline-keyboard approve/reject у Telegram. Варіанти:

**Варіант A: OpenClaw native gated tools**
OpenClaw має вбудований механізм approval — перевірити чи підходить для наших потреб.

**Варіант B: Custom approval через plugin hooks**
Plugin реєструє pre-execute hook, який:
1. Перехоплює write-tool call
2. Надсилає повідомлення founder-у з describe tool + input
3. Чекає на confirmation (callback або reply)
4. Виконує або відхиляє

**Варіант C: Hybrid — write-tools як окремий "approval agent"**
Write-tools реєструються з `requiresConfirmation: true` (якщо OpenClaw це підтримує).

**Рекомендація:** почати з Варіанту A, перевірити можливості. Якщо недостатньо — Варіант B.

### Phase 5: Council Round-Table (1-2 дні)

`/council` запускав sequential personas (ops → growth → eng → finance → cofounder synthesis). Реалізація:

**Варіант A: Multi-agent orchestration**
OpenClaw підтримує multi-agent setups. Кожна persona — окремий agent. Створити orchestrator-skill, який послідовно викликає кожного.

**Варіант B: Single-agent з tool**
Один agent з custom `council_roundtable` tool, який послідовно змінює persona context і збирає відповіді.

### Phase 6: Audit & Invocation Tracking (1 день)

Зберегти audit logging через ті самі server endpoints:
- Plugin lifecycle hooks: on agent turn start → `POST /invocations/open`
- On agent turn end → `POST /invocations/finalize`
- On write-tool approve/reject → `POST /write-audit/log`

### Phase 7: Cleanup (1 день)

1. **Видалити** `tools/console/src/openclaw/` (16 файлів)
2. **Видалити** openclaw-specific код з `tools/console/src/agents/` (4 файли)
3. **Очистити** `tools/console/src/index.ts` від openclaw bootstrap
4. **Видалити** непотрібні env vars з Railway/deploy configs
5. **Оновити** документацію:
   - `AGENTS.md` — прибрати згадки внутрішнього OpenClaw
   - `docs/adr/0031-*` — позначити як superseded
   - Hard Rule #20 — оновити контекст
6. **НЕ видаляти:**
   - `apps/server/src/modules/openclaw/` — server API залишається
   - `apps/server/src/routes/internal/openclaw.ts` — endpoints залишаються
   - DB таблиці — дані залишаються
   - Міграції — immutable

### Phase 8: Додаткові канали (за бажанням)

Після стабілізації Telegram — підключити додаткові канали:
- WhatsApp (Baileys QR pairing)
- Slack (Bolt workspace app)
- Discord (server + DMs)
- Signal
- iMessage (macOS only)

Кожен канал — просто конфіг у OpenClaw, нічого кодити не треба.

---

## Оцінка зусиль

| Phase | Опис | Оцінка |
|-------|------|--------|
| 0 | Підготовка + встановлення Gateway | 1 день |
| 1 | Sergeant Tools Plugin | 3-4 дні |
| 2 | Personas як Skills | 1-2 дні |
| 3 | Strategic Modes | 1 день |
| 4 | Approval Flow | 2 дні |
| 5 | Council Round-Table | 1-2 дні |
| 6 | Audit & Invocation Tracking | 1 день |
| 7 | Cleanup | 1 день |
| **Загалом** | | **~10-14 днів** |

---

## Ризики та мітигація

| Ризик | Імовірність | Мітигація |
|-------|-------------|-----------|
| OpenClaw approval flow недостатній для наших потреб | Середня | Варіант B (custom plugin hooks) як fallback |
| Breaking changes у OpenClaw API | Низька | Pin версію, моніторити changelog |
| Latency збільшується (додатковий hop через Gateway) | Низька | Gateway на тій же машині що й server |
| Council orchestration складна в multi-agent | Середня | Fallback на single-agent + tool підхід |
| Втрата edge cases з approval-store | Середня | Ретельне тестування Phase 4, E2E тести |

---

## Rollback план

1. `tools/console/src/openclaw/` залишається у git history — `git revert` відновить
2. Server API не змінюється — internal endpoints працюють для обох клієнтів
3. DB таблиці не змінюються — дані compatible
4. Env vars — повернути у Railway config
5. **Рекомендація:** тримати Phase 7 (cleanup) як окремий PR, щоб rollback був простим
