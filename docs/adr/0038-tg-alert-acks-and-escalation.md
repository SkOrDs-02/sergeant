# ADR-0038: Telegram alert acknowledgement + 15-min escalation

- **Status:** Accepted
- **Date:** 2026-05-03
- **Deciders:** @Skords-01
- **Supersedes:** —
- **Related:**
  - [ADR-0030 — Telegram reporting channel structure](./0030-telegram-reporting-channel-structure.md) — forum-mode роутинг.
  - [ADR-0031 — OpenClaw v0 Telegram co-founder](./0031-openclaw-v0-telegram-cofounder.md) — DM bot baseline (escalation-канал).
  - [ADR-0036 — OpenClaw write-tools with approval](./0036-openclaw-write-tools-with-approval.md) — pattern для inline-keyboard callback-handler-у.
  - [`docs/launch/telegram-improvements-roadmap.md` §3.2](../launch/telegram-improvements-roadmap.md#32-acknowledge-кнопка-на-p0p1-alert-ах--15-min-escalation) — pain P2.

---

## Context and Problem Statement

Зараз `Sergeant_alert_bot` працює як **broadcast-only** канал у супергрупу `Sergeant_ops` (per [ADR-0030](./0030-telegram-reporting-channel-structure.md) §2). 19 n8n workflows fan-out-ять у 7 forum-топіків. Жодної interactivity — повідомлення приходять, founder бачить (або ні) і через 4+ годин уже `🔴 Інциденти` має 12 unread alert-ів без нікого знаючого, **які саме** з них уже були handled, а які ще ні.

Pain (per [telegram-improvements-roadmap §2 P2](../launch/telegram-improvements-roadmap.md#2-pain-points--що-зараз-слабко)):

> P2 — Алерти у супергрупі без accountability — нема трекінгу хто бачив, коли. **Frequency:** щодня. **Severity:** high.

Конкретні side-effects:

1. **Alert-fatigue.** Without accountability trail, founder бачить 8 червоних значків і скрол-ує без читання. Real P0 проскакує.
2. **Дубляж зусиль (multi-operator phase 5).** Phase 5 (декілька operators) очікує `tg_operator_allowlist` — без ack-table ніяк не знати чи Operator-A вже взявся, поки Operator-B не дублює дії.
3. **Мovin-target SLO.** "Як швидко я відреагував на P0?" — без ack-метрики неможливо обчислити; ми не можемо налаштувати meaningful error-budget на response-time-у.
4. **Unacked → silently rotting.** Якщо WF-15 deploy-fail приходить о 3-й ночі і founder не бачить — немає механізму ескалації. WF-103 escalation потребує DB-state "цей alert досі unacked".

Solution-shape з roadmap-у §3.2:

```
[ ✅ Прочитав | 🔄 Розбираю | 🔕 Замутити 30хв ]
```

Тиснемо → server INSERT-ить ack у `tg_alert_acks`. Якщо P0 unacked > 15min → WF-103 DM-ескалує через `@OpenClaw_sergeant_bot` (DM, не топік — щоб founder побачив на телефоні persistent notification).

ADR-0036 (Phase 4 write-tools) уже встановив pattern:

- DB-rows append-only, lifecycle-events (як `approved`/`executed`/`rejected`).
- Server route exposed через `/api/internal/*` з bearer-token auth (n8n + console обидва клієнти).
- Console-side handle inline-keyboard, server-side зберігає state.

Цей ADR переносить ту саму архітектуру на `Sergeant_alert_bot`-side, але без LLM-loop-у — тут pure event-driven.

## Considered Options

1. **Дві окремі таблиці: `tg_alerts_posted` + `tg_alert_acks`** (parent-child).
2. **Одна таблиця `tg_alert_acks` з `posted_at` + nullable `ack_at`** (single-row state-machine).
3. **Зберігати ack-state у JSONB-колонці `n8n_failure_events.metadata`** (existing table from WF-98).
4. **Status quo (broadcast-only, без acks).**

## Decision

**Option 2.** Одна таблиця `tg_alert_acks` (mutable за `ack_at`/`escalated_at`), append-only за rows. Кожен alert posted → INSERT з NULL `ack_at`. User натиснув кнопку → UPDATE `ack_at` + `ack_action`. WF-103 побачив unacked > 15min → UPDATE `escalated_at`.

### 1. Schema (`apps/server/src/migrations/031_tg_alert_acks.sql`)

```sql
CREATE TABLE tg_alert_acks (
  id                 BIGSERIAL PRIMARY KEY,
  posted_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Stable id для одного alert-events-у. Формат:
  --   "<workflow_id>:<execution_id>"  для n8n workflows
  --   "<topic>:<sha256(message)>"     для ad-hoc posts
  -- UNIQUE гарантує idempotency: повторний n8n retry не плодить дублі.
  alert_id           TEXT NOT NULL,

  -- Один з 7 forum-топіків (`incidents`, `revenue`, `growth`, ...). NOT
  -- enum-нутий тут — soft-validate на route-side через `Sergeant_ops`
  -- topic-list.
  topic              TEXT NOT NULL,

  -- P0/P1/P2/P3. CHECK-нуто бо контракт фіксований; новий severity-level
  -- (e.g. P-1 "fatal-of-fatals") вимагатиме окремого ALTER TABLE.
  severity           TEXT NOT NULL
    CHECK (severity IN ('P0','P1','P2','P3')),

  -- Free-form подвійник message-у — для UI у `/alerts pending`. Не
  -- посилаємось на Telegram message_id бо message може бути edited
  -- post-fact (recovered notice etc.).
  summary            TEXT,

  -- Populated коли user натиснув ack-кнопку.
  ack_at             TIMESTAMPTZ,
  ack_by_tg_user_id  BIGINT,
  ack_action         TEXT
    CHECK (ack_action IN ('read','investigating','muted')),

  -- Populated коли WF-103 DM-ping-нув founder-а.
  escalated_at       TIMESTAMPTZ,

  -- Free-form (workflow_id, execution_id, raw payload digest, etc.).
  metadata           JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- Idempotency lock — same alert_id arriving twice (n8n retry storm)
  -- noops the second insert via ON CONFLICT DO NOTHING.
  UNIQUE (alert_id)
);

-- WF-103 query: "find unacked P0/P1 older than 15min, not yet escalated".
CREATE INDEX tg_alert_acks_unacked_idx
  ON tg_alert_acks (posted_at DESC)
  WHERE ack_at IS NULL AND escalated_at IS NULL;

-- /alerts pending: "any unacked, newest-first, by topic".
CREATE INDEX tg_alert_acks_pending_idx
  ON tg_alert_acks (topic, posted_at DESC)
  WHERE ack_at IS NULL;
```

Інваріанти:

- **Idempotent INSERT.** `ON CONFLICT (alert_id) DO NOTHING` — n8n retry storm not дубль-ить row-и (або при 60s-timeout-і Telegram, або при manual re-trigger workflow).
- **Mutable за TWO atomic transitions.** `ack_at` (user click) → set-once. `escalated_at` (WF-103) → set-once. Race-у нема: WF-103 query-ять `WHERE ack_at IS NULL AND escalated_at IS NULL` — якщо user clicked поки cron-у triggered, ескалація skip-ється на наступному tick-у.
- **`severity TEXT` з CHECK.** Roadmap §3.2 фіксує 4-tier scale (P0..P3); CHECK на DB-rівні гарантує що n8n не може запустити row-у з опечаткою `"P00"` що поламає WF-103-ескалацію-фільтр.

### 2. Server endpoints

#### `POST /api/internal/alerts/post`

Bearer-auth (`INTERNAL_API_KEY`). Викликається n8n alert workflow-ами **ПЕРЕД** Telegram-send-ом. Body:

```ts
{
  alertId: string,           // "<workflow_id>:<execution_id>" or "<topic>:<sha>"
  topic: string,             // forum-topic key (e.g. "incidents")
  severity: 'P0'|'P1'|'P2'|'P3',
  summary?: string,           // ≤ 4000 chars
  metadata?: Record<string, unknown>,
}
```

Response: `{ ok: true, id: number, alreadyPosted: boolean }`. `alreadyPosted=true` коли idempotency-lock спрацював — n8n тоді skip-ує Telegram-send.

#### `POST /api/internal/alerts/ack`

Bearer-auth. Викликається callback-handler-ом (n8n WF-104 OR `Sergeant_alert_bot` callback) коли user натиснув кнопку у inline-keyboard. Body:

```ts
{
  alertId: string,
  ackByTgUserId: number,
  ackAction: 'read'|'investigating'|'muted',
}
```

Response: `{ ok: true, alreadyAcked: boolean }`. Idempotent — повторний click on rec-ed message no-op-ить.

#### `POST /api/internal/alerts/pending`

Bearer-auth. Body:

```ts
{
  topic?: string,            // optional filter
  severity?: 'P0'|'P1'|'P2'|'P3',
  olderThanMinutes?: number, // for WF-103 escalation cron (default 0)
  notYetEscalated?: boolean, // WF-103 sets true to skip already-escalated
  limit?: number,            // 1..100, default 50
}
```

Response: `{ alerts: TgAlertAckRecord[] }`.

#### `POST /api/internal/alerts/escalate`

Bearer-auth. Marks an alert as escalated to prevent double-DM. Idempotent via `WHERE escalated_at IS NULL`. Body:

```ts
{
  alertId: string;
}
```

Response: `{ ok: true, alreadyEscalated: boolean }`.

### 3. n8n / `Sergeant_alert_bot` wiring

Цей ADR описує і **server foundation** (W3 PR-1, [#1473](https://github.com/Skords-01/Sergeant/pull/1473)), і **n8n surface** (W3 PR-2, [#1480](https://github.com/Skords-01/Sergeant/pull/1480)).

**Foundation (shipped W3 PR-1, #1473):**

- DB migration `031_tg_alert_acks.sql` + down + rollback-sanity test.
- 4 endpoints у `apps/server/src/routes/internal/alerts.ts`: `/post`, `/ack`, `/pending`, `/escalate` — bearer-auth на `INTERNAL_API_KEY`, zod-validated, idempotent.
- 26 unit + route tests (`apps/server/src/routes/internal/alerts.test.ts`, `apps/server/src/modules/alerts/store.test.ts`).

**n8n wiring (shipped W3 PR-2, #1480):**

- **WF-04 (`04-daily-backup-verification.json`)** — reference-implementation. CRITICAL-гілка викликає `POST /api/internal/alerts/post` (idempotent через `alertId = workflow_id:execution_id`) і рендерить inline-keyboard з 3 кнопок (`✅ Прочитав` / `🔄 Розбираю` / `🔕 Замутити 30хв`). `callback_data` формат — `ack:<r|i|m>:<alertId>`, в межах Telegram-овського 64-byte cap-у.
- **WF-104 (`104-alert-callback-router.json`, new)** — `telegramTrigger` на `callback_query` → парсить `callback_data` → `POST /api/internal/alerts/ack` → `editMessageText` (стирає inline-keyboard + appends `✅ acked by @user at HH:MM UTC` footer) → `answerCallbackQuery` toast ("Ack recorded" / "Already acked").
- **WF-103 (`103-alert-escalation-cron.json`, new)** — cron `*/5min` → `POST /api/internal/alerts/pending` (`olderThanMinutes=15, notYetEscalated=true`) → filter to P0/P1 → for each: `POST /api/internal/alerts/escalate` → DM founder via `@OpenClaw_sergeant_bot` raw `sendMessage` (HTML, no inline keyboard). Раз на alert; ON CONFLICT-захист на server-side.
- Усі три workflow-ї закомічені з `"active": false` — потребують ручного toggle у n8n після staging-смоук-у (`post → click → ack → escalate`).

**Deferred (W3 PR-3+):**

- **Wiring решти broadcast-workflows** — WF-03 (Sentry), WF-15 (Railway deploy), WF-18 (security audit), WF-22, та решта 14 — picks up the WF-04 cookie-cutter mechanically. Залишаємо як serial sub-PR-у бо diff per workflow ~30 рядків і кожен потребує окремого smoke-у у staging.
- **OpenClaw `/alerts pending`** slash-команда — query `/api/internal/alerts/pending` без `notYetEscalated`-фільтру, render-у у DM табличкою. Поки `tg_alert_acks` уже у `QUERY_APP_DB_TABLE_ALLOWLIST` (PR-1), founder може звертатися до `/cofounder query_app_db SELECT … FROM tg_alert_acks` ad-hoc.
- **Phase 5 multi-operator** — додає `tg_operator_allowlist` table + `acked_users JSONB` колонку (без schema-break-у).

Цей ADR не блокує жоден з deferred items; кожен — independent S/M follow-up.

### 4. Що НЕ міняється

- **`Sergeant_alert_bot`** залишається long-poll (broadcast-only) і не handle-ить callback-direct-ly. Callback-and-routing handle WF-104 (новий n8n workflow) — це consistent з існуючим pattern-ом "`alert-bot` тільки sendDocument/sendMessage, всі callback-i у n8n side".
- **`OpenClaw_sergeant_bot`** не handle-ить ack-кнопки — DM-bot для diff use-case-у (private dialog). Він тільки **отримує ескалаційний DM** від WF-103.
- **`openclaw_invocations` / `openclaw_write_audit`** — без змін. Це окрема surface (broadcast accountability), не write-tool audit.
- **n8n workflows у git** — тільки коли ми додаємо WF-103/WF-104 (наступні PR-у). Зараз 19 active workflows (per env-config knowledge "n8n-ops") залишаються as-is.

## Rationale

**Чому single mutable table (Option 2) а не parent-child (Option 1):**

- Single-row-per-alert state-machine простіший: `posted_at` → `ack_at`/`escalated_at` — 3 state-transitions, easy to reason about.
- Parent-child (alerts + acks) даний use-case не виправдовує — ми не очікуємо multiple acks per alert (per Phase 5 — multi-operator — додамо `acked_users JSONB` колонку додатково; додавати окрему `acks`-таблицю — over-engineering для founder-mode).
- Index `tg_alert_acks_unacked_idx` (partial WHERE NULL) — O(log N) для WF-103 cron query, не залежить від N total alerts.

**Чому НЕ piggy-back на `n8n_failure_events` (Option 3):**

- `n8n_failure_events` (per env-config "n8n-ops") — це failure-events table з WF-98 dead-letter-у. Тільки **failed** workflow executions. Цей ADR покриває **успішні** alerts теж (Stripe webhooks, Sentry alerts, daily-backups з різними severity-tier-ами) — більшина з них НЕ failure-events.
- Mixing accountability-state у JSONB-metadata-у іншої таблиці — anti-pattern: query "all unacked P0" require-ить `jsonb_path_exists`, не індексу-ється out-of-the-box. Окрема таблиця → індекс → 1ms cron.

**Чому append-only INSERT з UNIQUE-lock-ом замість INSERT-OR-UPDATE pattern-у:**

- INSERT-OR-UPDATE (`ON CONFLICT DO UPDATE`) робить SET для **усіх** колонок, що руйнує idempotency: повторний n8n retry posted-у переписав би `posted_at` newer-timestamp-ом, ламаючи WF-103 escalation-метрику ("alert висить 18 хв" → "alert висить 0 хв").
- `ON CONFLICT DO NOTHING` — pure idempotency. Other transitions (`ack_at`, `escalated_at`) — окремі endpoint-и з targeted UPDATE-ом і phase-condition-ом.

**Чому DM-ескалація через `@OpenClaw_sergeant_bot`, а не топік-mention `@Skords_01` у `🔴 Інциденти`:**

- Топік-mention достатньо у Telegram-app, але якщо founder поза телеграмом — push-notification з топіку губиться у noise. DM-bot push-notification у Telegram pinned-mode видається першим у app-iconchat-list-у. Higher signal-to-noise.
- DM-loop вже має OpenClaw-allowlist (per [ADR-0031](./0031-openclaw-v0-telegram-cofounder.md) §3) — security boundary check бесплатно.

## Consequences

### Positive

- **Accountability trail.** Кожен P0/P1 alert має DB-row з `ack_by_tg_user_id` + `ack_at`. Post-mortem-ний query: `SELECT severity, MEDIAN(ack_at - posted_at) FROM tg_alert_acks WHERE posted_at > NOW() - '7 days'` — TTA (time-to-ack) метрика.
- **Idempotent n8n retries.** WF-15 retry storm не плодить дублі alert-row-ів і не дубль-постить у Telegram (n8n skip-ує send коли `alreadyPosted=true`).
- **Multi-operator-ready.** Schema містить `ack_by_tg_user_id` (BIGINT) — Phase 5 додає `tg_operator_allowlist` table + extends ack-route з allowlist-check-ом без schema change.
- **WF-103 escalation foundation.** DB-query-flow для "знайди unacked > 15min, mark escalated, return list" — все на server-side, n8n тільки orchestrate-ує.

### Negative

- **+1 nullable BIGINT FK у Phase 5.** Коли додамо multi-operator + `tg_operator_allowlist`, міграція 03X_alert_acks_v2 буде ALTER TABLE з validation. Не критично, але ADR-flag-ну для майбутнього.
- **17 broadcast-workflows ще не wired.** WF-04 — reference impl у W3 PR-2; WF-03/15/18/22/решта повертатимуть до старого "no ack" patterns поки не дотягнемо їх mechanically. Кожен — окремий S sub-PR (~30 LOC + smoke). Trade-off за швидший merge: alert-fatigue closure буде incremental, не big-bang.
- **DB-таблиця ще одна.** Sergeant прод already 31 таблицю (post-merge цієї міграції). Кожна нова — +5 sec до ROLLBACK-test cycle у CI. Не ризик, але треба не забувати про bound-check у `apps/server/src/migrations/__tests__/rollback-sanity.test.ts`.

### Neutral

- **`escalation` як окремий endpoint-flag.** Можна було б mash up `pending` + `escalate` в один RPC ("get-and-mark"); вибрали 2 окремі endpoint-и щоб WF-103 міг debug-ити кожен крок окремо. ~50 додаткових ms latency на full cron-tick-у — acceptable.

## Acceptance

**W3 PR-1 (foundation, [#1473](https://github.com/Skords-01/Sergeant/pull/1473), shipped):**

- [x] Migration `031_tg_alert_acks.sql` forward+down apply-ять чисто у CI rollback-sanity test.
- [x] 4 endpoint-и validated unit-тестами (z-schema reject, idempotency lock, ack/escalation transition correctness) — 26 tests pass.
- [x] `tg_alert_acks` додана до `QUERY_APP_DB_TABLE_ALLOWLIST` у `apps/server/src/modules/openclaw/types.ts` — щоб OpenClaw `/alerts pending` міг через `query_app_db` (read-only) повертати list.
- [x] Roadmap §3.2 status оновлено на "foundation-shipped" з посиланням на цей ADR.

**W3 PR-2 (n8n wiring, [#1480](https://github.com/Skords-01/Sergeant/pull/1480), shipped):**

- [x] WF-04 CRITICAL-гілка постить idempotent row у `tg_alert_acks` і рендерить 3-кнопковий inline-keyboard.
- [x] WF-103 + WF-104 додані у `ops/n8n-workflows/` + `manifest.json` + `REPORTING-MATRIX.md` (з footnote ⁽⁵⁾⁽⁶⁾).
- [x] `pnpm ops:n8n:validate` ловить 23 workflows; `scripts/n8n/validate-n8n-workflows.mjs` regex relaxed до `\d{2,}-` щоб manifest міг рости поза 99.
- [x] Roadmap §3.2 status оновлено на "ack-button + escalation cron live".

**Deferred (W3 PR-3+, not yet shipped):**

- [ ] Wiring 17 решти broadcast-workflows (WF-03/15/18/22/...) — mechanical follow-up sub-PR-у.
- [ ] End-to-end staging-смоук (post → click → ack → escalate → DM founder) перед прод-активацією WF-04/103/104.
- [ ] OpenClaw `/alerts pending` slash-команда (DM-render unacked-list).
- [ ] Phase 5 multi-operator (`tg_operator_allowlist` + `acked_users JSONB`).

## Related work

**Server foundation (W3 PR-1):**

- [`apps/server/src/migrations/031_tg_alert_acks.sql`](../../apps/server/src/migrations/031_tg_alert_acks.sql) + `.down.sql`
- [`apps/server/src/modules/alerts/store.ts`](../../apps/server/src/modules/alerts/store.ts) — DB helpers.
- [`apps/server/src/routes/internal/alerts.ts`](../../apps/server/src/routes/internal/alerts.ts) — 4 endpoints.

**n8n wiring (W3 PR-2):**

- [`ops/n8n-workflows/04-daily-backup-verification.json`](../../ops/n8n-workflows/04-daily-backup-verification.json) — reference impl: `Build alert payload` → `POST /api/internal/alerts/post` → `Telegram → CRITICAL` з `reply_markup`.
- [`ops/n8n-workflows/103-alert-escalation-cron.json`](../../ops/n8n-workflows/103-alert-escalation-cron.json) — escalation cron `*/5min`.
- [`ops/n8n-workflows/104-alert-callback-router.json`](../../ops/n8n-workflows/104-alert-callback-router.json) — Telegram callback router.

**Context:**

- [`docs/launch/telegram-improvements-roadmap.md` §3.2](../launch/telegram-improvements-roadmap.md#32-acknowledge-кнопка-на-p0p1-alert-ах--15-min-escalation) — pain P2 context.
- [`ops/n8n-workflows/REPORTING-MATRIX.md`](../../ops/n8n-workflows/REPORTING-MATRIX.md) — WF-04/103/104 rows + footnotes ⁽⁵⁾⁽⁶⁾.
