# OpenClaw — roadmap до v0 і далі

> **Last validated:** 2026-05-02 by @Skords-01. **Next review:** 2026-08-01.
> **Status:** Active

> Поетапний план побудови OpenClaw — AI-помічника для синтезу метрик, планування і
> аналізу. Документ фіксує що вже є в інфраструктурі, що треба добудувати, і
> декомпозицію на 4 фази по PR-ах. Source-of-truth для майбутніх PR-ів які
> торкаються OpenClaw — завжди звіряти з цим файлом і з ADR-ами нижче.
>
> Пов'язане: [ADR-0027](../adr/0027-openclaw-console-mcp-policy.md) (політика console / MCP),
> [ADR-0028](../adr/0028-pgvector-ai-memory.md) (pgvector AI memory),
> [ADR-0030](../adr/0030-telegram-reporting-channel-structure.md) (forum-mode роутинг),
> [05 — Operations and Automation](./05-operations-and-automation.md) (узагальнена картина
> n8n + OpenClaw).

---

## 1. Mental model — у нас уже ~60% інфри

OpenClaw — не нова система. Це **тонкий шар** агентного циклу поверх інфраструктури
яка вже live. Не будуємо з нуля; розширюємо HubChat, вмикаємо tool-loop, підмикаємо
read-only ops-tools.

```
                     ┌──────────────────────────────────┐
                     │   ВЖЕ Є (60%)                    │
                     ├──────────────────────────────────┤
       Surface ──→   │ HubChat (web) + Telegram bot     │ ✅
       Reasoning ─→  │ /api/chat (Anthropic + tools)    │ ✅
       Memory ────→  │ ai-memory (pgvector + Voyage)    │ ✅ ADR-0028 PR2/PR3
       Routing ───→  │ 7 Telegram forum топіків + n8n   │ ✅ ADR-0030
       Pipelines ─→  │ 19 n8n workflow (детермінізм)    │ ✅
       Policy ────→  │ ADR-0027 OpenClaw MCP policy     │ ✅
                     └──────────────────────────────────┘
                     ┌──────────────────────────────────┐
                     │   ТРЕБА ЗРОБИТИ (40%)            │
                     ├──────────────────────────────────┤
       1. Read-only tools-конектори (PG / PostHog /
          Sentry / Stripe / n8n_API / Mono / Railway)
       2. Plan→Act→Reflect agent loop (не one-shot)
       3. Decision log — структуроване "що ми вирішили"
       4. Strategic primitives — postmortem, plan, OKR
       5. Scheduled outputs — daily briefing, weekly recap
       6. Audit-логи (allowlist + write-tool approval flow)
                     └──────────────────────────────────┘
```

