# ADR-0031: OpenClaw v0 — Telegram-only co-founder bot

- **Status:** Accepted
- **Date:** 2026-05-02
- **Deciders:** @Skords-01
- **Supersedes:** —
- **Related:**
  - [ADR-0027 — OpenClaw / Console / MCP policy](./0027-openclaw-console-mcp-policy.md) — security policy (allowlist, fail-closed, read-only by default).
  - [ADR-0028 — pgvector AI memory](./0028-pgvector-ai-memory.md) — vector store backend.
  - [ADR-0030 — Telegram reporting structure](./0030-telegram-reporting-channel-structure.md) — supergroup + topics layout.
  - [`docs/launch/openclaw-roadmap.md`](../launch/openclaw-roadmap.md) — phasing + scope.
  - [`docs/launch/05-operations-and-automation.md`](../launch/05-operations-and-automation.md) — operations architecture.

---

## Context

OpenClaw — це майбутній co-founder AI-помічник для founder-а Sergeant (solo
founder для початку). Він **не** end-user-facing продукт (для них є HubChat),
**не** dashboard (для цього HubDashboard), **не** ops-bot (для цього
`@Sergeant_alert_bot` + `tools/console`). Це **deep-dialogue** партнер для
strategic thinking — синтезує дані з PG / n8n / GitHub / strategy docs у
відповіді на ad-hoc питання founder-а в Telegram DM.

