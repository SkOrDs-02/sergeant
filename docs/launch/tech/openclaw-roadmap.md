# OpenClaw — roadmap до v0 і далі

> **Last validated:** 2026-05-12 by Devin. **Next review:** після Stage 4 hook spike.
> **Status:** Active — **Phase 1 / 1.5 / 2.5 / 4 / 4.5 пeренесено у Gateway-архітектуру (ADR-0055).** Цей файл — історична roadmap внутрішнього grammy-бота `@OpenClaw_sergeant_bot` (Phase 1 → 4.5). Поточний production live на новій Gateway bot-identity з `@sergeant/openclaw-plugin` — single source of truth: [`docs/planning/openclaw-migration-plan.md` § Reality update 2026-05-12](../../planning/openclaw-migration-plan.md).

> **2026-05-12 — Reality update.** Phase 1…4.5 нижче описує feature-set, який raніше працював у grammy `tools/console/src/openclaw/` і паралельно живе у Gateway-плагіні. У Gateway-плагіні станом на сьогодні **переписано тільки read-tools** (Stage 2 — 25 tools); write-tools (Phase 4) + hooks (Phase 4.5 audit/budget) + council orchestration (Phase 2.5) + strategic modes (Phase 3) — лежать у `packages/openclaw-plugin/src/legacy/` і чекають Stage 3/4/5 rewrite на real `openclaw@2026.5.7` SDK. У grammy-боті усі ці фічі залишаються активними як fallback до Phase 7 cutover.

> Поетапний план побудови OpenClaw — AI-партнера для founder-а Sergeant-у.
> **Не assistant** і **не metrics dashboard**. Це co-founder-режим: разом
> плануємо продукт, оспорюємо рішення, тримаємо priorities, шукаємо blind
> spots, аналізуємо що працює і що ні. Сурфейс — Telegram DM з окремим
> ботом (`@OpenClaw_sergeant_bot`, id `8614051263`). Web HubChat **не**
> використовується (він для end-користувачів додатку).
>
> Source-of-truth для майбутніх PR-ів які торкаються OpenClaw — завжди
> звіряти з цим файлом і з ADR-ами нижче.
>
> Пов'язане: [ADR-0027](../../adr/0027-openclaw-console-mcp-policy.md) (політика console / MCP),
> [ADR-0028](../../adr/0028-pgvector-ai-memory.md) (pgvector AI memory),
> [ADR-0030](../../adr/0030-telegram-reporting-channel-structure.md) (forum-mode роутинг),
> [ADR-0031](../../adr/0031-openclaw-v0-telegram-cofounder.md) (OpenClaw v0 baseline),
> [ADR-0032](../../adr/0032-console-consolidated-into-openclaw.md) (Sergeant Console
> consolidated into OpenClaw — slash-commands + ops/marketing tools live в OpenClaw),
> [ADR-0033](../../adr/0033-openclaw-multi-personas-and-council.md) (multi-personas +
> `/council` round-table — Phase 2.5 architecture),
> [05 — Operations and Automation](../business/05-operations-and-automation.md) (узагальнена картина
> n8n + OpenClaw).

---

## 1. Mental model — у нас уже ~60% інфри

OpenClaw — не нова система. Це **тонкий шар** агентного циклу поверх
інфраструктури яка вже live. Не будуємо з нуля; додаємо новий Telegram bot
service, агентний loop, read-only ops/product/codebase tools.

```
                     ┌──────────────────────────────────┐
                     │   ВЖЕ Є (60%)                    │
                     ├──────────────────────────────────┤
       Reasoning ─→  │ Anthropic Claude + tool-use      │ ✅ існує у /api/chat
       Memory ────→  │ ai-memory (pgvector + Voyage)    │ ✅ ADR-0028 PR2/PR3
       Routing ───→  │ 7 Telegram forum топіків + n8n   │ ✅ ADR-0030
       Pipelines ─→  │ 19 n8n workflow (детермінізм)    │ ✅
       Console ───→  │ tools/console (Telegram entrypoint) │ ✅ Bot framework
       OpenClawBot → │ @OpenClaw_sergeant_bot створений │ ✅ token зарезервований
       Policy ────→  │ ADR-0027 OpenClaw MCP policy     │ ✅
                     └──────────────────────────────────┘
                     ┌──────────────────────────────────┐
                     │   ТРЕБА ЗРОБИТИ (40%)            │
                     ├──────────────────────────────────┤
       1. Webhook handler у tools/console для
          @OpenClaw_sergeant_bot (DM-only, allowlisted
          founder user_id)
       2. Plan→Act→Reflect agent loop (max 5 ітерацій)
       3. Read-only tools — ops + product + codebase
          + strategy docs
       4. Cofounder memory namespace (окремо від
          end-user пам'яті)
       5. Proactive рамки — ранкова повістка, weekly
          review, monthly OKR review
       6. Strategic primitives — plan-mode, analyze-mode,
          OKR-mode (Phase 3)
       7. Decision log — структуроване "що ми вирішили"
       8. Audit-логи + write-tool approval flow (Phase 4)
                     └──────────────────────────────────┘
```