**Принцип розділення** (з [05-operations-and-automation.md §6.1](./05-operations-and-automation.md#61-розділення-відповідальності)):

- **n8n** = детермінізм. "Stripe webhook → Telegram message". Без думання.
- **OpenClaw** = синтез. "Чому MRR впав на 12 %? Що робимо?". Думає.

---

## 2. "Розумний помічник" — переклад на конкретні features

| Користувацька фраза        | Технічний еквівалент                                                                                                                                             |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "не тільки бачити метрики" | Уже маємо: HubDashboard + 7 Telegram-топіків. **Add:** OpenClaw читає метрики on-demand і дає контекст (чому падає / зростає).                                   |
| "планували разом з ним"    | Plan-mode: структурований діалог "ціль → варіанти → trade-offs → decision". Запис у `decisions` таблицю.                                                         |
| "робили стратегію"         | OKR / quarter-mode: завантажує квартальні цілі, пропонує initiatives, перевіряє progress weekly. Виходи — Telegram digest + git-PR з оновленим `docs/strategy/`. |
| "аналізували"              | Ad-hoc query mode: `/openclaw чому drop у signups вчора` → plan-act-reflect: запит до PostHog + Stripe + Sentry → гіпотеза + докази.                             |

**Що відрізняє OpenClaw від звичайного chat-бота:** memory (через pgvector),
decision-log, multi-step reasoning (не one-shot LLM call). Це робить його _партнером_,
а не _інтерфейсом до даних_.

---

## 3. Поетапний план — 4 фази

### Phase 1 — "Thinking partner" v0 (≈ 1 PR, ≈ 3 дні)

**Ціль:** OpenClaw відповідає на ad-hoc питання з реальними даними з нашої БД.
Без write-tools. Без strategic mode. Read-only помічник.

**Scope:**

- ADR-0031 "OpenClaw v0 — agentic loop в HubChat" (формалізувати рішення).
- Новий модуль `apps/server/src/modules/openclaw/`:
  - `loop.ts` — Plan→Act→Reflect runner (max 5 ітерацій, hard cap).
  - `prompts/` — system prompt + role descriptions (versioned in git).
  - `tools/` — read-only tools:
    - `query_app_db` — параметризовані SELECT-и до Postgres (allowlist по таблицях, READ-ONLY роль).
    - `read_workflow_logs` — read через `n8n_API` (`/executions`).
    - `read_telegram_topic_history` — Bot API для контрол-плану.
    - `recall_memory` — вже існує (див. [ai-memory-activation](./ai-memory-activation.md)).
- HubChat — нова кнопка "Запитати OpenClaw" → відкриває dedicated session з
  прапорцем `mode: "openclaw"` (tool-loop ввімкнено).
- `decisions` table + `record_decision` tool (write, але вузький — тільки
  додає рядок до журналу, не змінює бізнес-стан).
- Cost cap: `OPENCLAW_DAILY_USD_BUDGET=5`. При exceeded — fail-closed з
  повідомленням у `⚙️ Контрол-план`.

**Acceptance:**

- `/openclaw скільки активних користувачів сьогодні` → реальна цифра з PG + цитата запиту.
- `/openclaw чому в Sentry вчора 3 нові issues` → витяг з `read_workflow_logs` + Sentry API.
- Кожна відповідь має `decision_id` (якщо була strategic decision) і `recall_score` (якщо memory використана).

**НЕ робимо:**

- Write-tools (mute alerts, pause workflow, post to Telegram) — вимкнено за ADR-0027.
- Strategic templates — Phase 3.
- Scheduled briefings — Phase 2.

### Phase 2 — Telegram surface + scheduled outputs (≈ 2 PRs, ≈ 3 дні)

**Ціль:** OpenClaw виходить у Telegram. Розклад. Команди.

**Scope:**

- Cron 08:30 Kyiv → `/openclaw briefing` → текст ≤ 8 рядків → `📊 Дайджести`:
  Stripe MRR delta · PostHog signups · Sentry new issues · GitHub PR queue · open Telegram tickets.
- Telegram bot commands (через `apps/console`):
  - `/openclaw <питання>` — ad-hoc query mode.
  - `/openclaw plan <topic>` — start plan-mode session (Phase 3 hook).
  - `/openclaw recall <query>` — explicit memory lookup.
- Audit log — кожна команда у `openclaw_invocations` з actor, prompt, tool_calls, cost, latency.
- Allowlist enforcement — `OPENCLAW_ALLOWED_USER_IDS` (fail-closed якщо empty в prod) per ADR-0027.

**Acceptance:**

- Завтра о 08:30 у `📊 Дайджести` приходить ранкова зведена.
- `/openclaw briefing` ad-hoc → той самий вивід за 5–15 секунд.
- Audit-log містить запис кожного виклику з PII-redacted prompt.

### Phase 3 — Strategic mode (≈ 3 PRs, ≈ 5 днів)

**Ціль:** OpenClaw стає партнером з планування і аналізу.

**Scope:**

- `docs/strategy/` — нова директорія з YAML-frontmatter `objective`, `kr[]`, `current_state`, `last_review_at`. Owner — user.
- `plan-mode` — структурований діалог:
  1. **Goal** — уточнити ціль (clarifying questions).
  2. **Context** — підтягнути дані з tools + memory.
  3. **Options** — згенерувати 2–3 варіанти з trade-offs.
  4. **Decision** — записати в `decisions` + закомітити в `docs/strategy/<okr>.md` через HubChat actions.
  5. **Followup** — запланувати weekly review через cron.
- `analyze-mode` — multi-step root-cause analysis:
  - Аномалія → гіпотези → кожну перевірити tool-ом → ranked висновок.
  - Output: short Telegram message + детальний report у `docs/postmortems/<date>-<slug>.md`.
- Weekly recap (Sunday 18:00 Kyiv) — порівняння тижня з попереднім + check-in з активними OKR.

**Acceptance:**

- `/openclaw plan churn-reduction-q3` → 4-step session → PR з `docs/strategy/churn-q3.md`.
- `/openclaw analyze падіння signups вчора` → гіпотези + докази + `docs/postmortems/<date>-signups-drop.md`.
- Subota 18:00 — automatic weekly recap у `📊 Дайджести` з progress на 3 OKR.

### Phase 4 — Розширити tool-set і запровадити write-tools з approval (≈ 5 днів)

**Ціль:** OpenClaw може діяти, не тільки думати — кожна mutating дія потребує
human-approval (per ADR-0027).

**Scope:**

- Додати MCP-style tools:
  - PostHog (events, funnels, retention).
  - Stripe (revenue, churn, MRR breakdown).
  - Sentry (issue history, regression detection).
  - Mono (transactions, cashflow).
  - Railway (deploy status, env, restart — write з approval).
- Write-tools з inline-button approval flow:
  - `mute_alert <workflow_id> <duration>` — пауза WF на N годин.
  - `pause_workflow <workflow_id>` — деактивація через `n8n_API`.
  - `create_github_issue` — для action items з postmortems.
  - `update_strategy_doc` — комітити зміни в `docs/strategy/`.
- Кожен write-tool — Telegram message з 2 inline-buttons "Approve" / "Reject" → callback handler у `apps/console`.

**Acceptance:**

- OpenClaw запропонував "паузнути WF-15 на 2h через high error rate" → у `🔴 Інциденти` приходить approval-message → user натискає Approve → workflow деактивовано → audit-log.
- Без user-click нічого мутуючого не відбувається (fail-closed).

---

## 4. Архітектурні рішення

### 4.1 Stack — використовуємо те, що є

| Layer         | Component                                     | Чому це                                |
| ------------- | --------------------------------------------- | -------------------------------------- |
| LLM           | Anthropic Claude (вже у `/api/chat`)          | Tool-use в API native; cost reasonable |
| Embeddings    | Voyage 3.5-lite (1024-dim, multilingual)      | Уже працює per ADR-0028                |
| Memory        | pgvector + HNSW + halfvec(1024)               | Уже працює per ADR-0028                |
| DB            | Railway Postgres (head app)                   | Існуючий instance                      |
| Cache / queue | Postgres (для `openclaw_invocations`)         | Без redis, простіше                    |
| Surface       | HubChat (web) + Telegram bot (`apps/console`) | Обидва існують                         |
| Scheduler     | n8n cron + Railway cron                       | Залежить від наскрізного rate-limit    |

### 4.2 Cost model — за що $5/добу

Anthropic Claude 3.5 Sonnet pricing: ~$3/M input tokens, ~$15/M output tokens.

Типова OpenClaw сесія (Plan→Act→Reflect, 3–5 ітерацій):

- System prompt + tools schema + history + context: ~5K input.
- Per ітерація: ~2–3K input (tool result echo) + 500–1500 output.
- Total: ~15–25K input + 2–7K output per query.
- **Cost per query: $0.05–0.18.**

Daily breakdown в межах $5:

- Ранковий `/openclaw briefing` (single-shot, $0.10–0.30).
- Weekly recap (Sunday, $0.30–0.50).
- Ad-hoc queries: ~$0.10 кожна → **30–50 queries/добу headroom**.
- Plan-mode session: $0.40–0.80 (більше turn-ів).

Чому саме $5:

- Менше ($1–2): не вистачить на active планувальну сесію.
- Більше ($10–20): дозволяє забути про ліміт; не потрібно на старті.
- $5 — sweet spot: 30–50 інтеракцій/добу покриває щоденний use-case з buffer-ом.
- Hard-cap fail-closed → exceeded → OpenClaw mute з message у `⚙️ Контрол-план` до ручного reset.
- Конфігурабельно — `OPENCLAW_DAILY_USD_BUDGET=10` коли треба.

### 4.3 Open questions — чекаємо рішень

1. **Surface priority:** HubChat (web) **АБО** Telegram bot (`/openclaw`) **АБО** обидва паралельно? Default: **Telegram first** — швидше відчути користь, бо весь день у Telegram.
2. **Domain priority:** ops/incidents (alert triage), revenue/growth (MRR strategy), engineering (PR review)? Який біль найгостріший?
3. **Cost cap:** $5/добу OK на старті? (Розрахунок у §4.2.)
4. **Write-tools:** вмикаємо їх у Phase 4 чи відкладаємо до окремої роботи? Default — відкласти; Phase 1–3 дають 80 % value без ризику.
5. **Memory privacy:** у Telegram-групі OpenClaw може recall контекст ("минулого тижня бачили подібний drop"), чи тільки в особистому HubChat сесії?
6. **Decision log location:** `decisions` таблиця у Postgres + Telegram broadcast у `⚙️ Контрол-план`, чи тільки git-comitted markdown у `docs/decisions/`?

---

## 5. Anti-patterns — чого НЕ робимо

- **Власний LLM hosted on Railway** — overkill, дорого, не треба.
- **Перейти з Anthropic на OpenAI** — без причини; Claude tool-use працює добре.
- **Задепрекейтити n8n і робити все через OpenClaw** — n8n потрібен для детермінованих pipeline-ів. OpenClaw — тільки для синтезу.
- **Vector DB окрім pgvector** — ADR-0028 вже зафіксував Postgres backend; додатковий Pinecone / Weaviate ускладнює без вигоди.
- **Front-end-heavy "OpenClaw dashboard"** — суть саме в conversational interface (HubChat + Telegram), не в UI dashboards.

---

## 6. Час до першого working slice

| Phase                 | Estimated    | Перший value-deliver                                                      |
| --------------------- | ------------ | ------------------------------------------------------------------------- |
| Phase 1               | 3 дні        | OpenClaw в HubChat відповідає на ad-hoc query з real-time PG / n8n даними |
| Phase 2               | + 3 дні      | Daily briefing у `📊 Дайджести` + Telegram `/openclaw` команди            |
| Phase 3               | + 5 днів     | Plan-mode + analyze-mode + weekly recap                                   |
| Phase 4               | + 5 днів     | Write-tools з approval flow                                               |
| **MVP (Phase 1 + 2)** | **≈ 6 днів** | Розумний помічник з ранковими briefings + ad-hoc queries                  |

---

## 7. Що треба, щоб почати Phase 1

1. Відповідь на 6 open questions у §4.3.
2. Підтвердження "Phase 1, починай".
3. (Optional) `ANTHROPIC_API_KEY` у Railway env vars якщо ще не виставлений.
4. Все інше (`n8n_API`, voyage, ai-memory, HubChat) — уже є у secrets / репі.

Як тільки буде "ок" + відповіді — створюється окремий feature-PR з ADR-0031 і
скелетом `apps/server/src/modules/openclaw/`. Усе інше за §3.1.
