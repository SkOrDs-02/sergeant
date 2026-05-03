# ADR-0036: OpenClaw write-tools with founder-approval flow

- **Status:** Accepted
- **Date:** 2026-05-03
- **Deciders:** @Skords-01
- **Supersedes:** —
- **Related:**
  - [ADR-0027 — OpenClaw / Console / MCP policy](./0027-openclaw-console-mcp-policy.md)
  - [ADR-0030 — Telegram reporting structure](./0030-telegram-reporting-channel-structure.md)
  - [ADR-0031 — OpenClaw v0 Telegram co-founder bot](./0031-openclaw-v0-telegram-cofounder.md)
  - [ADR-0032 — Console consolidated into OpenClaw](./0032-console-consolidated-into-openclaw.md)
  - [ADR-0033 — OpenClaw multi-personas + `/council`](./0033-openclaw-multi-personas-and-council.md)
  - [ADR-0037 — OpenClaw write-audit persistence (Phase 4.5)](./0037-openclaw-write-audit-persistence.md) — closes the audit-trail debt from §4 below.
  - [`docs/launch/openclaw-roadmap.md`](../launch/openclaw-roadmap.md) — Phase 4 section.

---

## Context

ADR-0031 запустив OpenClaw з 7 read-only tool-ами; ADR-0033 додав ще 5 personas + `/council` round-table — все ще read-only. Founder неодноразово натикався на повторюваний паттерн: бот робить аналіз → пропонує конкретну дію → "ти можеш зробити сам у GitHub / n8n / Telegram?". Кожна така ручна навігація — context-switch на 2-5 хвилин (особливо коли founder у дорозі і має тільки телефон).

Природне продовження — дати OpenClaw **side-effecting tools**: відкриття GitHub PR/issue, постинг у форум-топік, пауза workflow-у, mute Sentry-issue. Але read-only-tool-and-write-tool — два різних risk-classes:

- **Read-only:** worst case — leak данних у DM, який founder уже бачить (allowlist + DM-only). Не псує state у зовнішніх системах.
- **Write:** worst case — auto-merged PR з кривим стратегічним документом, broadcast у топік `#meta` під час дзвінка, deactivate-ed n8n workflow під час інциденту. Кожна помилка коштує real-world cleanup.

Тому write-tools НЕ можна шипити з тим самим guard-rail-ом, що й read-only (just allowlist + budget cap). Потрібен **explicit approval gate** на КОЖНУ side-effecting дію — founder бачить summary і два кнопки (Approve / Reject) до того, як бот реально зробить HTTP-call.

Phase 4 у roadmap-і явно перерахував цей набір: 5 write-tools з approval flow — це закриває 80% випадків, коли founder каже "так, зроби це".

## Decision

OpenClaw отримує **5 side-effecting tools** і **inline-keyboard approval flow** як композицію над поточним agent-loop-ом і audit pipeline-ом. Жоден write-tool не виконується автоматично — кожен LLM-tool-call перетворюється на pending-approval-record + Telegram-кнопки, які founder натискає вручну.

### 1. Tool registry (server side, `apps/server/src/modules/openclaw/write-tools.ts`)

| Tool                     | Effect                                                              | Endpoint                                      | Required env                                   |
| ------------------------ | ------------------------------------------------------------------- | --------------------------------------------- | ---------------------------------------------- |
| `commit_to_strategy_doc` | Open GitHub PR з оновленням файлу у `docs/strategy/**` (allowlist). | `/api/internal/openclaw/write/strategy-doc`   | `OPENCLAW_GITHUB_PAT`, `OPENCLAW_GITHUB_REPO`  |
| `create_github_issue`    | Open GitHub issue з title/body/labels.                              | `/api/internal/openclaw/write/github-issue`   | `OPENCLAW_GITHUB_PAT`, `OPENCLAW_GITHUB_REPO`  |
| `post_to_topic`          | Post message у Telegram supergroup forum-topic (allowlist).         | `/api/internal/openclaw/write/post-to-topic`  | `TELEGRAM_TOPIC_*` (per-topic chat/thread ids) |
| `pause_workflow`         | Deactivate n8n workflow.                                            | `/api/internal/openclaw/write/pause-workflow` | `N8N_BASE_URL`, `N8N_API_KEY`                  |
| `mute_alert`             | Mute (ignore-status) Sentry issue.                                  | `/api/internal/openclaw/write/mute-alert`     | `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`              |