ADR-0027 зафіксував security policy (allowlist, fail-closed, read-only
default) і сформував dependency-список (Anthropic, pgvector, Voyage,
Telegram bot framework, n8n metadata). Roadmap-PR
[#1364](https://github.com/Skords-01/Sergeant/pull/1364) запропонував 4-фазний
план з ~60% existing infra і 40% pending implementation. До цього ADR — 6
open questions у §4.3 roadmap-у блокували старт Phase 1, бо саме вони
визначали, ЩО будувати: чи OpenClaw має доступ до end-user memory, куди
писати decision log, як обробляти strategy docs, який tone, який schedule,
куди broadcast-ити insights.

Цей ADR закриває всі 6 questions і фіксує v0 scope.

## Decision

**v0 scope = read-only co-founder bot у Telegram DM до founder-а.** Все
інше (group chats, web surface, write-tools без approval, auto-commit)
свідомо залишено поза scope і потребуватиме окремого ADR.

### Architectural boundaries

1. **Surface — Telegram DM only.**
   - Bot: `@OpenClaw_sergeant_bot` (id `8614051263`). Окремий від
     `@Sergeant_alert_bot` (id `7949536379`) щоб не змішувати alert-noise з
     deep dialogue.
   - DM-only enforcement у webhook handler — будь-який group/supergroup
     update → 1-line reply "OpenClaw — DM only" + early return.
   - Group chat для OpenClaw — never у v0. Якщо потрібно — окрема фіча
     "OpenClaw broadcast" у Phase 4 через write-tool з approval.

2. **Allowlist — single founder.**
   - `OPENCLAW_FOUNDER_TG_USER_ID` (Telegram numeric user_id) — single
     value у Phase 1, comma-separated set у Phase 2+ (якщо команда виросте).
   - `OPENCLAW_FOUNDER_USER_ID` (Better Auth user.id) — потрібен для
     `ai_memories.user_id` joins (pgvector partition key).
   - Fail-closed: будь-який update від не-founder-а → log + drop без
     reply (щоб не leak-ати existence бота).

3. **Memory namespace — strict isolation.**
   - OpenClaw читає / пише лише `source='cofounder'` у `ai_memories`.
   - Tool `recall_memory` хардкодить `sources=['cofounder']`. Будь-який
     intent зачитати інший namespace → fail-closed з логом.
   - Product insight ("що юзери питають у HubChat") дістається через
     aggregated PostHog/Stripe queries — НІКОЛИ через прямий доступ до
     end-user memory. Це зберігає trust contract з end-користувачами:
     їхні chat-логи не використовуються як training data для
     co-founder-bot-а.
   - Migration `028_openclaw.sql` додає `'cofounder'` у
     `ai_memories_source_check` (раніше set був `chat | finyk | fizruk |
nutrition | routine | journal | digest`).

4. **Decision log — обидва: Postgres + git markdown.**
   - `record_decision` tool виконує атомарно дві дії:
     - (a) `INSERT` у нову таблицю `openclaw_decisions` (operational
       query, immediate availability у наступному prompt-context-і);
     - (b) suggest-PR через GitHub API з новим файлом
       `docs/decisions/<YYYY-MM-DD>-<slug>.md` (audit-friendly,
       immutable, reviewable).
   - **Не** prograte commit у main — лише PR. Founder сам merge-ає.
   - Telegram broadcast у `⚙️ Контрол-план` — окремо, у Phase 2 (з
     control-plane роздумів).

5. **Strategy-docs ownership — завжди suggest-PR.**
   - OpenClaw ніколи не commit-ить напряму у `docs/strategy/`,
     `docs/launch/`, або `docs/adr/`.
   - У v0 єдиний write-tool — `record_decision`. Все інше тільки read.
   - Phase 4 може додати inline-button approval flow для авто-commit
     після founder-pressed "Approve", але це окремий ADR (потенційно
     ADR-0034 чи новіший).

6. **Cofounder tone — context-aware mixed.**
   - System prompt інструктує **diplomatic-mode** для product/strategy
     питань: `"я бачу інший варіант — варто розглянути X через Y"`.
   - System prompt інструктує **direct-mode** для ops/incidents:
     `"це може провалитися через X. перевір Y перед тим як рухатись"`.
   - Селектор-heuristic на keyword-ах user-message-а: - diplomatic: `"стратегія" | "план" | "розглянути" | "ідея" | "OKR" |
"vision" | "продукт" | "user" | "growth"` - direct: `"5xx" | "down" | "incident" | "deploy" | "fail" | "error" |
"broken" | "regression"` - default: diplomatic (більшість founder-tasks-ів — strategic).
   - Каліброване на 5 реальних діалогах у Phase 1 stabilization window
     (перші 7 днів після deploy). Якщо tone збиває — рев'ю system
     prompt, не переписувати селектор.

7. **Cost cap — hard fail-closed.**
   - `OPENCLAW_DAILY_USD_BUDGET=5` (default).
   - Pre-call check: денний tally з `openclaw_invocations.cost_usd`. Якщо
     `today_total + estimated_call_cost > budget` → fail-closed з reply
     `"OpenClaw quota exceeded for today. Resume tomorrow."`
   - Reset о 00:00 Europe/Kyiv (через date_trunc у query).
   - На відміну від `ai_usage_daily` (per-user квота) — це global
     OpenClaw budget, не per-user, бо user — один.

8. **Audit log — `openclaw_invocations`.**
   - Кожен invoke (tool-loop iteration count, всі tool-calls, total
     cost, duration, status, error). Retention — без TTL у v0; manual
     prune якщо знадобиться.
   - Запис **завжди** — навіть при `budget_exceeded`, `iteration_cap`,
     allowlist-fail. Це даєтрейс "що зроблено від мого імені" і базис
     для post-mortem-ів.

9. **Schedule — env-driven, Phase 2 wires actual cron.**
   - `OPENCLAW_DAILY_MORNING_AT="08:30 Europe/Kyiv"` (default).
   - `OPENCLAW_WEEKLY_REVIEW_AT="Fri 18:00 Europe/Kyiv"`.
   - `OPENCLAW_MONTHLY_OKR_AT="1 09:00 Europe/Kyiv"` (1-е число місяця).
   - Phase 1 — env присутній, schedule **не** wired (BullMQ repeatable
     jobs додаються у Phase 2 окремим PR).

10. **Broadcast — selective transparency.**
    - `OPENCLAW_BROADCAST_MODE=dm | digest | all` (default `digest`).
    - `dm`: всі insights — лише DM до founder-а.
    - `digest`: weekly review + monthly OKR auto-broadcast у
      `📊 Дайджести` (`TELEGRAM_TOPIC_DIGEST`); daily ritual + ad-hoc DM
      залишаються тільки в DM.
    - `all`: усе у `📊 Дайджести` (для майбутньої team-у).
    - Знов: Phase 2 wires actual broadcast; Phase 1 — env присутній,
      broadcast **не** реалізований.

### Tools (read-only crew + одне обмежене write)

| Tool                          | Direction      | Backend                   | Notes                                                                 |
| ----------------------------- | -------------- | ------------------------- | --------------------------------------------------------------------- |
| `recall_memory`               | read           | pgvector via internal API | hardcode `source='cofounder'`                                         |
| `read_strategy_docs`          | read           | filesystem (server-side)  | path-allowlist (`docs/strategy/`, `docs/launch/`, `docs/adr/`)        |
| `read_github`                 | read           | GitHub REST               | `Git_PAT`, recent PRs / open issues / commits                         |
| `query_app_db`                | read           | Postgres readonly         | parameterized SELECT only, table-allowlist                            |
| `read_workflow_logs`          | read           | n8n REST                  | `n8n_API`, `/executions` endpoint                                     |
| `read_telegram_topic_history` | read           | Telegram Bot API          | limited capability (Bot API не дає історію) — у v0 stub з clear error |
| `record_decision`             | write (narrow) | Postgres + GitHub PR      | INSERT + open PR з markdown                                           |

### Dispatcher compatibility

OpenClaw v0 не замінює n8n dispatcher і не виконує production mutations
самостійно. Для сумісності з Telegram-controlled agent dispatcher payload має
явне поле `source`, яке може бути:

- `telegram-console` — команди з основного Sergeant Console bot-а;
- `openclaw` — founder-DM / OpenClaw-originated task envelope.

Це дає n8n WF-20 і downstream specialist-agent workflows змогу відрізняти
людську console-команду від OpenClaw-originated запиту без зміни решти contract:
`commandText`, `action`, `specialist`, `riskTier`, `mode`, `requiresApproval`,
`telegram.userId`, `telegram.chatId`, `telegram.messageId`.

Hybrid agent-network contract розширює envelope полями `taskId`, `actor`,
`intent`, `approvalId`, `statusCallback` і `artifacts`. OpenClaw використовує
цей contract як conductor: execution-like DM запити (CI/PR/GitHub/n8n/security)
йдуть у WF-20, а стратегічний cofounder dialogue лишається в OpenClaw loop.

У v0 OpenClaw лишається read-only co-founder bot-ом. Для поточного main важливо
не змішувати два execution paths: WF-20 покриває dispatcher-envelope /
specialist-agent routing, а Phase 4 write-tools описані в ADR-0036 і виконуються
через console-side approval + `/api/internal/openclaw/write/*` endpoints.

Інваріант один для обох шляхів: будь-яка mutating дія повинна пройти explicit
founder approval у Telegram, мати audit trail, і тільки після цього може
продовжити execution. `source="openclaw"` є audit/routing metadata, а не
дозволом на silent writes.

`query_app_db` table-allowlist (read-only role, parameterized only):

- `subscriptions`, `payments`, `users`, `digest_runs`, `n8n_errors`,
- `routines`, `mono_transactions`, `nutrition_entries`,
- `openclaw_decisions`, `openclaw_invocations` (для self-introspection).

Forbidden tables: `auth_*`, `ai_usage_daily`, `ai_memories`,
`sync_op_log`, `sync_audit_log`, anything containing PII у raw form
(emails, hashed passwords, push tokens). Allowlist — у
`apps/server/src/modules/openclaw/tools.ts` як constant set.

### Iteration cap + observability

- `OPENCLAW_MAX_ITERATIONS=8` (default). Hard cap у Plan→Act→Reflect
  loop. При reach → fail-closed з `status='iteration_cap'`.
- Sentry: всі errors у tool-execution → `Sentry.captureException` з
  `invocation_id` як tag.
- Logger: pino-структуровані логи `openclaw_invocation_*` — debug у dev,
  info у prod.

## Consequences

### Positive

- **Zero blast-radius на end-user-ів.** Strict isolation памяті +
  read-only tools + suggest-PR-only writes означає, що OpenClaw не може
  мутувати product state без human-in-the-loop. Перший день у prod —
  жодного ризику corruption-у.
- **Audit-by-design.** `openclaw_invocations` + git PR-trail для
  decisions — кожна дія traceable.
- **Re-use existing infra.** Voyage embeddings, pgvector, Anthropic
  client, console grammy-stack, n8n credentials — все вже є. Phase 1 —
  лише proxy + новий tool-set.
- **Tone calibration через prompt.** Heuristic-based mode-switching —
  cheap, debuggable, можна крутити без дев-рев'ю tool-кода.
- **Cost-bounded.** $5/день hard cap = ~$150/міс upper bound. Якщо
  founder активно crunching — підняти до $10/день. Без surprise bill.

### Negative / debt

- **Telegram Bot API не дає історії topic-ів.** Tool
  `read_telegram_topic_history` у v0 — фактичний stub, повертає clear
  error `"Telegram Bot API не підтримує історію. Use /api/internal/openclaw/digest для останніх N alerts."` Roadmap — або мігрувати на MTProto-based
  client (overkill для одного use-case-у), або додати n8n-side
  message-archive workflow → query через `query_app_db`.
- **Нема machine-validation tone-mode-у.** Heuristic-keyword матч —
  brittle. Якщо founder напише `"плани на крах сервера"` — keyword
  `"плани"` виграє і tone буде diplomatic. Acceptable у v0; revisit
  після 5-діалог-window.
- **GitHub PR-suggestion для decision log потребує fork-а / branch-а.**
  Реалізація: OpenClaw створює feature branch `openclaw/decision-<slug>`
  через GitHub API + opens PR. Це означає, що `Git_PAT` має
  `contents:write` permission. Не fail-closed — якщо GitHub API
  недоступний, decision все одно пишеться у Postgres з flag
  `git_pr_pending=true`; retry — manual через admin endpoint у Phase 2.
- **Founder як SPOF.** Одна-людина-allowlist означає, що якщо founder
  втратить Telegram-доступ — OpenClaw не може bootstrap-нутися (немає
  emergency reset). Acceptable risk solo; revisit при team-grow.

### Re-evaluation triggers

- Команда виросла > 1 active operator → multi-allowlist + per-user
  budget.
- Cost > $10/day для трьох тижнів поспіль → revisit prompt economy
  (memory-prefill, smaller model для warm-up).
- Heuristic tone-mode неправильно вибрав ≥ 3 рази у 50 діалогах →
  переходимо на explicit `/diplomatic` / `/direct` slash-команди.
- End-user product-feature potрibує OpenClaw insight-у (наприклад,
  "founder-recommendation-of-the-week") → новий ADR з explicit
  cross-namespace policy.

## Alternatives considered

### A. Web surface для OpenClaw (вбудувати в HubChat)

- ❌ Поганий UX: deep dialogue з cofounder-ом найкраще працює в
  conversational interface, не у вебі поряд з product UX. Telegram —
  always-available, mobile-first, з notifications.
- ❌ Mixed audience: HubChat — для end-user-ів. Розкривати founder-mode
  через role-switch — leak attack surface.
- ❌ Web push не працює надійно на iOS Safari (background tab
  restriction). Telegram push — нативний, пройдений у тестах.

### B. Той самий `@Sergeant_alert_bot` для alerts і dialogue

- ❌ Tone collision: alert-bot — performance-mode, transactional. Cofounder
  bot — reflective, dialogic. Перемикання у одному chat-і робить
  обидва гірше.
- ❌ Allowlist-policy різниться: alert-bot — admin у supergroup, OpenClaw
  — DM-only. Single bot з double-policy — фрагільно.
- ❌ Audit trail розмивається: `openclaw_invocations` має filtri-tись
  від alert-payload-ів.

### C. Self-hosted LLM (Llama / Mistral) на Railway

- ❌ Cost: GPU-шотун Railway не має; зовнішній GPU-host (Modal, Replicate)
  для 1 user-а на 8GB VRAM модель → ~$200/міс idle + spin-up latency.
  Anthropic — pay-per-token, $5/день.
- ❌ Quality: Claude Sonnet 4.6 + tool-use beats будь-яку open-source
  модель з reasoning-ом для strategic dialogue (на момент 2026-Q2).
- ✅ Якщо політика змінилась би (data exfiltration concerns у solo
  founder-а — низький ризик) — revisit.

### D. Auto-commit у `docs/strategy/` без PR-flow

- ❌ Founder втрачає review-step. AI може помилитись у фактах,
  узагальнити неправильно. PR як safety net — низькоцінна затримка
  (founder бачить notification + merge у 30сек).
- ❌ Audit trail розмивається з прямим commit-ом (немає commit-author
  розрізнення `OpenClaw <bot>` vs founder).

### E. Skip Phase 1, починати з Phase 2 (proactive ритми відразу)

- ❌ Без stabilization window на ad-hoc dialogue, prompt-tone-tuning не
  валідований. Перший Friday-review без warm-up = шум, який founder
  ігнорує.
- ❌ Schedule wire-up складніший (BullMQ repeatable jobs + TZ parsing) —
  додавати разом з основним flow збільшує risk нестабільної першої
  doставки.

## Implementation checklist (Phase 1)

- [ ] Migration `028_openclaw.sql` + `.down.sql`:
  - ALTER `ai_memories_source_check` to add `'cofounder'`.
  - CREATE TABLE `openclaw_decisions`.
  - CREATE TABLE `openclaw_invocations`.
- [ ] Server: `apps/server/src/modules/openclaw/` skeleton (store, tools,
      types).
- [ ] Server: `apps/server/src/routes/internal/openclaw.ts` — 5 routes
      (recall, strategy-docs, query, decisions, invocations) behind
      `INTERNAL_API_KEY`.
- [ ] Console: `tools/console/src/agents/openclaw.ts` — agent definition
      with 7 tools (6 read + 1 narrow write).
- [ ] Console: `tools/console/src/openclaw/` — bot handler (DM-only
      enforcement, allowlist, multi-turn session, budget pre-check).
- [ ] Console: refactor `tools/console/src/index.ts` → run two bots in
      parallel (Console for ops/marketing, OpenClaw for cofounder).
- [ ] Env additions у `apps/server/src/env.ts` + `.env.example` +
      `tools/console/.env.example`.
- [ ] `OPENCLAW_BOT_TOKEN` (org secret у Railway prod).
- [ ] `OPENCLAW_FOUNDER_TG_USER_ID` (отримати через `getUpdates` після
      першого DM до бота).
- [ ] Tests: allowlist (DM-only, founder-only), `query_app_db` table
      allowlist, budget cap, recall namespace isolation.
- [ ] Update `docs/launch/openclaw-roadmap.md` §4.3 → Resolved decisions
      (link до цього ADR).
- [ ] Update `tools/console/README.md` — другий bot.
- [ ] CHANGELOG entry.

## Related

- [ADR-0027 — OpenClaw / Console / MCP policy](./0027-openclaw-console-mcp-policy.md)
- [ADR-0028 — pgvector AI memory](./0028-pgvector-ai-memory.md)
- [ADR-0030 — Telegram reporting structure](./0030-telegram-reporting-channel-structure.md)
- [`docs/launch/openclaw-roadmap.md`](../launch/openclaw-roadmap.md)
