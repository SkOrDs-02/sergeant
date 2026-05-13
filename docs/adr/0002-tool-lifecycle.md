# ADR-0002: AI tool lifecycle (proposal → safety review → rollout → KPIs)

- **Status:** accepted
- **Date:** 2026-04-27
- **Last validated:** 2026-05-06 by Codex. **Next review:** 2026-08-04.
  > **Status:** Active
- **Reviewers:** @Skords-01
- **Supersedes:** —
- **Related:**
  - [`docs/audits/archive/2026-04-26-sergeant-audit-devin.md`](../audits/archive/2026-04-26-sergeant-audit-devin.md) — пункт `PR-12.D`.
  - [`apps/server/src/modules/chat/tools.ts`](../../apps/server/src/modules/chat/tools.ts) — реєстр Anthropic tools.
  - [`apps/server/src/modules/chat/toolMetrics.ts`](../../apps/server/src/modules/chat/toolMetrics.ts) — `chat_tool_invocations_total{tool, outcome}` (PR-12.C, [#924](https://github.com/Skords-01/Sergeant/pull/924)).
  - [`apps/web/src/core/lib/chatActions/`](../../apps/web/src/core/lib/chatActions/) — клієнтські handler-и tool-call-ів.
  - [`docs/planning/ai-coding-improvements.md`](../planning/ai-coding-improvements.md) § «Блок 3. Code markers» — визначення `AI-DANGER`-маркерів.
  - [`docs/playbooks/add-hubchat-tool.md`](../playbooks/add-hubchat-tool.md) — операційний how-to.
  - [`docs/playbooks/tune-system-prompt.md`](../playbooks/tune-system-prompt.md).
  - [`docs/playbooks/add-feature-flag.md`](../playbooks/add-feature-flag.md) — feature-flag механіка для фази 3 (rollout) і ADR-2.10.
  - [ADR-0005](./0005-anthropic-model-selection-and-prompt-caching.md) — model selection + prompt caching (закриває TBD-ADR з §2.8).

---

## 0. TL;DR

Кожен Anthropic tool у Sergeant проходить **4 фази** з explicit gate-ами: **Proposal → Safety review → Rollout → KPI-evaluation**. Без цього процесу tools накопичуються асиметрично — модель має 30+ tools, з яких 8 ніколи не викликається, а 3 крашать клієнт без алерту. Метрика `chat_tool_invocations_total{tool, outcome=proposed|executed|unknown_tool}` (з PR-12.C) є джерелом істини для KPI-фази.

| Фаза        | Тривалість            | Gate (хто/що)                                                       | Артефакт              |
| ----------- | --------------------- | ------------------------------------------------------------------- | --------------------- |
| 1. Proposal | 1-3 дні               | RFC-issue з motivation + draft tool-spec                            | GitHub Issue          |
| 2. Safety   | 1-2 дні               | Owner + checklist (idempotency, RLS, rate-limit, AI-DANGER markers) | PR review checkboxes  |
| 3. Rollout  | 1 спринт (~1 тиждень) | PR + flag (`AI_TOOL_<NAME>_ENABLED=1`) + контракт-тести             | Merged PR             |
| 4. KPIs     | 30 днів post-merge    | Прометей + дашборд `proposed - executed` + retention                | Recurring review note |

Кожна фаза має criteria-вихід; невідповідність на будь-якому gate-і — повернення на попередню фазу або **deprecation** (видалення з реєстру + cleanup metrics).

### Додаткові sub-decisions

Крім 4-фазного flow, цей ADR фіксує:

| #    | Тема                                 | Decision (коротко)                                                            |
| ---- | ------------------------------------ | ----------------------------------------------------------------------------- |
| 2.1  | Чому потрібен формальний lifecycle   | (оригінальний sub-ADR)                                                        |
| 2.2  | Фаза 1: Proposal                     | RFC-issue + tool-spec template                                                |
| 2.3  | Фаза 2: Safety review                | Mandatory checklist у PR-template                                             |
| 2.4  | Фаза 3: Rollout                      | Feature flag + 24h staging перед production                                   |
| 2.5  | Фаза 4: KPIs                         | 30-day review, deprecation thresholds                                         |
| 2.6  | Owner-domain map                     | Solo-repo зараз; trigger розширення — 2-й contributor з ≥3 PR-ами             |
| 2.7  | Anthropic prompt-cache budget        | Батчити N tools в один PR при масових змінах                                  |
| 2.8  | Не-цілі (out of scope)               | (оригінальний)                                                                |
| 2.9  | Tool input_schema versioning         | Optional fields — minor; required — major (`_v2` + 30-day deprecation старої) |
| 2.10 | Hot kill-switch (DB flag, no deploy) | `tool_kill_switches` table + LISTEN; <1 min recovery; auth: owner-domain      |
| 2.11 | Token-budget cap для `tools` array   | Сума `JSON.stringify(input_schema).length` ⊤ 16 KB; CI-check у `tools.ts`     |

---

## ADR-2.1 — Чому потрібен формальний lifecycle

### Status

accepted.

### Context

Станом на 2026-04-26 в Anthropic-реєстрі (`apps/server/src/modules/chat/tools.ts`) — **40+ tools**, поділених між finyk, fizruk, nutrition, routine, hub-доменами. Проблеми, які ми реально спостерігали:

1. **Silent dead tools.** Деякі tools, додані ще у MVP-фазі (приклад: `analyze_workout_form`), модель пропонує менше ніж 1 раз/тиждень, бо в SYSTEM_PREFIX немає інструкцій, коли їх викликати. Метрика `chat_tool_invocations_total{outcome=proposed}` для них ≈ 0 — токени на schema-decoding витрачаються, value = 0.
2. **Crashes без алертів.** Коли клієнтський handler у `apps/web/src/core/lib/chatActions/*` падає (наприклад, schema-drift), модель отримує помилку у `tool_result`, генерує "Спробуй пізніше" і чат продовжується. Sentry мовчить, юзер бачить деградований UX. Без `executed`-метрики та контракт-тестів handler-ів (PR-12.B, [#885](https://github.com/Skords-01/Sergeant/pull/885)) такі регресії живуть тижнями.
3. **Race-conditions.** Клієнт reload → state mismatch → `tool_result.tool_use_id`, який сервер вже не пам'ятає. До PR-12.C ми це не міряли; тепер це `outcome=unknown_tool`.
4. **No safety review.** Tools, що мутують дані (`delete_transaction`, `move_funds`, `start_workout`), не мали checklist-у на idempotency / rate-limit / RLS. Один баг ([#788](https://github.com/Skords-01/Sergeant/issues/788), наразі закритий) дозволяв одному юзеру через model hallucination видалити чужу транзакцію — RLS-policy лагодилась реактивно.
5. **Cost asymmetry.** Tools з великим `input_schema` коштують token-budget на кожному виклику моделі (вони включені в context). Tool, що проектує 200 токенів, але executes 0.1×/день — net negative.

### Decision

Кожен tool проходить **4 фази** з визначеними gate-ами. ADR описує tool lifecycle на рівні організаційного процесу, не коду — конкретна імплементація (PR template, GitHub Issue template, dashboard) — окремими follow-up-PR-ами.

### Consequences

**Позитивні:**

- Видимий audit-trail кожного tool-у (хто запропонував, хто прорев'юив safety, які KPI намірили).
- Об'єктивне deprecation-рішення: `proposed < 5/тиждень AND executed_rate < 80%` за 30 днів = кандидат на видалення.
- Cost-discipline: проєкція token-budget на нові tools у Proposal-фазі, перевірка реального consumption у KPI-фазі.

**Негативні:**

- Додатковий процесний overhead на новий tool (≈1-3 дні на Proposal + Safety review до коду).
- Потрібен dashboard у Grafana (PR-8.B, не закритий); до того часу KPI-фаза = ручний `curl /metrics` + spreadsheet.

### Alternatives considered

1. **No formal lifecycle.** Дешевше, але саме звідси виросли всі 5 проблем у Context. Відкинуто.
2. **Per-PR review without ADR.** Кожен tool-PR проходить ad-hoc review без чек-листа. Вже так працювало 6 місяців — призвело до тих самих проблем (#788). Відкинуто.
3. **Quarterly tool audit замість per-tool lifecycle.** Дешевше у proposal-фазі, але reactive — баг живе до наступного аудиту. Відкинуто, частково перекривається KPI-фазою тут.

---

## ADR-2.2 — Фаза 1: Proposal

### Status

accepted.

### Process

1. Автор створює GitHub Issue з лейблом `tool-proposal` + наступний template (треба в наступному PR покласти у `.github/ISSUE_TEMPLATE/tool-proposal.md`):

   ```markdown
   ## Motivation

   <!-- Який юзер-flow потребує цей tool? Які дані модель не може дістати без нього? -->

   ## Tool spec (draft)

   - **name:** `<snake_case_name>`
   - **scope:** `finyk` | `fizruk` | `nutrition` | `routine` | `hub`
   - **mutation?** yes | no
   - **input_schema:** <YAML / TS>
   - **expected output:** <string up to N chars / structured JSON>

   ## Estimated KPIs (30-day forecast)

   - **proposed-events/week:** <число> (як часто модель буде це викликати)
   - **executed_rate:** <%> (зазвичай 90%+; нижче — flag для safety-фази)
   - **token-budget impact:** <±N токенів на context-load>

   ## Alternatives considered

   <!-- Чому не `existing_tool_X` + post-processing? Чому не SYSTEM_PREFIX-інструкція? -->
   ```

2. Owner-домену (см. ADR-2.6) ставить `approved: proposal` лейбл або повертає на доопрацювання.
3. Без approved-issue PR з кодом нового tool-у НЕ відкривається. Якщо це bug-fix існуючого tool-у — фаза 1 пропускається.

### Exit criteria

- Issue має filled motivation, tool-spec, KPI-forecast, alternatives.
- Owner поставив approved: proposal лейбл.

---

<!-- AI-DANGER markers — визначення у `docs/planning/ai-coding-improvements.md` §«Блок 3. Code markers». Inline comment виду `// AI-DANGER: <опис ризику>`, флагується в PR-review і видимий в .github/PULL_REQUEST_TEMPLATE.md чеклісті. -->

## ADR-2.3 — Фаза 2: Safety review

### Status

accepted.

### Process

PR з кодом нового tool-у (`apps/server/src/modules/chat/toolDefs/<scope>.ts` + клієнтський handler у `apps/web/src/core/lib/chatActions/`) має у body наступний checklist (треба в наступному PR покласти у `.github/PULL_REQUEST_TEMPLATE/tool.md`):

```markdown
## Safety review checklist (PR-12.D ADR-2.3)

### Mutation safety

- [ ] Mutation? <yes/no>
- [ ] Якщо yes — handler **idempotent** (повторний виклик з тим самим input не дублює запис).
- [ ] Якщо yes — `requireAiQuota` middleware застосовано (вартість = 1 quota-unit).

### RLS / authorization

- [ ] Handler перевіряє ownership перед мутацією (`req.user.id === resource.user_id` або RLS-policy на DB-рівні).
- [ ] Якщо tool читає дані — додано до RLS snapshot-test в `apps/server/src/lib/` (файл проявиться разом з реалізацією RLS-фреймворку — plan, not yet shipped).

### Rate limiting

- [ ] Глобальний `aiQuota` middleware застосовано.
- [ ] Tool-specific rate limit (наприклад, `barcode-scan` — max 10/min) — якщо потрібно.

### Schema validation

- [ ] `input_schema` має жорсткі межі (`.max()` для рядків, `.int()` для чисел).
- [ ] Output (text/JSON) має cap (наприклад, `≤ 8000 chars` — див. ToolResult schema).

### Observability

- [ ] Tool name додано до whitelist у `apps/server/src/modules/chat/toolMetrics.ts:KNOWN_TOOL_NAMES` (через `TOOLS`-реєстр — авто-маперинг).
- [ ] Sentry breadcrumb на error-path handler-у (`apps/web/src/core/lib/chatActions/*`).
- [ ] Контракт-тест handler-у — happy + error path (рул #3 з AGENTS.md, плюс PR-12.B).

### Markers

- [ ] [AI-DANGER marker](../planning/ai-coding-improvements.md) на handler-функції, якщо вона мутує дані.
- [ ] Inline comment пояснює, чому tool необхідний (не просто wrap над існуючим API).
```

Owner-домену відмічає чекбокси у review або вимагає змін. Без зеленого checklist-а PR не мерджиться.

### Exit criteria

- Усі чекбокси відмічені.
- CI зелений (vitest + контракт-тест handler-у + lint).

---

## ADR-2.4 — Фаза 3: Rollout

### Status

accepted.

### Process

1. **Feature flag**: новий tool додається у реєстр під ENV-flag-ом `AI_TOOL_<UPPER_NAME>_ENABLED` (наприклад, `AI_TOOL_DELETE_TRANSACTION_ENABLED=1`). Default — `0`.
2. **Staging rollout**: у Railway staging-environment ENV вмикаємо. На production — вимкнено.
3. **Manual smoke**: автор PR-у робить 5 chat-діалогів у staging, які мають викликати новий tool. Скрін у PR.
4. **Production enable**: окремий 1-line PR, що вмикає `AI_TOOL_<NAME>_ENABLED=1` у production environment-config-у. Цей PR — ще один gate (peer review без коду).
5. **Rollback план**: вимкнення flag-у — instant rollback (без redeploy). Документується у PR description.

Виняток: tools, що міграції/breaking changes у `tools.ts` не вимагають (наприклад, bug-fix у handler-і) — фаза 3 збігається з PR-merge.

### Exit criteria

- Flag увімкнений у production принаймні **24 години** без алертів у Sentry.
- Перші 10 `chat_tool_invocations_total{outcome=executed}` без crash-у.

---

## ADR-2.5 — Фаза 4: KPIs / evaluation

### Status

accepted.

### Process

**30 днів** після production-rollout автор tool-у відкриває recurring-issue з лейблом `tool-kpi-review` і замикає метрики:

| Метрика                                       | Threshold                  | Дія, якщо не пройшло                                   |
| --------------------------------------------- | -------------------------- | ------------------------------------------------------ |
| `proposed`-events/week (за останні 4 тижні)   | ≥ forecast із Proposal × ½ | Поправити SYSTEM_PREFIX або deprecate                  |
| `executed_rate` = `executed / proposed`       | ≥ 80%                      | Investigate handler-failures у Sentry, стабілізувати   |
| `unknown_tool`-events/тиждень                 | ≤ 5                        | Bug-fix у клієнтський state-management, race condition |
| `chat_tool_result_truncated_total{tool}`-rate | ≤ 10% від `executed`       | Reduce output size або винести у окремий endpoint      |
| Sentry-error-rate handler-у                   | ≤ 1% від `executed`        | Bug-fix; якщо chronic — escalate до safety-фази заново |

> **Why these numbers.** Thresholds — initial heuristic, обрані з ranges «lower bound, за яким теоретична користь tool-у рівна cost-у». 80% executed_rate = 1 з 5 invocation-ів schema-fail-иться — жива ситуація для автопоправленої model output, але якщо нижче — chronic schema-drift. ½-forecast — 50%-ьовий бафер на KPI-форекасти, які завжди оптимістичні у motivation. **Ревалідуємо після перших 5 tools у KPI-фазі** — якщо більше 80% з них fail-ять один і той же threshold, він не відображає реальність.

Якщо tool **2 рази підряд** (60 днів) не проходить пороги — формальний deprecation-PR:

1. Прибрати з `TOOLS`-реєстру.
2. Прибрати з `KNOWN_TOOL_NAMES` whitelist (PR-12.C).
3. Видалити клієнтський handler.
4. Сnapshot тестів — оновити.
5. Issue-link на оригінальний proposal-issue з explicit "deprecated, see ADR-0002 KPI fail".

### Exit criteria

- KPI-issue заповнена і closed-as-keep або closed-as-deprecated.

---

## ADR-2.6 — Owner-domain map

### Status

accepted.

### Decision

| Domain               | Owner      | Tools (приклади)                                              |
| -------------------- | ---------- | ------------------------------------------------------------- |
| `finyk`              | @Skords-01 | `delete_transaction`, `categorize_transactions`, `move_funds` |
| `fizruk`             | @Skords-01 | `start_workout`, `log_set`, `recommend_recovery`              |
| `nutrition`          | @Skords-01 | `log_meal`, `query_food_db`                                   |
| `routine`            | @Skords-01 | `mark_habit_done`, `query_streak`                             |
| `hub` (cross-domain) | @Skords-01 | `get_briefing`, `summarize_period`                            |

(Single-owner repo зараз; owners-секцію розширюємо, як тільки до ´git log apps/server/src/modules/chat/´ додається другий contributor з ≥3 змердженими PR-ами. До того — єдиний owner = єдиний reviewer.)

### Exit criteria

n/a (operational map, не gate).

---

## ADR-2.7 — Зв'язок з Anthropic prompt cache і budget

### Status

accepted.

### Decision

`tools` array кешується через Anthropic prompt-caching (`cache_control: ephemeral`, PR-12.A, [#864](https://github.com/Skords-01/Sergeant/pull/864)). Це означає:

- Додавання нового tool **інвалідує cache** на наступні 5 хвилин (TTL Anthropic-кешу) — короткий cost-spike.
- Видалення tool теж інвалідує cache — врахувати при batch-deprecation.
- Якщо planується додати **N tools одразу**, краще зробити це одним PR (один cache-miss), ніж N окремих (N cache-misses).

Метрика `anthropic_prompt_cache_hit_total{version, outcome=hit|miss}` (PR-12.A) допомагає валідувати, що cache справді гріє після rollout.

### Exit criteria

n/a (operational reference).

---

## ADR-2.8 — Не-цілі (out of scope)

Цей ADR **не** покриває:

- **Tool authoring style** (іменування, opinionated input shapes) — це operational guidance у `docs/playbooks/add-hubchat-tool.md`.
- **System prompt tuning** — окремий playbook `docs/playbooks/tune-system-prompt.md`.
- **Anthropic version bumps / model selection / prompt caching budget** — [ADR-0005](./0005-anthropic-model-selection-and-prompt-caching.md) (закриває TBD-ADR).
- **Quotas і monetization gating** — ADR-0001 + `requireAiQuota` middleware.
- **Безпека ширше за tool boundary** (XSS, CSRF, secrets management) — repo-wide AGENTS.md hard rules.

---

## ADR-2.9 — Tool input_schema versioning

### Status

proposed.

### Context

Коли `input_schema` для існуючого tool-у змінюється, реальні краї випадків:

1. **Adding optional field** (`age?: number`) — безпечно: модель просто не передає поле у `tool_use`, handler працює.
2. **Renaming a field** (`category` → `merchant_category`) — model бачить нову schema, але in-flight `tool_use_id` з client-а, який був reload-нутий після deploy-у, отримує стару schema, server приймає нову → schema mismatch → `unknown_tool` або crash.
3. **Adding required field** (`amount: number` було optional, стало required) — model, що бачить стару schema, не передає поле; handler crashes.

Без зафіксованої політики кожен schema-edit — потенційний backward-incompat.

### Decision

**Semver-style: minor для додавання optional, major для перейменування / required.**

1. **Minor (backwards-compatible):**
   - Додавання optional поля.
   - Послаблення обмежень (`max(50)` → `max(100)`).
   - **Дозволено** у тому самому PR, без проходження фаз 1-3.
2. **Major (breaking):**
   - Перейменування або видалення поля.
   - Додавання required поля без default.
   - Посилення обмежень (`max(100)` → `max(50)`).
   - **Новий tool-name з `_v2` suffix-ом** (`delete_transaction_v2`). Старий (`delete_transaction`) лишається у реєстрі 30 днів як deprecated, з banner-ом у SYSTEM_PREFIX «prefer `delete_transaction_v2`».
   - Через 30 днів — `delete_transaction` ремув-иться з реєстру (deprecation flow з ADR-2.5).
   - **Проходить фази 1-3 заново** як новий tool.
3. **Cache-invalidation note:** Anthropic prompt-cache (ADR-2.7) інвалідується автоматично на будь-яку зміну `tools` array, включно з minor. Acceptable cost-spike, якщо schema-edits рідкі.
4. **Detection:** у CI додаємо перевірку (планований `scripts/lint-tool-schemas.<mjs>` — not yet shipped): дифф `apps/server/src/modules/chat/toolDefs/**/*.ts` від base-бранчу. Якщо tool-name той самий, а schema видалила або перейменувала field — CI fail з повідомленням «this is a major change, use \_v2 suffix».

### Consequences

**Позитивні:**

- In-flight `tool_use_id`-и від старих client-ів працюють 30 днів після deploy-у.
- Mobile users (які бувають на старих bundle-ах тижнями) — graceful degradation.
- Нові розробники автоматично проходять safety-review для major-змін.

**Негативні:**

- Період 30 днів з двома tools у реєстрі (старий + `_v2`) — враховується у ADR-2.11 token-budget cap.
- CI-перевірка потребує base-branch git-fetch (~2-5s overhead).

### Alternatives considered

- **Always major (кожна зміна — \_vN):** noisy, якщо додаємо просто optional `note`-поле.
- **No versioning (silent deploy):** регресії приходять через user-complaints.
- **API-versioned tools (`api_version` у `tool_use`):** Anthropic protocol не підтримує.

---

## ADR-2.10 — Hot kill-switch (DB flag, no deploy)

### Status

proposed.

### Context

ADR-2.4 (фаза 3 rollout) описує feature-flag (`AI_TOOL_<NAME>_ENABLED=1`) як primary kill-switch. Проблема: вимкнення flag-у — окремий PR + Railway deploy = **5-15 хвилин реакції**. Для destructive tool (наприклад, `delete_transaction`), який виявив себе у production, це занадто довго: за 5 хвилин model може викликати tool десятки разів.

Потрібен **<1-хвилинний kill-switch без redeploy**.

### Decision

**Postgres flag-table + LISTEN-trigger (аналогічно plan-cache в ADR-1.3):**

1. **Schema** (PR-12.E):

   ```sql
   CREATE TABLE tool_kill_switches (
     tool_name TEXT PRIMARY KEY,
     enabled BOOLEAN NOT NULL DEFAULT true,
     reason TEXT,
     disabled_by TEXT,
     disabled_at TIMESTAMPTZ,
     CHECK (enabled OR (reason IS NOT NULL AND disabled_by IS NOT NULL))
   );
   ```

2. **In-memory cache** (сервер-side LRU `Map<tool_name, boolean>`, розмір ~50). Читається на кожен Anthropic-call перед будуванням `tools` array — disabled tools **видаляються з array**.
3. **NOTIFY-trigger** на `tool_kill_switches` UPDATE/INSERT → LISTEN-loop у сервері робить `cache.set(tool_name, enabled)`. Пропагація по всіх server-instance-ах < 1 c.
4. **API for toggle:** `POST /api/admin/tools/:name/disable` (admin-only, Better Auth `admin`-role). Body: `{ reason: "chronic crashes in handler #N", disabled_by: "@Skords-01" }`. Повертає 200 якщо cache invalidate-нувся.
5. **CLI fallback:** `pnpm tool:kill <name> --reason "..."` (планований `scripts/tool-kill.<mjs>` — not yet shipped) — пише в DB напряму через Railway DB-proxy. Рятує, якщо admin-API сам зламаний.
6. **Re-enable** — той самий endpoint з `enabled=true`, але **вимагає ADR-2.5 KPI-фази заново** (re-rollout, не hot resume).
7. **Auth model:** список `disabled_by`-операторів — owner-домену (ADR-2.6) або on-call (якщо в майбутньому).

Відмінності від ADR-2.4 feature-flag-у:

| Аспект        | ADR-2.4 ENV-flag         | ADR-2.10 DB kill-switch    |
| ------------- | ------------------------ | -------------------------- |
| Призначення   | Rollout, planned changes | Emergency stop             |
| Пропагація    | 5-15 хв (deploy)         | < 1 хв (LISTEN)            |
| Audit trail   | Git history              | DB row + Sentry breadcrumb |
| Authorization | Repo write-access        | Admin role                 |

### Consequences

**Позитивні:**

- Bad-tool radius обмежений 60 секундами.
- Audit trail (хто, коли, чому) — в одній row.
- Не конфліктує з ADR-2.4 ENV-flag — їх два layers: env-flag — для rollout, DB-flag — для екстреного вимкнення.

**Негативні:**

- 1 додатковий LISTEN-connection на server-instance — prom-budget acceptable.
- Admin-endpoint — attack vector. Mitigation: rate-limit + Sentry-alert на 100% викликів.
- Два рівні control-у — ризик «я ввімкнув ENV-flag, але DB-flag вимкнений». Mitigation: dashboard показує effective state (env AND db).

### Alternatives considered

- **Redis-based flag:** додає інфраструктурну залежність, Postgres NOTIFY — вбудовано (як в ADR-1.3).
- **Hard-fail всього Anthropic-call при emergency:** занадто агресивно — якщо ламається лише один tool, решта chat має працювати.
- **Anthropic API blocking on prompt-level (system-prompt зміни):** не гарантує невикликання.

---

## ADR-2.11 — Token-budget cap для `tools` array

### Status

proposed.

### Context

Кожен tool у `tools` array Anthropic включається в context **на кожен виклик моделі**. При 50 tools, кожен ~200 токенів schema, ми витрачаємо ~10K токенів на input-context-load на кожну user-message. Prompt-cache (ADR-2.7) знижує cost ~10×, але cache-miss-и при deploy-ах / model-bump-ах — full price.

Без cap-у регресія: «quickly add 5 tools» в одному PR — token-budget вибухає, ніхто не помічає до квартального Anthropic-bill-у.

### Decision

**16 KB cap на суму `JSON.stringify(input_schema).length` усіх enabled tools, enforced в CI.**

1. **Limit:** Сума байт-довжин серіалізованих `input_schema` (без `description`-полів, які окремо розраховуємо) ≤ 16 384 байт. Це ~2 700 token вхідного бюджету.
2. **CI-check** (планований `scripts/check-tool-budget.<mjs>` — not yet shipped):
   - Обходить `apps/server/src/modules/chat/toolDefs/**/*.ts`, рахує розмір кожної schema.
   - Logs розмір кожного tool в CSV (для будь-якого PR-у).
   - Fails якщо total > 16 KB.
   - Додається у `pnpm lint` workflow.
3. **Description-cap окремо:** кожен tool description ≤ 1000 байт. Description-и не враховуються в 16 KB cap-і (вони вже регулюються «common sense»). PR-review-ер флагує, якщо description > 500 байт.
4. **На break-cap:** PR-author обирає:
   - Спростити schema (видалити рідковживані поля).
   - Deprecate інший невикористовуваний tool (з KPI-фази ADR-2.5).
   - Писати ADR-поправку, що підвищує cap (потребує explicit decision — чому платимо більше).

### Consequences

**Позитивні:**

- Cost-discipline — явний, не «виявляємо після bill-у».
- CI-output є живою специфікацією: розмір кожного tool видимий.
- Linkage з ADR-2.5 KPI-фазою: deprecation-thresholds реально роблять місце для нових.

**Негативні:**

- При 30+ tools cap стане binding constraint — доводиться «play tetris». Acceptable — це фіча, не баг.
- 16 KB — heuristic; може бути too-tight або too-loose. Ревалідуємо після Q1 launch.

### Alternatives considered

- **No cap:** historical default, вже бачили silent token-bloat.
- **Soft warning, no fail:** ігнорується без forcing-function-у.
- **Per-tool cap (кожен ≤ N байт):** дозволяє mass-add маленьких tool-ів — той самий ризик.

---

## Open questions

1. **Tool deprecation: hard-delete чи tombstone?** Зараз пропонується hard-delete з `TOOLS`. Альтернатива: лишати у whitelist з `outcome=deprecated` міткою — щоб старі metric-series не зникали миттєво. Вирішується у PR-12.C follow-up.
2. **Cross-tool dependency.** Наприклад, `start_workout` залежить від `get_active_workout_session`. **Рішення зараз:** описувати у `motivation`-секції issue (фаза 1 ADR-2.2) як free-form text. Explicit `depends_on`-поле у tool-spec додамо, як тільки буде >5 живих випадків у реєстрі (зараз — 0). Ревалідуємо при кожному KPI-review.
3. **A/B testing нового tool.** **Рішення зараз:** використовуємо existing feature-flag систему (плейбук [`add-feature-flag.md`](../playbooks/add-feature-flag.md)) + `userId %% N`-cohort split у SYSTEM_PREFIX. Перший A/B-tested tool — у PR-12.F (ще не відкритий). Для більш складних cohort-flow (вік, geo) — ADR-0018 (бек-лог в README).
4. **Output cap реалізація.** Safety checklist в ADR-2.3 вимагає `output ≤ 8000 chars`. Реалізація вже є: в `apps/server/src/modules/chat/tools.ts` ToolResult schema truncate-ить овер-cap output і пише metric `chat_tool_result_truncated_total{tool}`. Нові tool-и наслідують автоматично.