Server-side інваріанти:

- **Allowlist enforcement.** `commit_to_strategy_doc` приймає тільки `path` всередині `docs/strategy/`; `post_to_topic` — тільки знайомі alias-и (`ops`, `engineering`, `growth`, `incidents`, `revenue`, `meta`, `digest`); `pause_workflow` — тільки `workflowId` що відповідає prefix-у `WF-`. Усі allowlist-перевірки на server-стороні (зловмисний LLM-output не зможе обійти).
- **Fail-soft на missing creds.** Якщо required env-var не виставлений — endpoint повертає `{ status: "not_configured" }` з 200 OK замість 500. Це дає founder видимий fail-mode без crash-loop-у бота.
- **Idempotency: best-effort.** GitHub create-issue / create-PR — non-idempotent на API-level, але server рандомить `branchName` для PR-у щоб уникнути collision-у. `pause_workflow` — idempotent (deactivate → already-deactivated). `mute_alert` — idempotent (mute → already-muted).
- **Same INTERNAL_API_KEY guard** як для read-tools. Зміни — лише методи (POST), payload (Zod-schemas) і 5 нових routes у `/api/internal/openclaw/write/*`.

### 2. Approval flow (console side)

Console intercept-ить write-tool-call ДО HTTP-call-у:

```
LLM emit → executor (intercept) → approval-store.create() → pending-collector.add()
agent turn ends → handler.drain(pending) → for each: post inline-keyboard card
founder click Approve → callback handler → store.markExecuted() → POST /write/<route>
                          → reply with response-body
founder click Reject  → callback handler → store.markRejected() → reply "rejected"
```

#### 2.1 Approval store

In-memory `Map<id, ApprovalRecord>`, TTL `10 min` (`OPENCLAW_APPROVAL_TTL_MS` нескриптовий, але overridable у constructor для тестів). Лежить у `apps/console/src/openclaw/approval-store.ts`.

`ApprovalRecord` зберігає `{ id, tool, input, founderUserId, founderTgUserId, invocationId, createdAt, expiresAt, status }`. `id` — random 8-char hex (досить унікальний для 10-min window-у при 1 founder-у; collision-prob ~10⁻⁹). Status: `pending` | `executed` | `rejected` | `expired`. Щойно `markExecuted()` / `markRejected()` зробив transition — `get(id)` повертає `undefined` (idempotent click-protection).

Garbage-collection — синхронна, на кожному public-op-і (`create` / `get` / `markExecuted` / `markRejected` / `pendingCount`). Окремий timer не потрібен, бо у Telegram-handler-і всі ці op-и викликаються постійно. Worst case — record stale до наступної кнопки founder-а; не critical.

**Чому in-memory, а не DB:** approvals — короткоживучі (≤10 min), і persistence на DB-level вимагала б нової міграції + кросс-restart-логіки (що робити з `pending` після рестарту — auto-reject? карти не клікабельні після рестарту через втрату callback-state-у). Прийняли trade-off: при рестарті console-а pending approvals discarded, founder reissue-ить запит. Не критично, бо рестарт console-а — рідка подія (Railway zero-downtime у 95% випадків).

#### 2.2 Per-turn collector

`PendingApprovalsCollector` — окрема per-turn структура (instance створюється у `runAgentTurn`). Executor пушить туди `ApprovalRecord` під час інтерцепції; handler `drain()` після завершення turn-у і пост карт. Відокремлений від `ApprovalStore`, бо:

