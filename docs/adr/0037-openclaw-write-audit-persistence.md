# ADR-0037: OpenClaw Phase 4.5 — DB-persistent write-audit log

- **Status:** Accepted
- **Date:** 2026-05-03
- **Deciders:** @Skords-01
- **Supersedes:** —
- **Related:**
  - [ADR-0027 — OpenClaw / Console / MCP policy](./0027-openclaw-console-mcp-policy.md)
  - [ADR-0031 — OpenClaw v0 Telegram co-founder bot](./0031-openclaw-v0-telegram-cofounder.md)
  - [ADR-0033 — OpenClaw multi-personas + `/council`](./0033-openclaw-multi-personas-and-council.md)
  - [ADR-0036 — OpenClaw write-tools with approval flow](./0036-openclaw-write-tools-with-approval.md) — Phase 4 baseline.
  - [`docs/launch/openclaw-roadmap.md`](../launch/openclaw-roadmap.md) — Phase 4.5 section.

---

## Context and Problem Statement

ADR-0036 (Phase 4) запустив 5 write-tools з founder-approval gate-ом. Кожен Approve / Reject / Executed transition зараз логуються одним `console.log("[openclaw] write-tool …")` рядком у `apps/console`. Це достатньо для smoke-test-у в перші тижні, але уже в Phase 4 acceptance-у виявилися два gap-и:

1. **Не вижи­ває рестарт console-у.** Railway redeploy / OOM / 409-retry → попередній stream stdout відсутній у новому контейнері. Якщо founder Approve-нув PR-creation у середу і хоче в п'ятницю згадати "ми це робили?" — `grep` по log-stream-у дає або порожньо, або обрізане вікно (Railway тримає ~7 днів за `info`-tier).
2. **Не queryable.** "Скільки разів я Reject-нув `pause_workflow` за останні 30 днів?", "Чи `commit_to_strategy_doc` виконався, чи 5xx?", "Які write-actions були за минулий weekend?" — на console-log-у це boil-ає до Railway-UI grep-у з ~20-секунд roundtrip-ом і без ergonomic фільтрів.

ADR-0036 §4 явно відмітив цей debt: _"Phase 4.5 wires цей сигнал у DB-таблицю `openclaw_write_audit` (не зараз — щоб не coupling deploy-у з міграцією)"_. Roadmap.md → `Phase 4.5 (deferred)` зафіксував три bullet-и: DB-persistent audit, "Approve all" мета-кнопка, diff-preview для `commit_to_strategy_doc`. Цей ADR закриває **тільки перший bullet** (DB persistence); решту відкладаємо до окремого PR-у, бо вони не коштує schema-зміни.

## Considered Options

1. **Append-only `openclaw_write_audit` row на кожен transition (`approved`/`rejected`/`executed`).** Один лог-rows, повний lifecycle reconstructable за `approval_id` + `recorded_at`.
2. **Mutable `openclaw_write_audit` (one row per approval-id, оновлюється при executed).** Менше row-ів, але втрачаємо timing — коли founder натиснув Approve відрізнити від коли HTTP-call закінчився.
3. **Розширити `openclaw_invocations.tool_calls` JSONB-ом замість окремої таблиці.** Tool-call вже містить write-tool-call-и. Можна було б додати `approved_at`/`executed_at` поля у JSON-структуру.
4. **Винести у окремий `openclaw_audit_log` table (єдиний для read- + write-tool аудитів).** Уніфікований лог, але breaks back-compat — `tool_calls` JSONB вже містить read-tool-call-и.
5. **Status quo (тільки `console.log`).** Залишаємо Phase 4.5 deferred.

## Decision

Append-only `openclaw_write_audit` table з трьома lifecycle-actions: `approved`, `executed`, `rejected`. Рядки створюються **синхронно з callback-handler-ом** у `apps/console`, через новий internal endpoint `POST /api/internal/openclaw/write-audit/log` на server-side. Список доступний через `POST /api/internal/openclaw/write-audit/list` і нову `/audit` slash-команду у DM.

### 1. Schema (`apps/server/src/migrations/030_openclaw_write_audit.sql`)