**Принцип розділення** (з [05-operations-and-automation.md §6.1](../business/05-operations-and-automation.md#61-розділення-відповідальності)):

- **n8n** = детермінізм. "Stripe webhook → Telegram message". Без думання.
- **OpenClaw** = синтез + co-founder dialogue. "Чому MRR впав? Що робимо?
  Який pivot варто розглянути?". Думає, оспорює, плюс має думку.

**HubChat (web Асистент) ≠ OpenClaw.** HubChat — surface для end-користувача
додатку (Mono / тренування / звички / харчування). OpenClaw — приватний DM
founder ↔ AI-co-founder. Дві різні аудиторії, два різні system prompts, два
різні tool-set-и. Спільна тільки інфраструктура (Anthropic, pgvector, Postgres).

**Bot identity розділення:**

- `@Sergeant_alert_bot` (id `7949536379`) — ops alerts у супергрупу
  `Sergeant_ops` з 7 forum-топіками. Шумний, broadcast, без діалогу.
- `@OpenClaw_sergeant_bot` (id `8614051263`) — DM founder ↔ co-founder.
  Тихий, multi-turn, з пам'яттю. Окремий чат, окремі notifications.

---

## 2. "Co-founder, не assistant" — переклад на features

| Користувацька фраза             | Технічний еквівалент                                                                                                                                                   |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "не тільки бачити метрики"      | OpenClaw читає метрики on-demand і дає **контекст** (чому падає / зростає, що робити). Не дашборд.                                                                     |
| "планували разом з ним"         | `plan-mode`: структурований діалог "ціль → варіанти → trade-offs → decision". Запис у `decisions` + git-PR з оновленим `docs/strategy/`.                               |
| "робили стратегію"              | OKR-mode + monthly review: завантажує квартальні цілі, пропонує initiatives, перевіряє progress, оспорює коли drift.                                                   |
| "аналізували"                   | `analyze-mode`: ad-hoc multi-step root-cause. `чому drop у signups вчора` → гіпотези → перевірка кожної tool-ом → ranked висновок.                                     |
| "co-founder проекту"            | Має думку, оспорює рішення, шукає blind spots, нагадує priorities, проактивний (ранкові ритуали, не reactive only).                                                    |
| "разом працювати над розвитком" | Бачить весь проект: product (PostHog, Stripe), codebase (GitHub PRs/issues/TODO), strategy (`docs/launch/`, `docs/strategy/`, ADR-и), ops (n8n, Sentry). Не один зріз. |

**Що відрізняє OpenClaw від звичайного chat-бота:** memory (через pgvector,
namespace `cofounder`), decision-log, multi-step reasoning, proactive рамки,
cross-domain знання продукту. Це робить його _партнером_, а не _інтерфейсом
до даних_.

---

## 3. Поетапний план — 4 фази

### Phase 1 — "Co-founder v0" Telegram DM bot (≈ 1 PR, ≈ 4 дні)

**Ціль:** OpenClaw у DM з founder-ом відповідає на ad-hoc питання з реальними
даними (PG / n8n / GitHub / docs). Без proactive ритмів. Без strategic mode.
Без write-tools. Read-only co-founder.

**Scope:**

- ADR-0031 "OpenClaw v0 — Telegram-only co-founder bot" (формалізувати
  рішення: окремий бот, DM-only, scope = весь проект, namespace `cofounder`).
- Зберегти `OPENCLAW_BOT_TOKEN` (ключ від `@OpenClaw_sergeant_bot`) у Railway
  env vars (production scope, org-secret).
- Витягнути `OPENCLAW_FOUNDER_TG_USER_ID` (numeric user_id founder-а) через
  `getUpdates` після першого DM до бота → зберегти у Railway env.
- Новий модуль `apps/server/src/modules/openclaw/`:
  - `loop.ts` — Plan→Act→Reflect runner (max 5 ітерацій, hard cap).
  - `prompts/cofounder.ts` — system prompt з role (co-founder, has opinions,
    challenges, holds priorities, knows product context). Versioned in git.
  - `tools/` — read-only tools:
    - `query_app_db` — параметризовані SELECT-и до Postgres (allowlist по
      таблицях, READ-ONLY роль).
    - `read_workflow_logs` — read через `n8n_API` (`/executions`).
    - `read_telegram_topic_history` — Bot API для контрол-плану.
    - `read_github` — recent PRs, open issues, TODO grep, commits since
      last review (через `Git_PAT`).
    - `read_strategy_docs` — read `docs/launch/`, `docs/strategy/`, `docs/adr/`
      (file-system на Railway або git-blob через GitHub API).
    - `recall_memory` — pgvector з `namespace='cofounder'` (окремий від
      end-user namespace).
- Новий Telegram bot service у `tools/console`:
  - Webhook handler для `@OpenClaw_sergeant_bot`.
  - DM-only enforcement (відмовляє у group chats з 1-line message).
  - Allowlist на `OPENCLAW_FOUNDER_TG_USER_ID` (fail-closed якщо не співпадає).
  - Multi-turn session per chat_id з idle-timeout (60 хв).
  - "Думаю…" typing-action під час tool-loop, edit message коли готова.
- `decisions` table + `record_decision` tool (write, але вузький — тільки
  додає рядок до журналу, не змінює бізнес-стан).
- Cost cap: `OPENCLAW_DAILY_USD_BUDGET=5`. При exceeded → fail-closed з
  повідомленням у `⚙️ Контрол-план` групи + edit reply у DM.
- Audit log — кожна команда у `openclaw_invocations` з actor (TG user_id),
  prompt, tool_calls, cost, latency.
- Dispatcher compatibility — WF-20 (`20-agent-dispatcher.json`) приймає той
  самий task envelope для `source="telegram-console"` і `source="openclaw"`.
  Це не робить OpenClaw execution layer-ом: OpenClaw формує/пояснює intent,
  а WF-20 маршрутизує dispatcher-envelope / specialist-agent work. Поточні
  OpenClaw write-tools лишаються окремим ADR-0036 path через approval-card +
  server write endpoints; WF-20 не замінює цей path. CI/test/check задачі
  маршрутизуються до `qa-release`, щоб запити на перевірку PR/CI не падали в
  generic architect lane.
- Hybrid agent network — OpenClaw free-text DM запити з execution-сигналами
  (`CI`, `PR`, `GitHub`, `n8n`, `workflow`, `security`, `deploy`) конвертуються
  у `source="openclaw"` envelope з `taskId`, `actor`, `intent`,
  `statusCallback`, `artifacts` і йдуть у WF-20. Стратегічний dialogue без
  execution-сигналів лишається в OpenClaw cofounder loop.

**Hybrid agent network status (PR #1446):**

- **Зроблено:** foundation/control-plane — unified envelope, OpenClaw conductor
  routing, WF-20 validation + specialist-lane assignment, approval boundaries,
  `statusCallback` contract, `proposedWriteTool` recommendation hook.
- **Не зроблено навмисно:** повна autonomous execution у кожному specialist
  lane. WF-20 v1 маршрутизує і повертає status/nextStep; specialist workflows ще
  не створюють end-to-end PR/issue/report самостійно.
- **Наступний етап:** оживити specialist lanes: `qa-release` → CI/PR report,
  `repo-architect` → GitHub issue/review report, `n8n-automation` → workflow
  proposal, `security` → audit report, і n8n → OpenClaw DM final callback.

**Acceptance:**

- DM до `@OpenClaw_sergeant_bot` "скільки активних користувачів сьогодні"
  → реальна цифра з PG + цитата запиту + 1 рядок інтерпретації від co-founder.
- DM "що думаєш про PR #1340" → витяг з GitHub + коментар по якості / ризиках.
- DM "нагадай що ми вирішили по B2B-пілоту" → recall з memory + цитата
  попереднього decision-id.
- Audit-log містить запис кожного виклику з PII-redacted prompt.

**НЕ робимо:**

- Web UI / HubChat інтеграція — never (per §1).
- Group-chat surface (не DM) — never (per §5).
- Proactive ритми (ранкова, weekly, monthly) — Phase 2.
- Strategic templates (plan-mode, OKR-mode) — Phase 3.
- Write-tools (mute alerts, pause workflow, commit до strategy) — Phase 4.

### Phase 1.5 — Console consolidation (Sprint 0, ADR-0032, ≈ 1 PR)

**Ціль:** OpenClaw поглинає everything-good з legacy `@sergeant_console_bot`
(ADR-0027). Один surface — DM до `@OpenClaw_sergeant_bot` — і він уміє і
говорити, і виконувати ops/marketing команди, і бачити метрики.

**Scope (зроблено):**

- 5 нових read-only tools у `apps/server/src/modules/openclaw/tools.ts`:
  - `get_stripe_metrics` — Stripe charges/MRR/refunds за вікно днів.
  - `get_sentry_issues` — open issues per severity з Sentry org.
  - `get_server_stats` — `apps/server` /healthz proxy (DB / Redis / queue).
  - `get_posthog_stats` — PostHog WAU + funnel events за період.
  - `get_github_releases` — recent merged releases з `Skords-01/Sergeant`.
    Всі — fail-soft: відсутній secret → `notConfigured: true`, не throw.
- 5 нових internal HTTP routes (`/api/internal/openclaw/metrics/{stripe,
sentry,server,posthog}` + `/api/internal/openclaw/github/releases`) з
  Zod-схемами, bearer-key, audit-логом.
- Tool definitions у `tools/console/src/agents/openclaw.ts` (тільки server-
  side виклики через `SERVER_INTERNAL_URL`, ніяких прямих SDK у боті).
- 5 нових slash-команд у DM (синтаксичний цукор поверх agent-loop):
  - `/status` — operational health (server + Sentry + Stripe).
  - `/metrics` — детальний product/revenue зріз.
  - `/digest` — daily growth-digest у тоні weekly review.
  - `/logs` — n8n workflow logs (через існуючий `read_workflow_logs`).
  - `/review` — recent merged PRs / releases / open code todos.
    Кожна команда префіл-ить prompt і йде через звичайний agent-turn з
    audit + budget cap.
- `runAgentTurn` helper у handler-і — DRY для DM і slash-команд.
- `CONSOLE_BOT_TOKEN` зроблений optional (warn-and-skip), legacy console
  гілка більше не блокує boot OpenClaw.

**Acceptance:**

- DM `/status` → одна цифра з кожного джерела + 1-line синтез.
- DM `/metrics` за тиждень → MRR-delta + WAU-delta + новий churn / signups.
- Group message → silent ignore (per ADR-0031 §2).
- Non-founder TG ID → `Access denied` + audit row.
- `audit `openclaw*invocations`має новий рядок з`tool_calls=['get*\*']`
  для кожного успішного виклику slash-команди.

**НЕ робимо у Phase 1.5:**

- Specialist personas (`/ops`, `/growth`, `/eng`, `/finance`, `/council`)
  — Phase 2.5 нижче.
- Write-tools (`/run`, `/approve`, `/cancel`, `/assign` heavy) — Phase 4.
- Окреме розгортання console — назавжди deprecated за ADR-0032; revisit
  тільки коли team scales beyond solo founder.

### Phase 2 — Proactive ритми + cofounder memory (≈ 2 PRs, ≈ 3 дні)

**Ціль:** OpenClaw перестає бути reactive. Сам ініціює діалог за розкладом
і пам'ятає історію "разом думали" для context-у наступних розмов.

**Scope:**

- **Ранковий ритуал** (08:30 Kyiv, кожного робочого дня):
  - Cron у Railway → тригерить OpenClaw в `cofounder` namespace.
  - DM message ≤ 8 рядків: ключові цифри (Stripe MRR delta · PostHog
    signups/activation · Sentry new issues · GitHub PR queue · open ops
    alerts) + **1 пропозиція** "сьогодні фокусуємо на X через Y".
  - Якщо нічого критичного — короткий "все рівно, фокус на roadmap-задачі N".
- **Friday weekly review** (18:00 Kyiv):
  - Тиждень в цифрах vs. попередній.
  - Що зробили (closed PRs, shipped features, decisions).
  - Що завалили (open commitments, missed metrics).
  - Пропозиція 2-3 priorities на наступний тиждень.
- **Monthly OKR review** (1-го числа місяця):
  - Прогрес по активних OKR з `docs/strategy/`.
  - Risks / blockers.
  - Recalibration suggestion (KR на скорочення / розширення).
- **Cofounder memory namespace** активно використовується:
  - Кожен діалог зберігає key-points у `ai_memory` з `namespace='cofounder'`.
  - System prompt при кожному запуску робить `recall_memory` для top-N
    relevant memories (decisions, OKR-state, recent discussions).
  - Auto-prune після 90 днів якщо не linked до active decision.

**Acceptance:**

- Понеділок 08:30 — DM з ранковою повісткою з реальних даних.
- П'ятниця 18:00 — DM weekly review.
- 1-го червня 09:00 — DM monthly OKR review.
- Запит "що ми вирішили 2 тижні тому по pricing-у" → relevant recall.

### Phase 2.5 — Specialist personas + "round-table" (ADR-0033, **shipped**)

**Status:** ✅ Shipped (ADR-0033, 1 PR, ≈ 2 дні roboti).

**Ціль:** OpenClaw перестає бути одним голосом. Founder може гукнути
конкретного спеціаліста (`/ops`, `/growth`, `/eng`, `/finance`, `/cofounder`)
або зібрати "нараду" з кількох голосів за одне питання (`/council`).

Це досі **один Node-процес** і **той самий OpenClaw bot** — змінюються
тільки persona-prompt + filtered toolset за командою. n8n тут не задіяний;
агенти не екстерналізуються (це за дизайном — Anthropic sub-agents pattern).

**Personas (`tools/console/src/agents/personas.ts`):**

| Persona     | Slash        | System prompt focus                         | Toolset (filtered)                                                                                   |
| ----------- | ------------ | ------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `cofounder` | `/cofounder` | default — синтез, опонент, holds priorities | **всі** tools (sentinel `null` → no-filter)                                                          |
| `ops`       | `/ops`       | reliability / incidents / n8n health        | `read_workflow_logs`, `get_sentry_issues`, `get_server_stats`, `get_stripe_metrics`, `recall_memory` |
| `growth`    | `/growth`    | activation / retention / funnels / content  | `get_posthog_stats`, `get_github_releases`, `read_strategy_docs`, `recall_memory`                    |
| `eng`       | `/eng`       | code review / PR queue / tech-debt          | `read_github`, `query_app_db`, `read_telegram_topic_history`, `get_github_releases`, `recall_memory` |
| `finance`   | `/finance`   | MRR / runway / cofounder-budget memory      | `get_stripe_metrics`, `recall_memory`, `record_decision`, `query_app_db`                             |

**Routing (shipped):**

- `/ops <q>` → primer "ти ops-engineer…" + filtered toolset → один agent-turn.
- `/growth <q>`, `/eng <q>`, `/finance <q>`, `/cofounder <q>` — те саме з власною
  персоною. Без arg-у — usage-help.
- Free-text DM без slash → default cofounder persona (back-compat).
- `/council <q>` — round-table режим (ADR-0033 §2):
  1. Sequential pre-budget check: якщо `dailySpentUsd + OPENCLAW_COUNCIL_USD_BUDGET
     > OPENCLAW_DAILY_USD_BUDGET` → council скіпається з повідомленням про headroom.
  2. Послідовно проганяємо `ops` → `growth` → `eng` → `finance` з тим самим
     prompt-ом, hard-cap iter `min(3, OPENCLAW_MAX_ITERATIONS)` на кожного.
  3. Один "synthesizer" (`cofounder` persona) бачить усі 4 відповіді як
     context і робить final-recommendation з explicit trade-offs.
  4. Кожен specialist-turn та synthesis-turn — окремий audit-row з
     `metadata.council=true` + `metadata.council_persona=<name>`.

**Acceptance (live після деплою Phase 1+2.5):**

- `/ops чого Sentry почав сипати?` → відповідь у тоні reliability-eng з
  Sentry-перевіркою.
- `/council варто запускати B2B-pilot чи поки рано?` → 4 progress-повідомлення
  ("_ops-engineer_ думає…" і т.д.) + final synthesis.
- Switch persona в межах сесії не leak-ає toolset (eng не бачить Stripe
  refunds — guarded `personas.test.ts`).
- Audit-row для кожного `council:*` invocation зберігає окремий cost і
  специфічну `metadata.council_persona`.

**НЕ робимо у Phase 2.5:**

- Persona-specific memory namespaces — лишаємо `cofounder` для всіх,
  фільтрація на rendering-time. Окремі namespace = окремий ADR.
- Concurrency у council (паралельні запити) — sequential для cost
  predictability у Phase 2.5; розглядаємо паралелізацію у Phase 4 коли є
  budget telemetry.

### Phase 3 — Strategic mode (≈ 3 PRs, ≈ 5 днів)

**Ціль:** OpenClaw стає партнером з планування і аналізу — explicit modes
для structured thinking.

**Scope:**

- `docs/strategy/` — нова директорія з YAML-frontmatter `objective`, `kr[]`,
  `current_state`, `last_review_at`. Owner — founder.
- `plan-mode` (`/plan <topic>`) — структурований діалог:
  1. **Goal** — уточнити ціль (clarifying questions).
  2. **Context** — підтягнути дані з tools + memory.
  3. **Options** — згенерувати 2–3 варіанти з trade-offs.
  4. **Decision** — записати в `decisions` + закомітити в `docs/strategy/<okr>.md`
     через write-tool (Phase 4) або поки що через manual PR-suggest.
  5. **Followup** — запланувати weekly review через cron.
- `analyze-mode` (`/analyze <anomaly>`) — multi-step root-cause:
  - Аномалія → гіпотези → кожну перевірити tool-ом → ranked висновок.
  - Output: short Telegram message + детальний report у
    `docs/postmortems/<date>-<slug>.md` (через write-tool у Phase 4).
- `okr-mode` (`/okr`) — explicit OKR session:
  - Список активних OKR з `docs/strategy/`.
  - Progress per KR.
  - Bottleneck-аналіз.
- Decision log додає Telegram-broadcast у `⚙️ Контрол-план` (опціонально,
  per founder pref) для прозорості майбутньому team-у.

**Acceptance:**

- `/plan churn-reduction-q3` → 4-step session → PR з `docs/strategy/churn-q3.md`.
- `/analyze падіння signups вчора` → гіпотези + докази +
  `docs/postmortems/<date>-signups-drop.md`.
- `/okr` → дашборд з 3 OKR і прогресом.

### Phase 4 — Write-tools з approval flow (ADR-0036, **shipped**)

**Ціль:** OpenClaw може діяти, не тільки думати — кожна mutating дія
потребує human-approval inline (per ADR-0027 + ADR-0036).

**Архітектура:** [ADR-0036](../../adr/0036-openclaw-write-tools-with-approval.md) — server-side
endpoints + console-side `ApprovalStore` (in-memory, 10-min TTL) + executor
interception (`createOpenClawToolExecutor` детектить write-tool name → queue
до `PendingApprovalsCollector` → handler `drain()` після turn-у → пост inline-keyboard
кар-ток з `oc:approve:<id>` / `oc:reject:<id>` callback-data) +
`bot.on("callback_query:data")` handler з founder-allowlist-перевіркою.

**Scope (shipped):**

- 5 write-tools з founder-approval gate-ом:
  - `commit_to_strategy_doc` — open GitHub PR з оновленням файлу у
    `docs/strategy/**` (path allowlist на server-стороні).
  - `create_github_issue` — open GitHub issue з title / body / labels.
  - `post_to_topic` — broadcast у Telegram supergroup forum-topic
    (alias allowlist: `ops`, `engineering`, `growth`, `incidents`,
    `revenue`, `meta`, `digest`).
  - `pause_workflow` — deactivate n8n workflow через REST API.
  - `mute_alert` — Sentry issue → ignored status.
- Server endpoints `/api/internal/openclaw/write/*` (5 routes), захищені
  `INTERNAL_API_KEY` Bearer + Zod-валідацією; fail-soft на missing
  creds (`status: "not_configured"` замість 500).
- Persona-tool-filter extend-нутий per-write-tool: `cofounder` бачить
  усі 5; `ops` — `pause_workflow` + `mute_alert` + `post_to_topic`;
  `growth` — `commit_to_strategy_doc` + `create_github_issue` +
  `post_to_topic`; `eng` — `create_github_issue` + `post_to_topic`;
  `finance` — `commit_to_strategy_doc`.

**Acceptance:**

- OpenClaw запропонував "паузнути WF-15" → у DM приходить approval-card
  з підсумком input-у і кнопками `✅ Approve` / `✋ Reject` → founder
  натискає Approve → console робить POST `/api/internal/openclaw/write/pause-workflow`
  → відповідь posted у DM (workflow deactivated).
- OpenClaw в free-text DM пропонує `commit_to_strategy_doc` →
  approval-card → Approve → server відкриває GitHub PR → URL у DM.
- Без user-click нічого мутуючого не відбувається (`createOpenClawToolExecutor`
  fail-closed: якщо `approvalStore` / `pendingCollector` не передані у `deps` —
  executor повертає `WRITE_TOOL_REJECTED_LITERAL`, ніколи не виконує
  HTTP-call).
- Approval expired (>10 min) / unknown id → callback handler відповідає
  "Approval expired or unknown" і видаляє кнопки.

**Phase 4.5 (shipped — ADR-0037):**

- `openclaw_write_audit` DB-таблиця — append-only лог approve/reject/executed
  transitions, переживає рестарт console-у. Console callback handler пише
  через `POST /api/internal/openclaw/write-audit/log`.
- `/audit [tool] [action] [limit]` slash-команда у DM — останні 20 (default)
  write-actions з опційними фільтрами по tool-name + action.
- Persona stamping: записуємо `persona` (cofounder | ops | growth | eng |
  finance) у audit-row для post-mortem queries за specialist-у.

**Phase 4.5 follow-ups (deferred):**

- "Approve all" мета-кнопка для batch-approval-у одного turn-у.
- Diff-preview для `commit_to_strategy_doc` (зараз — тільки path + summary
  у card-body).
- DB-persistence pending approvals (Phase 5 multi-operator).
- `/audit since=<duration>` + `--csv` export. Roadmapped у
  [telegram-improvements-roadmap.md §3.3](./telegram-improvements-roadmap.md#33-audit-since--csv-export).

**Telegram surfaces — extended roadmap:** ширший план покращень обох ботів
(OpenClaw DM + `@Sergeant_alert_bot` supergroup) з 4-wave PR-плануванням —
див. [telegram-improvements-roadmap.md](./telegram-improvements-roadmap.md).

---

## 4. Архітектурні рішення

### 4.1 Stack — використовуємо те, що є

| Layer         | Component                                                                                  | Чому це                                                                                               |
| ------------- | ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| LLM           | Anthropic Claude (вже у `/api/chat` як reference impl)                                     | Tool-use в API native; cost reasonable; opinionated tone легше через system prompt                    |
| Embeddings    | Voyage 3.5-lite (1024-dim, multilingual)                                                   | Уже працює per ADR-0028                                                                               |
| Memory        | pgvector + HNSW + halfvec(1024), namespace `cofounder`                                     | Уже працює per ADR-0028; ізоляція від end-user пам'яті                                                |
| DB            | Railway Postgres (head app)                                                                | Існуючий instance                                                                                     |
| Cache / queue | Postgres (для `openclaw_invocations`)                                                      | Без redis, простіше                                                                                   |
| Surface       | Telegram DM з `@OpenClaw_sergeant_bot` (id `8614051263`, окремо від `@Sergeant_alert_bot`) | Чистий UX: alerts і co-founder dialogue розділені; можна mute alerts і не пропускати OpenClaw         |
| Bot service   | `tools/console` (розширити існуючий entry, додати другий webhook)                          | Уже є для `@Sergeant_alert_bot`; додати другий handler з різними системними prompt-ами і tool-set-ами |
| Scheduler     | Railway cron                                                                               | Простіше за n8n cron для self-contained ритуалів                                                      |

### 4.2 Cost model — за що $5/добу

Anthropic Claude 3.5 Sonnet pricing: ~$3/M input tokens, ~$15/M output tokens.

Типові OpenClaw сесії:

| Use-case                          | Iterations | Tokens (in / out) | Cost       |
| --------------------------------- | ---------- | ----------------- | ---------- |
| Ранкова повістка (single-shot)    | 1          | ~5K / 1K          | $0.10–0.30 |
| Ad-hoc DM ("чому drop у signups") | 3–5        | ~15–25K / 2–7K    | $0.05–0.18 |
| Plan-mode session (`/plan`)       | 5–8        | ~30–50K / 5–10K   | $0.40–0.80 |
| Friday weekly review              | 2–3        | ~10K / 2K         | $0.30–0.50 |
| Monthly OKR review                | 3–5        | ~15K / 3K         | $0.40–0.70 |

$5/добу = **30–50 інтеракцій з buffer-ом**. Достатньо на: ранкова + 20-30
ad-hoc DM-ів + 1 weekly review (раз на тиждень) + ad-hoc plan-mode
session кожні 2-3 дні.

Чому саме $5:

- Менше ($1–2): не вистачить на active планувальну сесію.
- Більше ($10–20): дозволяє забути про ліміт; не потрібно на старті.
- $5 — sweet spot.
- Hard-cap fail-closed → exceeded → OpenClaw mute з message у `⚙️ Контрол-план`
  до ручного reset.
- Конфігурабельно — `OPENCLAW_DAILY_USD_BUDGET=10` коли треба.

### 4.3 Resolved decisions (2026-05-02 by @Skords-01)

Всі 6 open questions для Phase 1 закриті. Канонічна референція цих рішень —
[ADR-0031](../../adr/0031-openclaw-v0-telegram-cofounder.md). Реплікація сюди
для self-contained roadmap-у.

1. **Memory namespace — strict isolation.** OpenClaw читає / пише тільки
   `source='cofounder'` у `ai_memories`. Product insight ("що юзери
   питають у HubChat") дістається через aggregated PostHog/Stripe queries
   — ніколи через прямий доступ до end-user memory. Реалізація: tool
   `recall_memory` хардкодить `sources=['cofounder']`; будь-який intent
   зачитати інший namespace → fail-closed з логом у
   `openclaw_invocations.error_message`.
2. **Decision log — Postgres + git markdown (обидва).** `record_decision`
   tool виконує атомарно дві дії: (a) `INSERT` у `openclaw_decisions`
   (operational query) + (b) suggest-PR з новим файлом
   `docs/decisions/<YYYY-MM-DD>-<slug>.md` (audit-friendly, immutable).
   Telegram broadcast у `⚙️ Контрол-план` — окремо за §6.
3. **Strategy-docs ownership — завжди suggest-PR.** OpenClaw ніколи не
   commit-ить напряму у `docs/strategy/` чи `docs/launch/`. У Phase 1
   єдиний write-tool — `record_decision`, і він теж відкриває PR (не push
   у main). Phase 4 може додати inline-button approval flow для авто-
   commit, але це окремий ADR.
4. **Cofounder tone — context-aware mixed.** System prompt інструктує
   diplomatic-mode для product/strategy питань (`"я бачу інший варіант,
варто розглянути X через Y"`) і direct-mode для ops/incidents
   (`"це може провалитися через X. перевір Y перед тим як рухатись"`).
   Селектор — heuristic на keyword-ах user-message-а (`"стратегія",
"плани", "розглянути"` → diplomatic; `"5xx", "deploy", "down",
"incident"` → direct). Каліброване на 5 реальних діалогах у Phase 1
   stabilization window.
5. **Daily ritual schedule — env-driven.** TZ-aware cron parsing:
   `OPENCLAW_DAILY_MORNING_AT="08:30 Europe/Kyiv"` (default),
   `OPENCLAW_WEEKLY_REVIEW_AT="Fri 18:00 Europe/Kyiv"`,
   `OPENCLAW_MONTHLY_OKR_AT="1 09:00 Europe/Kyiv"`. Зміна без deploy. Phase 2
   wires actual scheduler (BullMQ repeatable jobs); Phase 1 тільки фіксує env.
6. **Ops broadcast — selective transparency.**
   - Phase 2 weekly review + monthly OKR insights → авто-broadcast у
     `📊 Дайджести` topic (`TELEGRAM_TOPIC_DIGEST`).
   - Daily morning ritual + ad-hoc DM dialogue → DM до founder-а only
     (privacy preserved).
   - Конфігурабельно через `OPENCLAW_BROADCAST_MODE=dm|digest|all` (default
     `digest` за цим рішенням).

---

## 5. Anti-patterns — чого НЕ робимо

- **Web HubChat surface для OpenClaw** — never. HubChat для end-користувача;
  OpenClaw для founder-а у Telegram. Two different audiences, two different
  products.
- **Той самий bot для alerts і co-founder dialogue** — never. Окремий
  `@OpenClaw_sergeant_bot` для DM щоб не змішувати noise з deep dialogue.
- **Group chat для OpenClaw** — never (поки що). DM-only. Group context
  отруює tone (бот стає "performance-mode"). Якщо колись потрібно — окрема
  фіча "OpenClaw broadcast" у Phase 4 через write-tool з approval.
- **Власний LLM hosted on Railway** — overkill, дорого.
- **Перейти з Anthropic на OpenAI** — без причини; Claude tool-use працює
  добре і opinionated tone легше через system prompt.
- **Задепрекейтити n8n і робити все через OpenClaw** — n8n потрібен для
  детермінованих pipeline-ів. OpenClaw — синтез і dialogue.
- **Vector DB окрім pgvector** — ADR-0028 вже зафіксував Postgres backend.
- **Front-end-heavy "OpenClaw dashboard"** — суть саме у conversational
  interface через Telegram, не у UI dashboards. Founder уже має HubDashboard
  для мет-візуалізації.

---

## 6. Час до першого working slice

| Phase                 | Estimated    | Перший value-deliver                                                                                      |
| --------------------- | ------------ | --------------------------------------------------------------------------------------------------------- |
| Phase 1               | 4 дні        | OpenClaw у DM з `@OpenClaw_sergeant_bot` відповідає на ad-hoc питання з PG / n8n / GitHub / strategy docs |
| Phase 2               | + 3 дні      | Ранкова 08:30 повістка + Friday weekly + monthly OKR review + cofounder memory                            |
| Phase 3               | + 5 днів     | `/plan` + `/analyze` + `/okr` modes                                                                       |
| Phase 4               | + 5 днів     | Write-tools з inline approval (commit до strategy, github issue, mute alert, broadcast)                   |
| **MVP (Phase 1 + 2)** | **≈ 7 днів** | Co-founder у Telegram з proactive ритмами і реальними даними                                              |

---

## 7. Що треба, щоб почати Phase 1

1. Відповідь на 6 open questions у §4.3.
2. Підтвердження "Phase 1, починай".
3. ✅ `OPENCLAW_BOT_TOKEN` (token від `@OpenClaw_sergeant_bot`) — отриманий від
   founder-а через secure channel; зберігається як org-scope secret.
4. Передати `OPENCLAW_FOUNDER_TG_USER_ID` (твій Telegram numeric user_id —
   витягнемо через `getUpdates` після першого DM до `@OpenClaw_sergeant_bot`).
5. Все інше (`n8n_API`, `voyage`, `Git_PAT`, `posthog_api`, `sentry`,
   ai-memory infra, Railway Postgres) — уже є у secrets / репі.

Як тільки буде "ок Phase 1, починай" + відповіді на 6 q's — створюється
окремий feature-PR з ADR-0031, скелетом `apps/server/src/modules/openclaw/`,
новим webhook handler у `tools/console`, Railway env додатками. Все за §3.1.