- Stale records від попередніх turn-ів не повинні leak-нути у поточний button-render-loop.
- `ApprovalStore` — process-wide; collector — turn-scoped.

#### 2.3 Inline-keyboard format

Кожен queued-record рендериться як окреме message:

```
Telegram message body (MarkdownV2):
*<Tool label>*

<single-line summary of input>

_id: <8-char> · expires in 10 min_

[✅ Approve]  [✋ Reject]  ← inline keyboard
```

Callback data — `oc:approve:<id>` / `oc:reject:<id>` (19 байтів total, безпечно під Telegram-cap-ом 64). Префікс `oc:` робить namespace explicit на випадок майбутніх non-approval callback-ів у тому ж бот-і.

#### 2.4 Executor interception

`createOpenClawToolExecutor()` (у `apps/console/src/agents/openclaw.ts`) тепер містить gate:

```ts
if (isWriteToolName(name)) {
  if (!deps.approvalStore || !deps.pendingCollector) {
    // Fail-closed — never execute write-tool без approval-infrastructure.
    return WRITE_TOOL_REJECTED_LITERAL;
  }
  const record = deps.approvalStore.create({ tool: name, input, ... });
  deps.pendingCollector.add(record);
  return WRITE_TOOL_QUEUED_LITERAL;
}
// ... rest of executor for read-only tools
```

Дві string-літерали (`WRITE_TOOL_QUEUED_LITERAL`, `WRITE_TOOL_REJECTED_LITERAL`) фізично перехоплюють tool_result, який LLM бачить наступного turn-у. Це дає LLM-у явний сигнал "дія queued, чекаємо founder-а" → LLM на наступних tool-call-ах не намагається повторно викликати той самий write-tool.

### 3. Persona-allowlist для write-tools

Persona-tool-filter (ADR-0033) extend-нутий per-tool:

| Persona     | Write-tools, які бачить                                                              |
| ----------- | ------------------------------------------------------------------------------------ |
| `cofounder` | **усі 5** (sentinel `null` у ADR-0033; додавання write-tool-у автоматично pass-нуло) |
| `ops`       | `pause_workflow`, `mute_alert`, `post_to_topic`                                      |
| `growth`    | `commit_to_strategy_doc`, `create_github_issue`, `post_to_topic`                     |
| `eng`       | `create_github_issue`, `post_to_topic`                                               |
| `finance`   | `commit_to_strategy_doc`                                                             |

Логіка: ops-people пауз-ять workflow-и і mute-ять алерти; growth/eng/cofounder можуть відкривати GitHub issue/PR; finance підтримує бюджетні стратегічні правки. Це — стартова позиція; конкретні allowlist-и можна редагувати під реальний паттерн без архітектурних змін.

### 4. Audit-trail

- **LLM-турн audit-row** (`openclaw_invocations.tool_calls`) уже містить write-tool-call як один із tool-call-ів turn-у — нічого не змінюємо.
- **Approve / Reject — DB-persistent log** у таблиці `openclaw_write_audit` (ADR-0037, Phase 4.5). Console callback handler пише `approved` / `executed` / `rejected` row-у через `POST /api/internal/openclaw/write-audit/log` на кожну transition. Founder query-ить через `/audit` slash-команду. Console-side `console.log("[openclaw] write-tool executed/rejected", …)` ще лишається — duplicates DB-row, але дешева страховка для on-call grep-у Railway-логу.
- **HTTP response-body** від write-endpoint-у показується founder-у відразу після Approve (≤3500 chars, code-block format). Founder одразу бачить URL відкритого PR-у / GitHub issue / Sentry issue ID. Той самий response truncated до 4 KB і кладеться у `openclaw_write_audit.response_excerpt` для post-mortem queries.

### 5. Що НЕ міняється