```sql
CREATE TABLE openclaw_write_audit (
  id                 BIGSERIAL PRIMARY KEY,
  recorded_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  approval_id        TEXT NOT NULL,
  tool               TEXT NOT NULL,
  founder_user_id    TEXT NOT NULL,
  founder_tg_user_id BIGINT NOT NULL,
  invocation_id      BIGINT REFERENCES openclaw_invocations(id) ON DELETE SET NULL,
  action             TEXT NOT NULL CHECK (action IN ('approved','executed','rejected')),
  input              JSONB NOT NULL DEFAULT '{}'::jsonb,
  http_status        INTEGER,
  ok                 BOOLEAN,
  response_excerpt   TEXT,
  persona            TEXT,
  metadata           JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX openclaw_write_audit_recorded_idx
  ON openclaw_write_audit (recorded_at DESC);
CREATE INDEX openclaw_write_audit_approval_idx
  ON openclaw_write_audit (approval_id, recorded_at DESC);
CREATE INDEX openclaw_write_audit_tool_idx
  ON openclaw_write_audit (tool, recorded_at DESC);
CREATE INDEX openclaw_write_audit_founder_idx
  ON openclaw_write_audit (founder_user_id, recorded_at DESC);
```

Інваріанти:

- **Append-only.** Жодних `UPDATE` queries; кожен transition — нова row. Reconstructed через `SELECT … WHERE approval_id = $1 ORDER BY recorded_at`.
- **Lifecycle pairing.** `rejected` — окремий-row-end. `approved` + `executed` — пара (founder натиснув Approve → server відпрацював → друга row з `http_status`/`ok`/`response_excerpt`). Якщо `approved` без supplement-арного `executed` за ≥10 min → `executeApprovedWriteTool` crash-нувся посередині або console-у не дав закрити цикл (виявляється query-ом).
- **`invocation_id ON DELETE SET NULL`.** Audit-row не блокує GC-stream `openclaw_invocations` (якщо ми колись додамо retention). FK збережений для join-ів `audit ⨝ invocations` коли запис ще живий.
- **`tool` як TEXT, не CHECK.** ADR-0036 fixed-набір 5 tools, але майбутні Phase 4.x можуть додати ще — не хочемо блокувати DDL-redeploy за runtime-write. Soft-validate-ять у Zod на endpoint-і + через `OPENCLAW_WRITE_TOOL_NAMES`.

### 2. Server endpoints

#### `POST /api/internal/openclaw/write-audit/log`

Bearer-auth-ed (`INTERNAL_API_KEY`). Body:

```ts
{
  approvalId: string,
  tool: WriteToolName,
  founderUserId: string,
  founderTgUserId: number,
  invocationId?: number,
  action: 'approved' | 'executed' | 'rejected',
  input?: Record<string, unknown>,
  httpStatus?: number,        // for action=executed
  ok?: boolean,                // for action=executed
  responseExcerpt?: string,    // for action=executed (truncated to 4 KB server-side)
  persona?: string,            // cofounder | ops | growth | eng | finance
  metadata?: Record<string, unknown>,
}
```

Response: `{ ok: true, id: number }`.

#### `POST /api/internal/openclaw/write-audit/list`

Body:

```ts
{
  founderUserId: string,
  limit?: number,        // 1..100, default 20
  tool?: WriteToolName,  // optional filter
  action?: 'approved' | 'executed' | 'rejected', // optional filter
  persona?: string,      // optional filter
}
```

Response: `{ audits: OpenClawWriteAuditRecord[] }`.

### 3. Console wiring

`apps/console/src/openclaw/handler.ts` callback handler заміняє два існуючі `console.log("[openclaw] …", { tool, … })` сайт-и (rejected + executed) на `postJson` calls до `/api/internal/openclaw/write-audit/log`. Approve path логує **двічі** — `approved` ДО HTTP-call-у, `executed` ПІСЛЯ. Логи зробили fail-soft (тиха помилка не блокує user-visible reply): якщо audit-endpoint падає, founder все одно бачить approve-result у DM, тільки в БД stale row.

### 4. `/audit` slash-команда

Новий DM-handler у тому самому handler.ts:

```
/audit                    → останні 20 write-actions (всі tools/personas)
/audit <tool>             → фільтр по tool-name
/audit <tool> <action>    → tool + action (approved|executed|rejected)
/audit help               → coloured cheatsheet
```

Format відповіді — таблиця `recorded | tool | action | persona | summary` з MarkdownV2-escape-ом (≤20 row-ів => single message).

