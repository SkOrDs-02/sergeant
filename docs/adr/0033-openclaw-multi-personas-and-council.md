# ADR-0033: OpenClaw multi-personas + `/council` round-table

- **Status:** Accepted
- **Date:** 2026-05-02
- **Deciders:** @Skords-01
- **Supersedes:** —
- **Related:**
  - [ADR-0027 — OpenClaw / Console / MCP policy](./0027-openclaw-console-mcp-policy.md)
  - [ADR-0030 — Telegram reporting structure](./0030-telegram-reporting-channel-structure.md)
  - [ADR-0031 — OpenClaw v0 Telegram co-founder bot](./0031-openclaw-v0-telegram-cofounder.md)
  - [ADR-0032 — Console consolidated into OpenClaw](./0032-console-consolidated-into-openclaw.md)
  - [`docs/launch/openclaw-roadmap.md`](../launch/openclaw-roadmap.md) — Phase 2.5 section.

---

## Context

ADR-0032 консолідував усі founder-команди в OpenClaw (single bot, single audit-pipeline). У результаті OpenClaw отримав 12 read-tools, які покривають Stripe / Sentry / PostHog / GitHub / n8n / strategy docs / cofounder memory / decisions / app DB / engineering Telegram topic. Проте всі команди (`/status`, `/metrics`, `/digest`, `/logs`, `/review`, free-text) рендеряться **одним system-prompt-ом** з **повним tool-set-ом**, що породжує два сорти проблем:

1. **Cross-domain noise.** Питання "у нас 5xx у /api/billing" не вимагає PostHog або strategy docs, але LLM усе одно бачить їхні tool-schemas у context-і. Це коштує токенів і інколи провокує irrelevant tool-call-и (LLM "перевірить growth-данні про всяк випадок").
2. **Single voice — обмежує structure.** Founder іноді хоче не одну "синтезовану" відповідь, а **round-table** (опс-думка → growth-думка → інженерна думка → фінансова думка → синтез). Поточна архітектура примушує робити це сирими prompt-ами ("уяви, ти — ops-engineer, відповідай на… а тепер ти — growth"), що ламається після 1-2 turn-ів і залишає audit-row без structured tool-call-ів.

Sprint 0 (ADR-0032) явно лишив persona-режим у `Phase 2.5` секції roadmap-у. Цей ADR закріплює архітектуру до того, як ми його шипимо.

## Decision

OpenClaw отримує **multi-persona layer** і **`/council` round-table mode**, обидва як композиція над поточним agent-loop-ом — без зміни server-side tool-схем, audit-table, або budget-cap-логіки.

### 1. Persona registry (`tools/console/src/agents/personas.ts`)

Існує 5 personas, всі read-only:

| Persona     | Slash        | Default-фокус                                                         | Tools                                                                                                |
| ----------- | ------------ | --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `cofounder` | `/cofounder` | Default; синтез думок + утримання priorities                          | **all** (повний `openClawTools`)                                                                     |
| `ops`       | `/ops`       | Reliability, incidents, n8n health, deployment stability              | `read_workflow_logs`, `get_sentry_issues`, `get_server_stats`, `get_stripe_metrics`, `recall_memory` |
| `growth`    | `/growth`    | Activation, retention, funnels, content strategy, GitHub releases     | `get_posthog_stats`, `get_github_releases`, `read_strategy_docs`, `recall_memory`                    |
| `eng`       | `/eng`       | Code review, PR queue, tech-debt, schema migrations                   | `read_github`, `query_app_db`, `read_telegram_topic_history`, `get_github_releases`, `recall_memory` |
| `finance`   | `/finance`   | MRR, runway, cofounder budget memory, Stripe revenue/refund breakdown | `get_stripe_metrics`, `recall_memory`, `record_decision`, `query_app_db`                             |

Persona-level invariants:

