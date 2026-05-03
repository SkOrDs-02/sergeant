# Telegram surfaces — план покращень

> **Last validated:** 2026-05-03 by @Skords-01. **Next review:** 2026-08-01.
> **Status:** Active

> Поетапний план покращень Telegram-частини Sergeant — двох ботів
> (`@Sergeant_alert_bot`, `@OpenClaw_sergeant_bot`), супергрупи
> `Sergeant_ops` з 7 forum-топіками і n8n→TG fan-out.
>
> Цей файл — **operating roadmap для Telegram-сурфейсів**, не ADR. Конкретні
> архітектурні рішення в межах кожної ідеї будуть оформлені окремими ADR-ами
> (вказано у колонці "ADR" таблиці нижче).
>
> Пов'язане:
> [openclaw-roadmap.md](./openclaw-roadmap.md) (фази OpenClaw),
> [05-operations-and-automation.md](./05-operations-and-automation.md#62-телеграм-як-control-room) (Telegram як control-room),
> [ADR-0030](../adr/0030-telegram-reporting-channel-structure.md) (forum-mode роутинг),
> [ADR-0031](../adr/0031-openclaw-v0-telegram-cofounder.md) (OpenClaw v0 baseline),
> [ADR-0036](../adr/0036-openclaw-write-tools-with-approval.md) (write-tools approval),
> [ADR-0037](../adr/0037-openclaw-write-audit-persistence.md) (write-audit persistence).

---

## 1. Поточна картина

```
┌─────────────────────────────────────────────────────────────┐
│ Sergeant Telegram surfaces (2026-05-03)                      │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  @Sergeant_alert_bot (id 7949536379)                         │
│  ├─ broadcast у супергрупу `Sergeant_ops` (-1003924852082)   │
│  ├─ 7 forum-топіків:                                         │
│  │    🔴 Інциденти      🚀 Зростання                          │
│  │    💰 Виторг         📊 Дайджести                          │
│  │    🤝 Мета           🛠 Інженерія                           │
│  │    ⚙️ Контрол-план                                          │
│  ├─ source: 19 n8n workflows (WF-01..WF-99)                  │
│  └─ interactivity: ❌ none (зараз — pure broadcast)            │
│                                                              │
│  @OpenClaw_sergeant_bot (id 8614051263)                      │
│  ├─ DM-only ↔ founder (allowlisted user_id)                  │
│  ├─ 5 personas: cofounder · ops · growth · eng · finance     │
│  ├─ 12 read-tools (PG, n8n, GitHub, Stripe, PostHog, ...)    │
│  ├─ 5 write-tools з approval gate (ADR-0036)                 │
│  ├─ /audit slash-command (ADR-0037 Phase 4.5)                │
│  └─ proactive: ❌ none (Phase 2 — наступне)                    │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

**Розділення відповідальностей** (per [openclaw-roadmap.md §1](./openclaw-roadmap.md#1-mental-model--у-нас-уже-60-інфри)):

- `Sergeant_alert_bot` — **broadcast / control-room**. Шумний, без діалогу.
- `OpenClaw_sergeant_bot` — **тихий co-founder DM**. Multi-turn, з пам'яттю.
- Боти **не діляться** функціоналом (per [ADR-0031 §НЕ робимо](../adr/0031-openclaw-v0-telegram-cofounder.md)).

---

## 2. Pain points — що зараз слабко

| #   | Pain                                                                                  | Surface                        | Frequency       | Severity |
| --- | ------------------------------------------------------------------------------------- | ------------------------------ | --------------- | -------- |
| P1  | OpenClaw 100% reactive — не починає розмову, founder мусить йти питати                | OpenClaw DM                    | щодня           | high     |
| P2  | Алерти у супергрупі без accountability — нема трекінгу хто бачив, коли                | `Sergeant_ops` (всі топіки)    | щодня           | high     |
| P3  | WF-15 Railway deploy — повторюваний `Bad request` (3+/24h) шумить у `⚙️ Контрол-план` | `Sergeant_ops/⚙️ Контрол-план` | 3×/добу         | medium   |
| P4  | Approval-кнопки повільні — long-poll latency 1-3с на callback                         | OpenClaw DM (write-tools)      | при approval    | medium   |
| P5  | Alert-storm-и (Sentry spike, Railway flap) flood-ять топік без dedup-у                | `Sergeant_ops`                 | епізодично      | medium   |
| P6  | `/audit` показує тільки 20 row-ів без time-window або CSV-export                      | OpenClaw DM                    | при post-mortem | low      |
| P7  | Нема `/help` discovery — нові оператори не знатимуть command-set                      | OpenClaw DM                    | при onboarding  | low      |
| P8  | `read_telegram_topic_history` — Phase 1 stub, повертає empty                          | OpenClaw → tool-call           | при tool-use    | low      |
| P9  | Бот падає → 6+ хв backoff retry без leader-election                                   | OpenClaw DM                    | епізодично      | low      |
| P10 | Console-service на Railway досі `sergeant-hubchat` (legacy ім'я per ADR-0032)         | Railway / DevOps               | постійно        | very low |

---

## 3. Топ-5 покращень (першочергові)

### 3.1. Ранкова повістка о 08:30 Kyiv (DM-proactive)

**Status:** roadmapped (Phase 2.A в [openclaw-roadmap.md §3 Phase 2](./openclaw-roadmap.md)).
**Pain закриває:** P1.
**ADR-кандидат:** ADR-0038 ("OpenClaw proactive cron-rituals").

**Що:** новий cron (Railway scheduler або n8n WF-101) → `POST /api/internal/openclaw/ritual/morning` → console DM-постить 5-8 рядків:

- Stripe MRR delta (24h)
- PostHog signups (24h)
- Sentry new issues (24h)
- GitHub PR queue (open)
- Open ops-alerts count
- 1 пропозиція дня (з cofounder-memory recall)

**Чому:** OpenClaw зараз 100% reactive — daily-touchpoint який тримає priorities відсутній.

**Effort:** M (~2-3 дні: новий endpoint + cron + DM-helper, без LLM-architecture-ризику).

**Risks:**

- Message-fatigue якщо повідомлення довге → strict ≤8 lines invariant.
- Idempotency — skip якщо уже постили сьогодні.
- LLM-budget — 1 ritual = ~$0.10, контролюється `OPENCLAW_DAILY_USD_BUDGET=$5`.

**Acceptance:**

- DM до founder 08:30 Kyiv щодня окрім вихідних (опційно).
- Failover: якщо ritual не зміг — пост у `⚙️ Контрол-план` через alert-bot.

---

### 3.2. Acknowledge-кнопка на P0/P1 alert-ах + 15-min escalation

**Status:** **foundation shipped** (Wave 3 PR-1) — ADR-0040 + table
`tg_alert_acks` + 4 endpoint-и (`/api/internal/alerts/{post,ack,pending,
escalate}`) live на server. n8n inline-keyboard wiring + WF-103/WF-104 +
OpenClaw `/alerts pending` slash — окремі follow-up PR-у (W3 PR-2/PR-3).
**Pain закриває:** P2.
**ADR-кандидат:** [ADR-0040](../adr/0040-tg-alert-acks-and-escalation.md) ("Alert acknowledgement + escalation").

**Що:** WF-03 / WF-15 / WF-18 / WF-22 шлють alert у топік → `@Sergeant_alert_bot` додає inline-keyboard:

```
[ ✅ Прочитав | 🔄 Розбираю | 🔕 Замутити 30хв ]
```

Click → server `/api/internal/alerts/ack` → record у новій table `tg_alert_acks`. Якщо P0 unacked > 15min → escalate: WF-103 dm-ping founder через `@OpenClaw_sergeant_bot` ("⚠️ unacknowledged P0 alert у `🔴 Інциденти`: …").

**Чому:** зараз alert-и просто падають у топік; founder може не бачити 4+ годин; нема accountability trail.

**Effort:** M (~2-3 дні): новий route + table + WF-103 escalation + bot inline-keyboard handler.

**Schema:**

```sql
CREATE TABLE tg_alert_acks (
  id BIGSERIAL PRIMARY KEY,
  alert_id TEXT NOT NULL,                  -- workflow_id + execution_id
  topic TEXT NOT NULL,                     -- forum-topic key
  severity TEXT NOT NULL CHECK (severity IN ('P0','P1','P2','P3')),
  posted_at TIMESTAMPTZ NOT NULL,
  ack_at TIMESTAMPTZ,
  ack_by_tg_user_id BIGINT,
  ack_action TEXT CHECK (ack_action IN ('read','investigating','muted')),
  escalated_at TIMESTAMPTZ,
  metadata JSONB
);
CREATE INDEX idx_tg_alert_acks_unacked
  ON tg_alert_acks (posted_at DESC) WHERE ack_at IS NULL;
```

**Acceptance:**

- Кожен P0/P1 alert приходить з 3-кнопковим row-ом.
- Click → callback latency ≤2s (з webhook — ≤500ms — див. §3.5).
- P0 unacked 15min → DM-ескалація.
- `/alerts pending` slash-команда у `OpenClaw_sergeant_bot` показує unacked-list.

**Risks:**

- Multi-operator phase 5 → `ack_by_tg_user_id` має бути в allowlist team-у, не тільки founder. Mitigation: окрема `tg_operator_allowlist` table, поки що hard-coded на founder TG user_id.
- Race condition між кнопкою і escalation-ом → server-side optimistic-lock per alert_id.

---

### 3.3. `/audit since=` + `--csv` export

**Status:** shipped — Wave 1, ADR-0037 follow-up. `since=<dur>` (max 30d) і
`csv` тепер в `apps/console/src/openclaw/handler.ts`; helpers в
`duration.ts` + `audit-csv.ts`.
**Pain закриває:** P6.
**ADR-кандидат:** none (extension Phase 4.5 без новoï ADR).

**Що:** додати до існуючого `/audit` slash-команди:

- `since=<duration>` — `24h`, `7d`, `30m` parsing.
- `csv` — bot робить `sendDocument` з CSV-файлом, тіж column-и (recorded_at, tool, action, persona, http_status, approval_id).

**Чому:** Phase 4.5 щойно поставила трубу для post-mortem-ів — додати time-window + export це 30-line зміна, дає реальну силу.

**Effort:** S (~½ дня): 2 рядки SQL + arg-parser у `handler.ts` + 3 тести.

**Implementation:**

- `apps/server/src/modules/openclaw/store.ts::listRecentWriteAudits` приймає optional `recordedAfter?: Date`.
- `apps/console/src/openclaw/handler.ts::handleAuditCommand` парсить `since=24h` через `parseDuration()` helper.
- CSV-rendering в `apps/console/src/openclaw/audit-csv.ts` (новий файл, ~30 рядків).

**Acceptance:**

- `/audit since=7d` повертає всі write-actions за 7 днів (max 100 row-ів, як зараз).
- `/audit csv` шле CSV-файл з останніми 20.
- `/audit since=24h csv` шле CSV за 24h.

---

### 3.4. WF-15 Bad request — payload-schema fix

**Status:** **shipped** (Wave 1, PR за цим розділом). Root-cause був НЕ schema-drift, а Telegram Markdown-parser, що ламається на `*` / `_` / `` ` `` у commit-message-і — `parse_mode: Markdown` (legacy) не підтримує backslash-escape. Switched to `parse_mode: HTML` + `htmlEscape()` у parser-node.
**Pain закриває:** P3.
**ADR-кандидат:** none (bug-fix у workflow JSON).

**Що зроблено:** витягнули останні 5 failed executions з `n8n_API` (`/api/v1/executions?status=error&workflowId=CygZ4vLxTm2ltuRW`) → у всіх Telegram повертав `Bad Request: can't parse entities: Can't find end of the entity starting at byte offset N` (наприклад на commit-message-і `feat(...): cut over fizruk reads to SQLite, add server applyFizruk* (#1449)` — unmatched `*`). Перевели `15-railway-deployment-notify.json` на HTML-mode + `<b>`/`<code>` шаблон, додали `*Html` варіанти у `Parse Railway payload` node.

**Effort:** S (~½ дня): debug + workflow JSON edit + `15-railway-deployment-notify.README.md` payload-schema doc.

**Acceptance:**

- 0 `Bad request` errors у WF-15 за 7-day window після merge — track через `n8n_API` `/executions?status=error&workflowId=CygZ4vLxTm2ltuRW`.
- Railway webhook payload-schema задокументовано у [`ops/n8n-workflows/15-railway-deployment-notify.README.md`](../../ops/n8n-workflows/15-railway-deployment-notify.README.md).

**Bundle з §3.7 alert dedup** для повного fix story (без dedup нова правильна версія може теж spam-нути).

---

### 3.5. Webhook замість long-poll для OpenClaw bot

**Status:** new.
**Pain закриває:** P4.
**ADR-кандидат:** ADR-0041 ("Telegram webhook delivery").

**Що:** конвертувати `bot.start()` (long-poll mode) у `setWebhook(https://console.sergeant.app/tg/openclaw)` + Express handler. `Sergeant_alert_bot` лишається long-poll (broadcast-only, без callback latency-issue).

**Чому:** callback-кнопки (Phase 4 approval, §3.2 ack-button) latency 1-3с. Webhook → <500ms. UX-помітно.

**Effort:** M (~2 дні + ADR).

**Risks:**

- TLS-cert на Railway — already provided via Railway custom domain.
- Telegram retry-contract: must respond 200 за <60s, ідеально <1s. Mitigation: `setWebhookOptions({ max_connections: 40 })` + Express middleware respond-immediately + queue heavy work.
- Single-active-webhook constraint: тільки один URL за токеном; deploy-у потрібен short maintenance-window для webhook-swap.

**Acceptance:**

- Approval-кнопка від click до DB-INSERT у `openclaw_write_audit` < 800ms (зараз ~2-3s).
- Auto-fallback на long-poll якщо webhook-fail > 3 мин (Telegram robustness pattern).

---

## 4. Решта ідей (по hierarchy)

### 4.1. OpenClaw DM bot

| ID   | Ідея                                                               | Pain | Effort | ADR  | Wave  |
| ---- | ------------------------------------------------------------------ | ---- | ------ | ---- | ----- |
| A.1  | Phase 2.B: Friday weekly + monthly OKR (бродкаст у `📊 Дайджести`) | P1   | M      | 0038 | W3    |
| A.2  | Phase 3: `/plan`, `/analyze`, `/okr` strategic primitives          | —    | L      | 0039 | Later |
| A.3  | "Approve all" мета-кнопка для batch-turn approvals                 | —    | M      | —    | Later |
| A.4  | Diff-preview для `commit_to_strategy_doc`                          | —    | M      | —    | Later |
| A.5  | Voice notes input (Whisper transcription)                          | —    | M      | —    | Later |
| A.6  | `/help` discovery + inline keyboard                                | P7   | XS     | —    | W4    |
| A.7  | Persona quick-switch row у boot-message-і дня                      | —    | S      | —    | W4    |
| A.8  | `/forget {topic}` — memory-write з approval                        | —    | M      | —    | Later |
| A.9  | Pinned context = long-term focus injection                         | —    | S      | —    | Later |
| A.10 | Edit message → re-run loop                                         | —    | S      | —    | Later |
| A.11 | Reply threading (Telegram `reply_to_message_id`)                   | —    | M      | —    | Later |
| A.12 | Nightly self-summary (02:00 Kyiv)                                  | —    | S      | —    | Later |
| A.13 | Error-budget visualization (`/budget`)                             | —    | XS     | —    | Later |

### 4.2. Sergeant_alert_bot supergroup

| ID  | Ідея                                                       | Pain | Effort | ADR | Wave  |
| --- | ---------------------------------------------------------- | ---- | ------ | --- | ----- |
| B.1 | Alert dedup / occurrence-counter (10-min window)           | P5   | M      | —   | W3    |
| B.2 | `/silence WF-15 30m` topic command                         | —    | M      | —   | Later |
| B.3 | "Recovered" reaction-detection (`message_reaction` update) | —    | S      | —   | Later |
| B.4 | Daily P0/P1/P2 counts pinned message у `⚙️ Контрол-план`   | —    | M      | —   | Later |
| B.5 | Topic permissions/structure cron-validator                 | —    | S      | —   | Later |
| B.6 | Bot status topic (8-й) — heartbeat для обох ботів          | —    | S      | —   | Later |
| B.7 | WF-XX: Mono fraud signal у `💰 Виторг`                     | —    | L      | —   | Later |
| B.8 | WF-XX: PostHog conversion-drop alert                       | —    | M      | —   | Later |

### 4.3. Cross-bot / infra

| ID  | Ідея                                                                         | Pain | Effort | ADR  | Wave  |
| --- | ---------------------------------------------------------------------------- | ---- | ------ | ---- | ----- |
| C.1 | Multi-instance fail-over / Postgres advisory leader                          | P9   | L      | 0042 | Later |
| C.2 | Sentry breadcrumbs у tool-calls                                              | —    | XS     | —    | W2    |
| C.3 | Bot token rotation policy + drain-period env vars                            | —    | M      | 0043 | Later |
| C.4 | Alert-on-bot-failure heartbeat (WF-104)                                      | P9   | S      | —    | Later |
| C.5 | Console-service rename `sergeant-hubchat → sergeant-openclaw` (per ADR-0032) | P10  | XS     | —    | Later |

---

## 5. Wave-based PR plan

| Wave  | PR  | Item(s)                                                   | Effort | ADR       |
| ----- | --- | --------------------------------------------------------- | ------ | --------- |
| W1    | (a) | §3.3 (`/audit since=` + `--csv`)                          | S      | —         |
| W1    | (b) | §3.4 (WF-15 Bad request fix)                              | S      | —         |
| W2    | (c) | §3.1 (Phase 2.A morning ritual)                           | M      | 0038      |
| W2    | (d) | C.2 (Sentry breadcrumbs у tool-calls)                     | XS     | —         |
| W3    | (e) | §3.2 (alert ack-button + escalation) — foundation shipped | M      | 0040      |
| W3    | (f) | A.1 (Phase 2.B Friday weekly + OKR)                       | M      | 0038      |
| W3    | (g) | B.1 (alert dedup / occurrence-counter)                    | M      | —         |
| W4    | (h) | §3.5 (webhook delivery)                                   | M      | 0041      |
| W4    | (i) | A.6 + A.7 (`/help` + persona quick-row)                   | S      | —         |
| Later | …   | A.2 (Phase 3), A.3, A.4, A.5, A.8, A.10, A.11, A.12, A.13 | varies | 0039+     |
| Later | …   | B.2..B.8                                                  | varies | varies    |
| Later | …   | C.1, C.3, C.4, C.5                                        | varies | 0042/0043 |

**Total для топ-4 хвиль:** ~12 робочих днів, 9 PR-ів, 3 нові ADR-и (0038, 0040, 0041).

---

## 6. Non-goals — що навмисно НЕ робимо

- **OpenClaw в group chats.** DM-only — фіксація per [ADR-0031](../adr/0031-openclaw-v0-telegram-cofounder.md) і [openclaw-roadmap.md §1](./openclaw-roadmap.md). Co-founder режим — приватний.
- **HubChat ↔ OpenClaw інтеграція.** [ADR-0032](../adr/0032-console-consolidated-into-openclaw.md) фіксує: HubChat = end-user surface; OpenClaw = founder DM. Spillover — anti-pattern.
- **Telegram Mini-App для OpenClaw.** DM з tool-loop і approval-кнопками покриває >95% use-cases.
- **Multi-language responses.** Internal docs українською (per AGENTS.md hard-rule #15); LLM-responses адаптивні до prompt-language; не форсимо UI-локалізацію.
- **Public commands для `Sergeant_alert_bot`.** Бот broadcast-only; інтерактивність через callback-keyboards (§3.2, B.3, B.4) — exception, не норма.

---

## 7. References

- [ADR-0030 — Telegram reporting channel structure](../adr/0030-telegram-reporting-channel-structure.md)
- [ADR-0031 — OpenClaw v0 Telegram co-founder](../adr/0031-openclaw-v0-telegram-cofounder.md)
- [ADR-0032 — Console consolidated into OpenClaw](../adr/0032-console-consolidated-into-openclaw.md)
- [ADR-0033 — OpenClaw multi-personas + council](../adr/0033-openclaw-multi-personas-and-council.md)
- [ADR-0036 — OpenClaw write-tools with approval](../adr/0036-openclaw-write-tools-with-approval.md)
- [ADR-0037 — OpenClaw write-audit persistence](../adr/0037-openclaw-write-audit-persistence.md)
- [openclaw-roadmap.md — phase plan](./openclaw-roadmap.md)
- [05-operations-and-automation.md §6.2](./05-operations-and-automation.md#62-телеграм-як-control-room) — Telegram як control-room
- `apps/console/src/openclaw/handler.ts` — DM bot entry-point
- `apps/server/src/modules/openclaw/store.ts` — write-audit persistence
- `ops/n8n-workflows/` — 19 active workflows