### 5. Що НЕ міняється

- `openclaw_invocations.tool_calls` — без змін; write-tool-call-и продовжують там жити як один з tool-call-ів turn-у.
- `ApprovalStore` (in-memory у console) — без змін; залишається 10-min TTL і не persist-иться. ADR-0036 §2.1 явно argue-ить що persist approvals → over-engineering для single-founder. Phase 4.5 фіксує тільки **post-decision** audit, не pre-decision queue.
- Persona-tool-filter (ADR-0033/0036) — без змін.
- Budget/rate-limit guard — без змін; `/audit` rate-limit-нутий тим же `FixedWindowRateLimiter` що й інші DM-команди.
- Server-side write-tool routes (`/api/internal/openclaw/write/*`) — без змін; вони не знають про audit (audit-логування — console-side responsibility).

## Rationale

**Чому append-only а не mutable:**

- Reconstructed timeline: `approved` (T1) → `executed` (T2) → ми бачимо latency `T2 - T1` (для post-mortem-у "approve до executed взяло 7 секунд, чому?"). Mutable з `executed_at`-полем втратив би `approved_at` як standalone-row-event.
- Append-only простіше для concurrent-write-ів (rejected double-click → two rows, idempotent INSERT-и; не треба row-locking-у).
- Storage не критичний — 5 tools × ~10/тиждень × 3 actions = ~150 rows/тиждень, ~7800 rows/рік. JSONB-input середньо ~1-2 KB. ~10-15 MB/рік на single-founder-rate. Можна не задумуватися про partitioning або retention ще 5 років.

**Чому окрема таблиця а не extend `openclaw_invocations.tool_calls`:**

- `tool_calls` JSONB — pre-aggregate-ed snapshot turn-у; immutable після `finalizeInvocation`. Approve / executed transitions — пост-turn events (founder натискає кнопку через 2 хвилини після LLM-reply-у). UPDATE-вати JSONB після finalize порушує invariant "row=turn".
- Окрема таблиця → SQL-queries по action / tool / latency — тривіальні (`WHERE action = 'rejected' AND tool = 'pause_workflow'`); JSONB-фільтри потребують `jsonb_path_exists` або `jsonb_array_elements` що повільніше і неіндексу-ється out-of-the-box.

**Чому fail-soft (audit-endpoint failure не блокує user reply):**

- User-visible primary path — реакція бот-а на approve-click (PR URL / error-body). Якщо audit-endpoint timeout-нув / 5xx-нув і ми б hard-fail-or — founder бачить "fail" коли реальна write-action успішно виконалась. Хибна тривога коштує дорожче, ніж пропущений audit-row.
- Mitigated через `console.warn("[openclaw] audit-log failed", { … })` — у Sentry breadcrumb-ах це видно, можна alert-нути на post-mortem-rate-у > 1%.

**Чому `/audit` slash а не окремий dashboard:**

- Founder уже у Telegram, додавати трудоємкий switch на web-UI = friction. `/audit` matches mental-model "/decisions" (recall) і "/help".
- 20-row table легко влізає у one-message Telegram (max 4096 chars MarkdownV2; row ~80 chars × 20 = 1600). Якщо таблиця розжирає — завжди можна додати pagination або /audit-export → CSV у DM. YAGNI до того моменту.

## Consequences

### Positive

- **Post-mortem без хитрощів.** Будь-який query на write-history → один SQL-statement або одна `/audit` команда. Не потрібен Railway log-grep.
- **Rebootovaný console зберігає історію.** Залишковий debt від ADR-0036 §1 (negative bullet) закритий.
- **Lifecycle-latency observable.** SELECT-розрахунок `executed.recorded_at - approved.recorded_at` за `approval_id` дає latency executor-а — useful коли write-tool починає flap-ати (network до GitHub deg-нувся, e.g.).
- **Future-proof для Phase 5 (multi-operator).** Коли додасться другий operator, додаємо `actor_user_id` колонку + extend-ємо `action`-enum (`pre-approved`, `co-approved`). Append-only — single ALTER TABLE без backfill-у.

### Negative