- **Persona primer prepend-иться до system-prompt-у** перед звичайним COMMON-prefix-ом і tone-mode body. Один абзац на 3-5 рядків, який задає роль, тон і "м'який handover" на іншу персону для off-topic питань. Tone-mode (`direct` vs `diplomatic`) лишається orthogonal — `selectToneMode()` як був.
- **Tool-filter sealed at agent-loop boundary.** `filterToolsForPersona(openClawTools, persona)` запускається перед `runAgentLoop()`. LLM фізично не бачить tools поза allowlist-ом — це cost win (менше schema у context-і) і guard від cross-persona leak.
- **Cofounder = no-filter.** `PERSONA_TOOL_FILTER.cofounder = null` (sentinel). Кожен новий tool у `openClawTools` автоматично доступний default-персоні без оновлень reg-у. Specialist allowlist-и треба явно extend-ити, коли додається relevant tool — це навмисне friction, щоб persona-scope не drift-ив.
- **Unknown persona → empty tool list.** `filterToolsForPersona` fail-closed: якщо рядок не валідна persona (рідкісний кейс — env-config drift), LLM не отримує жодного tool. Better silent under-availability, ніж accidental over-permission.
- **Memory namespace lишається `cofounder`.** ADR-0028 pgvector-namespace-и не міняються. Persona-фільтрація — runtime-detail, не data-isolation. Founder ділить один shared-memory-простір між всіма персонами.

### 2. `/council` round-table (sequential)

`/council <питання>` запускає **sequential** прохід через 4 specialist-personas (`ops` → `growth` → `eng` → `finance`), а потім окремий `cofounder` turn робить synthesis з їхніх відповідей як context-у.

Sequential, не parallel — навмисно:

- **Cost predictability.** 5 turn-ів з `OPENCLAW_MAX_ITERATIONS=8` cap-ом => верхня межа `5 × 8 = 40` Anthropic-call-ів. Parallel дає той самий потолок, але робить moving-target-з budget-tracking-ом (audit-rows записуються в кінці кожного turn-у).
- **Iteration cap per specialist = 3.** Specialist-агенти обмежені до 3 iter (`Math.min(3, maxIterations)`) — це достатньо для tool-call → reflect → final-answer, і не дає одній персоні "проїсти" увесь budget.
- **Synthesis turn використовує full cofounder tool-set + iteration cap = `maxIterations`.** Це дає cofounder свободу зробити own data-перевірку, якщо специалісти suggest-нули щось suspect.
- **Окремий budget cap.** `OPENCLAW_COUNCIL_USD_BUDGET` (default `2.0`) — пре-перевірка перед запуском council-у. Якщо `dailySpentUsd + 2 > OPENCLAW_DAILY_USD_BUDGET`, council скіпається з повідомленням про headroom. Це окремий envelope, бо одна council-сесія може проїсти 30-50% денного $5 cap-у.
- **Кожен turn → окремий audit-row.** `openclaw_invocations.metadata` тегує `{"council": true, "council_persona": "ops"}` (специалісти) або `{"council": true, "council_persona": "cofounder", "synthesis": true}` (synthesis). `tool_calls` лишаються на рівні specialist-row-у — щоб post-mortem-аналіз показував який спеціаліст викликав який tool. Synthesis-row має tool_calls, які зробив сам cofounder (часто — один `recall_memory`).

`/council` повідомляє founder-у progress: "_ops-engineer_ думає…", потім "_growth-marketer_ думає…", і т.д., і в кінці — "_Cofounder synthesis…_" з фінальною reply. Це гарантує, що founder не think-ає, що бот завис, поки 5 turn-ів секвенційно котяться.

### 3. UI-zoom: persona slash-команди

Усі 5 persona-slash-команд приймають arg-text (`/ops <питання>`). Якщо arg відсутній — bot відповідає usage-help-ом (`Використання: /ops <твоє питання>`). `/cofounder` без arg-у = explicit nudge на default flow (free-text DM).

Якщо free-text DM приходить без slash-prefix-а — persona = default cofounder. Тобто **default behaviour не міняється**, persona-routing — opt-in.