- Server-side audit-table (`openclaw_invocations`) schema — без змін; write-action audit-log приходить через Phase 4.5 (`openclaw_write_audit`).
- Read-tools (всі 12 з ADR-0031/0033) — без змін; не проходять approval-gate, виконуються одразу як раніше.
- Persona registry (ADR-0033) — `PERSONA_TOOL_FILTER` extend-ється, але архітектура persona-loop-у не змінюється.
- `/council` round-table — без змін; council sub-turn може emit-ити write-tool, founder отримає approval-card після specialist-reply-у. Drain-логіка `pendingCollector` працює навіть з `silent: true` (council-режим).
- Budget cap (`OPENCLAW_DAILY_USD_BUDGET`) — без змін; queued approval не додає Anthropic-вартості (executor повертає одразу).
- Allowlist (`OPENCLAW_FOUNDER_TG_USER_ID`) — без змін, callback handler перевіряє той самий `isFounderAllowed()`.

## Consequences

### Positive

- **Founder завжди-у-loop-і.** Нема способу для LLM (або prompt-injection-у через зовнішні дані) тригернути side-effect без явного human-click-у.
- **Failure modes видимі.** Якщо `OPENCLAW_GITHUB_PAT` не виставлений — endpoint повертає `not_configured`, founder бачить це у Approve-response-body замість silent fail.
- **Audit-trail повний.** Кожен write-action має 3 точки логування: LLM-turn (Anthropic-call), console-side (approve/reject log), server-side (HTTP-response). Post-mortem на будь-яку write-action — straight-forward.
- **Cost neutrality.** Approval-gate happen-ить ДО написання у real-world — нема "ой я витратив $50 на Stripe-call", "ой я закрив 200 issue-ів". Founder bottleneck-ує all writes.
- **Future-compatible з Phase 5 multi-operator.** Коли додасться другий operator (наприклад, ops-engineer) — approval-store extend-ається `requiredApprovals: number` (зараз = 1, single-founder); callback логіка перевіряє чи всі required клікнули Approve.

### Negative / debt

- **Approvals в-пам'яті — крихкі до рестарту.** Console restart посеред `pending` approval-у → founder reissue-ить request. **Mitigation:** OK для single-founder-flow. ADR-0037 (Phase 4.5) переносить approval-history (вже-resolved transitions) у DB, але самі pending approvals лишаються in-memory — DB-перенос pending-state-у потребує і-pending-row + restart-policy, що деferred у Phase 5 (multi-operator).
- **Telegram inline-keyboard — UI-debt.** Кнопки після 10 min "тухнуть" — founder натискає → answer-callback "expired". У теорії можна edit-ити message щоб прибрати кнопки після TTL. **Mitigation:** TTL-edit deferred — мала проблема, founder клікне без feedback-у і отримає friendly error.
- **No batch-approve.** 3 write-tool-call-и у одному turn-і → 3 окремі inline-keyboard-карти. Founder клацає 3 рази. **Mitigation:** прийнято свідомо — кожна дія — explicit consent. Якщо 3 кнопки стане annoy-ом, Phase 4.5 додасть "Approve all" мета-кнопку.
- **Allowlist drift.** GitHub-PR на `docs/strategy/` тільки — а раптом founder захоче `docs/launch/`? Доведеться оновлювати server-allowlist + redeploy. **Mitigation:** intentional friction; allowlist — explicit decision-point.

### Re-evaluation triggers

- Founder використовує write-tool < 1 раз/тиждень протягом 4 тижнів → знизити пріоритет; не варто розширювати tool-set, краще зосередитись на read-side.
- Кількість expired (без response) approvals > 20% від total → щось не так з UX (founder не помічає кнопок або вони губляться у chat-flow). Можливо потрібно edit-ити message після TTL.
- Перший write-action, який спричинив incident (поганий PR / помилковий broadcast) → переглянути summary-формат, додати diff-preview-у, або pre-flight-validate-у на server-side.
- Phase 5 multi-operator → додати `requiredApprovals` + per-operator namespace у store.
- Якщо more 50% write-tool-call-ів rejected → LLM пропонує не ті дії; переглянути system-prompt-и (особливо для specialist-personas).