- **Нова DB-таблиця → нова міграція.** Один `030_openclaw_write_audit.sql` row у sequential-list-і; rollback через `.down.sql`. Не блокуючий, але +5 min при першому redeploy.
- **Console → server callout у callback-flow-і.** До цього callback-handler робив тільки existing endpoint-ы (write-tool execute) + `console.log`. Тепер ще один HTTP-roundtrip на approved + executed (rejected — теж). Latency ~50-200ms (Railway-internal) — додає ~250-700ms до approve-button-feedback-у. Mitigated через **fire-and-forget** з `void postJson(...)` без `await` — handler не чекає audit-call-у. Trade-off: при стартапі-mode console crash-у дані можуть втратитися (race race race), але ми приймаємо це як acceptable для phase 4.5 simplicity-сurve-ом.
- **Audit-log != source of truth для approval-state.** `ApprovalStore` (in-memory) залишається authoritative для "чи можна Approve-нути цей id". Audit-log — read-only spectator. Якщо хтось буде писати feature ("re-approve historical write-action by id"), вона не зможе спиратися на audit-log без додаткового перебудовування ApprovalStore-а.

### Neutral

- Existing read-tools (12 з ADR-0031/0033) — без змін; не logged у `openclaw_write_audit`. Read-tool-call-и вже у `tool_calls` JSONB-і (`openclaw_invocations`) — досить.
- Persona-tool-filter (`ADR-0033`/`ADR-0036`) — extend-ається тільки якщо ми колись додамо `read_audit_log` як LLM-tool; зараз `/audit` — pure user-side command.

## Migration / rollout

1. **Sprint 1 (this PR):** migration 030 + server endpoints + store-helpers + handler wiring + `/audit` slash + ADR-0037 + roadmap update + tests (store + endpoint + handler integration).
2. **Acceptance criteria:**
   - Approve-нувши `commit_to_strategy_doc` у DM → `SELECT * FROM openclaw_write_audit WHERE approval_id = '<id>'` повертає 2 rows: `approved` + `executed`. `executed.http_status` = 200 (PR-URL у `response_excerpt`).
   - Reject-нувши `pause_workflow` → 1 row з `action='rejected'` і відсутнім `http_status`.
   - `/audit pause_workflow rejected` → одна-row у table-у з тим самим record-ом.
3. **Rollout:** Railway pre-deploy migration → no downtime (forward-additive). Console redeploy після server.
4. **Phase 4.5+ (наступні PR-и, не у цьому):**
   - "Approve all" мета-кнопка для batch-approval-у одного turn-у.
   - Diff-preview для `commit_to_strategy_doc` (зараз — тільки path + summary у card-body).
   - Optional retention policy (`DELETE FROM openclaw_write_audit WHERE recorded_at < NOW() - INTERVAL '1 year'`) якщо row-count розжирає.

## Compliance

- **ADR-0027 (OpenClaw policy).** Audit-log тримає human-decision visibility — compliant.
- **ADR-0031 (OpenClaw v0).** Allowlist + budget cap не зачіпаються; new endpoint під тим же `INTERNAL_API_KEY` Bearer.
- **AGENTS.md hard rule #1 (bigint coercion).** `id` BIGSERIAL → `Number(r.id)` у serializer (`listRecentWriteAudits` — у `apps/server/src/modules/openclaw/store.ts`).
- **AGENTS.md hard rule #4 (sequential migrations + .down.sql).** `030_openclaw_write_audit.sql` + `030_openclaw_write_audit.down.sql`. Forward-additive (CREATE TABLE), so no two-phase pattern needed.
- **GDPR / data-handling.** `input` JSONB може містити `commit_to_strategy_doc.content` — strategy-doc text. Це founder-authored data, не PII end-user-ів. Compliant.
- **Migration rollback sanity test (`apps/server/src/migrations/__tests__/rollback-sanity.test.ts`)** — auto-detect-ить `030_openclaw_write_audit.down.sql` і прогоне його на CI.

## Links

- ADR-0036 — write-tools approval baseline.
- `docs/launch/openclaw-roadmap.md` Phase 4.5 — original deferred bullet.
- `apps/server/src/migrations/030_openclaw_write_audit.sql` — schema.
- `apps/server/src/modules/openclaw/store.ts` — `recordWriteAudit`, `listRecentWriteAudits`.
- `apps/server/src/routes/internal/openclaw.ts` — `/write-audit/log` + `/write-audit/list`.
- `apps/console/src/openclaw/handler.ts` — callback handler wiring + `/audit` slash command.