### 4. Що НЕ міняється

- Server-side tool-розгляди (Stripe, Sentry, PostHog, GitHub releases, server-stats) — без змін. Persona-фільтрація — purely client-side (console).
- Audit-table schema (`openclaw_invocations`) — без змін. Persona і council-метадата зберігаються у `metadata` JSONB-колонці.
- Budget cap (`OPENCLAW_DAILY_USD_BUDGET`) — без змін. Council дістає окремий envelope, який checked-ється перед запуском.
- Iteration cap (`OPENCLAW_MAX_ITERATIONS`) — лишається authoritative для звичайних persona-команд. Council специалісти hard-cap-нуті у `min(3, maxIterations)`.
- Allowlist (`OPENCLAW_FOUNDER_TG_USER_ID`) — без змін. Усі persona-команди проходять через `isAllowedDmContext`.
- Tone-mode (`selectToneMode`) — без змін. Працює orthogonal до persona.
- Cron broadcasts (Phase 2 morning ritual / weekly review / monthly OKR) — без змін; вони і далі викликають default `cofounder` persona, бо broadcast — це synthesis-job за визначенням.

## Consequences

### Positive

- **Persona — м'яка focus-зміна без архітектурного ризику.** Один primer + один tool-filter — все. Не торкається server, audit, budget, allowlist.
- **`/council` дає structured "нараду".** Founder отримує 4 explicit-думки + synthesis в одному chat-flow з гарантованим audit-trail-ом. Це покриває попередній user-request "нарада в боті".
- **Cost-aware.** Sequential + per-specialist iter cap + окремий council-budget — три незалежні envelope-и. Council не зможе проїсти увесь денний budget випадково.
- **Future-compatible з Phase 4 write-tools.** Коли додамо `commit_to_strategy_doc`, `create_github_issue` і т.д. — додамо їх у persona-allowlist-и точково (наприклад, тільки `cofounder` і `eng` бачать `create_github_issue`).

### Negative / debt

- **Primer drift.** 5 primer-ів живуть у коді як string-літерали; зрушення тону в одному не автоматично пропагується на інші. **Mitigation:** unit-тести у `personas.test.ts` фіксують ключові інваріанти кожного primer-у (наприклад, "ops mentions reliability AND handover до growth"). Коли primer-и треба буде batch-edit-ити — дивимось на YAML-файл як data-source.
- **Tool-allowlist-и треба руками extend-ити.** Кожен новий tool потребує decision: до якого specialist його допускати? **Mitigation:** новий cofounder-only tool — нульова робота (sentinel `null` пропускає все). Якщо tool потрібен specialist-у — extend-ите і додаєте unit-тест на presence у `personas.test.ts`.
- **Council повільніший за DM.** 4 + 1 turn секвенційно при `OPENCLAW_MAX_ITERATIONS=8` — у worst-case 30-50 секунд. **Mitigation:** progress-messages кожного turn-у; iteration-cap для specialist-ів = 3. Якщо latency стане проблемою — Phase 4 introduces parallel council з paid faster-model + concurrency-guard.
- **Synthesis turn може дублювати tool-calls специалістів.** Cofounder має повний tool-set і інколи "пере-перевірить" дані, які щойно приніс ops. **Mitigation:** synthesis-prompt prepend-ає preamble: "Ось що сказали специалісти, не дублюй їх tool-calls без потреби". Не deterministic — моніторимо середню вартість council-а через `metadata.council=true` queries.

### Re-evaluation triggers

- Founder використовує `/council` < 1 раз/тиждень протягом 4 тижнів → знизити пріоритет, можливо deprecated за непотрібністю.
- Cofounder synthesis середньо коштує > $1.5 → переглянути synthesis-prompt-у, або обмежити `maxIterations` для synthesis turn-у.
- Якщо одна persona захоплює > 80% викликів — переглянути default tone-mode-у або primer-и (можливо primer-и ineffective).
- Phase 4 write-tools landing → додати write-tool-и в persona-allowlist-и (наприклад, `commit_to_strategy_doc` доступний тільки `cofounder` і `eng`); audit-row отримує additional `approval_state` колонку.
- Якщо team зростає до multi-operator → memory-namespace per-persona (зараз shared `cofounder`).