## Alternatives considered

### A. Auto-execute write-tools з post-hoc rollback

LLM виконує write одразу, founder отримає notification + "Undo"-кнопку. Швидше, але:

- "Undo" не реальний для GitHub PR (можна закрити, але contributor history-stamp зостанеться).
- Telegram-broadcast-undo взагалі неможливий (хіба що delete-message API в межах 48h, і то тільки для own-message-ів).
- Створює false sense of security ("ну я ж можу undo") і притупляє founder-vigilance.

**Rejected:** не підходить для real-world side-effect-ів.

### B. Per-tool granular approval (різні timeout-и / required-confirm-actions)

`commit_to_strategy_doc` — чотиригодинний TTL з re-prompt-ом, `pause_workflow` — 5-min TTL без re-prompt-у. Тощо.

- Збільшує surface-у для bug-ів (5 разних flow-ів = 5 разних edge-кейсів).
- Founder-у достатньо однакового UX-у для усіх; різні TTL-и — premature optimization.

**Rejected:** прийнято uniform 10-min TTL для всіх write-tools у Phase 4. Якщо реальна потреба з'явиться — extend-нути per-tool TTL у `ApprovalStore.create()`.

### C. Telegram inline-mode (slash-command auto-complete з кнопкою-тригером)

Замість LLM-tool-call-у, founder сам тригерить write через slash-команду (`/issue <title> --label bug`). Bot validate-ить, виконує без approval-step-у.

- Ламає ADR-0031-ий "agent-driven" flow — LLM більше не оптимізує дії, founder робить роботу руками.
- Нівелює value Phase 4 ("дай LLM-у можливість писати").

**Rejected:** хороша ідея для майбутньої "fast-path"-команди (`/issue`, `/pr`) як ortogonal до agent-flow-у. Але Phase 4 — про agent-driven write-actions.

### D. Webhook-driven (Telegram → server → write-action) без in-memory state

Server тримає approval-state у DB; callback від Telegram — на server endpoint; console — pure UI-glue.

- Більше moving-parts для same UX-у.
- Server-side state добре масштабується для multi-tenant, але Sergeant — single-founder-tool. YAGNI.
- Console уже має grammy + bot-state — додавати DB-layer для approvals = duplication.

**Rejected:** in-memory-store у console — простіше, fewer-pieces. Реevaluate якщо team-scale настане (Phase 5).

## Migration / rollout

1. **Sprint 1 (this PR):** server endpoints + approval-store + executor интерцепція + handler callback-логіка + persona-allowlist update + ADR-0036 + roadmap update + tests.
2. **Acceptance:** founder DM `"Створи issue про X"` у `@OpenClaw_sergeant_bot` → бачить approval-card → натискає Approve → бачить URL відкритого issue-у.
3. **Phase 4.5 (shipped — ADR-0037):** `openclaw_write_audit` table + console-callback wiring + `/audit` slash-команда. "Approve all" / per-tool TTL — deferred як окрема follow-up якщо buttons UX-friction-нуть.
4. **Phase 5:** multi-operator (require N approvals), або per-tool RBAC.

## Compliance

- **ADR-0027 (OpenClaw policy):** Output of agent ще untrusted; write-tool calls перехоплені і не виконуються без human-approve. Compliant.
- **ADR-0031 (OpenClaw v0):** Allowlist + budget cap + DM-only — не зачіпається. Compliant.
- **ADR-0033 (multi-personas):** Persona-tool-filter extend-ається, не замінюється. Compliant.
- **GDPR / data-handling:** Write-tools не зберігають PII founder-а у new locations — лише relay-ять у GitHub / Telegram / n8n / Sentry, які вже opted-in.