## Alternatives considered

### A. Single persona з instructed-tool-pruning у prompt

Не filter-ити tools на code-side, замість цього казати LLM: "ти — ops, не клич `get_posthog_stats`". Один primer на все, без code-level tool filter.

**Чому ні:** schema-cost не знижується (LLM усе одно бачить tool-schemas), і persona-leak реальний — LLM іноді ignor-ує "не клич". Pure prompt-level guardrails — слабші за code-level filter, коли є дешева альтернатива.

### B. Окремі Anthropic-clients per persona

Створити 5 окремих `Anthropic` instance-ів, кожен з власним system-prompt-ом і tool-set-ом, як 5 окремих agent-loop-ів.

**Чому ні:** дублює init-логіку, complic-ує audit (5 places для invocation-row-у), і не дає прибыли — `Anthropic` SDK stateless, один instance підтримує множинні call-и з різними system + tools без issue-ів.

### C. Parallel council з `Promise.all`

Запустити 4 specialist-turn-и паралельно, чекати усі чотири, потім один synthesis turn.

**Чому ні:** робить budget-tracking moving-target (audit-rows append-яться в кінці кожного turn-у). Якщо two specialist-и одночасно перетинають $5 cap — друга invocation писатиметься з `cost_usd > 0` після того, як перша вже flag-нула over-budget, і race-condition produce-ить inconsistent audit-state. Sequential дає лінійний invariant. Phase 4 може ввести parallel з explicit `BEGIN…COMMIT` навколо budget-check + invocation-write.

### D. Ad-hoc "uvuyi sebe ops-engineer-om" prompt-ом без code

Лишити free-text "уяви ти ops" як єдиний механізм, без structured slash-команд.

**Чому ні:** немає audit-tag-у на persona, немає predict-able tool-filter-а, primer-и розмиваються у multi-turn dialogue. Цей ADR і існує, бо ad-hoc prompt — недостатньо.

### E. Persona-specific Anthropic models

Використати `claude-haiku` для specialist-ів і `claude-sonnet` тільки для synthesis. Менший cost, ніж дефолтний `sonnet` на всю п'ятірку.

**Чому ні (зараз):** model-mix додає ще одне measurement-axis і ускладнює debugging ("який model відповів?"). Залишаємо single-model `sonnet` у Phase 2.5; розглянемо у Phase 4 разом з cost-tracking-ом.

## Migration steps

1. ✅ Code: створити `tools/console/src/agents/personas.ts` (registry + tool-filter + primer-builder).
2. ✅ Code: `tools/console/src/agents/openclaw.ts` — `buildSystemPromptInline()` приймає optional `persona`, prepend-ить primer перед COMMON-prefix; `runOpenClawAgent()` приймає optional `persona`, фільтрує tools перед `runAgentLoop`.
3. ✅ Code: `tools/console/src/openclaw/handler.ts` — додати `/ops`, `/growth`, `/eng`, `/finance`, `/cofounder` як persona-aware slash-команди + `/council` як sequential round-table; HELP_TEXT оновлений.
4. ✅ Code: `OPENCLAW_COUNCIL_USD_BUDGET` env-config + pre-budget check у `/council` handler-і.
5. ✅ Tests: `personas.test.ts` (16 cases) + extend `openclaw.test.ts` з persona-aware prompt-тестами.
6. ✅ ADR-0033 (this).
7. ✅ Update `docs/launch/openclaw-roadmap.md`: Phase 2.5 → shipped.
8. ✅ Update `tools/console/.env.example`: додати `OPENCLAW_COUNCIL_USD_BUDGET=2`.
9. Phase 4 (окремий PR після цього): write-tools з approval-button + per-persona allowlist-и для write-tool-ів.
