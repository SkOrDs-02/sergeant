# OpenClaw Internal Routes Deep Roast — `apps/server/src/routes/internal/openclaw.ts`

> **Last touched:** 2026-07-18 by @dimastahov16012003. **Next review:** 2026-10-16.
> **Status:** Reference — заготовка майбутнього аудиту без дати й owner commitment.

> **Owner:** @Skords-01 (backend)
> **Trigger date:** **2026-08-11** (locked — next backend-roast cycle baseline).
> **Tracking:** [`docs/90-work/planning/pr-plan-backend-perf-2026-05.md` §PR-12](../planning/archive/pr-plan-backend-perf-2026-05.md).

## TL;DR

`apps/server/src/routes/internal/openclaw.ts` — **1819 рядків**, **57 `r.post` маршрутів** (LOC-стаб 2026-05 казав «1781» — drift, file виріс після /reminders + /seo + /whois). Hosts усі read-tools, ритуали + write-tool approval-gate-и для зовнішнього OpenClaw Gateway (ADR-0055). Поверхня бачить production traffic від `@OpenClaw_sergeant_v2_bot` + n8n cron-у; питань три:

- **Security boundary** — bearer-token guard (`INTERNAL_API_KEY`) це admin-only чи service-account-only? Чи може скомпрометований key призвести до write-mutation без додаткового approval-flow?
- **Audit-log coverage** — кожен write-tool (`commit_to_strategy_doc`, `acknowledge_alert`, `mute_alert`, etc.) логує actor + target + result? Чи є шляхи де DB-mutation відбувається без `openclaw_invocations` row?
- **Write-tool approval gate** — який саме path вимагає Stage 3b approval (per ADR-0033) і який вже працює silently? Drift-checked чи treba scope перевірити після Stage 5 migration?

ADR-0027 (OpenClaw, Console та MCP) визначає policy: write-scopes окремі, вузькі, вимкнені до явного opt-in. Аудит має звірити implementation з policy.

Цей stub фіксує scope, не recommendations.

## Scope

**In scope:**

1. **Security boundary** — `INTERNAL_API_KEY` guard chain. Чи rotating-policy задокументована? Чи `routes/internal/index.ts` middleware покриває всі sub-routes без витоків? Чи admin-only console UI має додатковий tier (Telegram user-id allowlist per ADR-0027)?
2. **Audit-log coverage matrix** — table: handler → audit-write (так/ні) → actor/target/result fields → DB persistence. Шляхи без audit-row — security gap.
3. **Write-tool approval gate inventory** — список усіх write-tool-ів: який вимагає approval (UI flow), який emit-ить approval-request у Telegram, який автоматичний (read-only). Drift vs ADR-0027 §Мутуючі інструменти.
4. **Rate limiting + token TTL** — чи має `/api/internal/openclaw/*` distinct rate-limit-policy від `/api/internal/alerts/*`? Тегджаний кеш / idempotency?
5. **LOC chunkability** — handler-density (>300 LOC each candidate for split). Чи можна decompose за scope-family (`ritual/*`, `tool/*`, `alert-ack/*`)?

**Out of scope:**

- Зміна Gateway-side handler-у (`tools/openclaw/` — окрема скоп).
- Реструктуризація `openclaw_invocations` schema (DB-migration).
- Telegram payload format changes (frozen contracts per ADR-0041 + ADR-0055).

## Methodology hints

- **Permission-matrix audit** — пройти всі `r.post(...)`/`r.get(...)` колл-сайти, скласти таблицю `route → guard → audit-write → mutation-target`. Pattern mirror від [`store.ts`](../../../apps/server/src/modules/openclaw/store.ts) audit-log helpers.
- **Approval-gate trace** — `rg "approval|approve|deny" apps/server/src/routes/internal/openclaw.ts` + walk через `tools/openclaw/src/agents/openclaw.ts` `before_tool_call` hook chain. Verify ADR-0033 §Approval contract.
- **Rate-limit baseline** — Grafana panel для p95 latency + RPS на `/api/internal/openclaw/*`. Звіряти з expected n8n cron throughput.
- **Smoke checklist** — для кожного write-tool: запустити staging Telegram → перевірити чи a) approval emit-нувся; b) post-approval audit-row записано; c) DB-mutation viewable; d) PostHog event fired.

## Permission matrix — `route → guard → audit-write → mutation-target`

Згенеровано прямим читанням `createOpenClawInternalRouter()` (`apps/server/src/routes/internal/openclaw.ts`, рядки 684–1819) станом на 2026-06-06. Всі 57 маршрутів — **`POST`** (немає жодного `r.get`).

**Спільний guard (один для всіх):** `routes/internal/index.ts` монтує `/api/internal/*` за двома middleware у порядку: (1) constant-time bearer-token `Authorization: Bearer <INTERNAL_API_KEY>` (`safeStringEqual`, fail-closed `503` якщо key не сконфігурований, `401` на mismatch); (2) `verifyWebhookSignature()` — HMAC-SHA256 (no-op коли `WEBHOOK_HMAC_SECRET` порожній; grace-mode за замовчуванням, див. [`api-internal-hmac.md`](../../04-governance/security/api-internal-hmac.md)). **Per-route ACL немає** — будь-який holder bearer-токена дістає всю поверхню. Telegram user-id allowlist (ADR-0027/0031) живе на Gateway-side (`tools/openclaw` / `packages/openclaw-plugin`), не на цьому HTTP-шарі.

**Колонки:** `Audit-write` = чи цей handler сам пише в БД audit/log-таблицю (`openclaw_invocations` через open/finalize, `openclaw_write_audit` через write-audit/log, `ai_memory_forget_audit` через forget-helpers, `tg_topic_archive` через post-to-topic). Більшість read-tools НЕ пишуть audit-row безпосередньо — lifecycle логуэться окремими `invocations/open`+`finalize` викликами з Gateway. `Mutation` = чи handler має side-effect поза app-DB (зовнішній GitHub/Telegram/n8n/Sentry write) чи мутує app-DB.

### Read / memory family

| Route                           | Handler                                                    | Audit-write                          | Mutation-target                                                   |
| ------------------------------- | ---------------------------------------------------------- | ------------------------------------ | ----------------------------------------------------------------- |
| `POST /openclaw/recall`         | `recallCofounderMemory`                                    | ні                                   | read-only (pgvector)                                              |
| `POST /openclaw/forget`         | `forgetById`/`forgetByTopic`/`forgetSince`/`previewForget` | так (forget-audit; rate-limited 3/h) | app-DB soft-delete `ai_memories` (крім `previewQuery`)            |
| `POST /openclaw/forget/confirm` | `confirmForget`                                            | так (forget-audit)                   | app-DB soft-delete `ai_memories`                                  |
| `POST /openclaw/forget/cancel`  | `cancelForget`                                             | ні                                   | read-only (in-memory token drop)                                  |
| `POST /openclaw/strategy`       | `readStrategyDoc`                                          | ні                                   | read-only (repo file, allowlist-guarded)                          |
| `POST /openclaw/query`          | `queryAppDb`                                               | ні                                   | read-only (SQL allowlist + schema guard)                          |
| `POST /openclaw/github`         | `readGithub`                                               | ні                                   | read-only (GitHub API)                                            |
| `POST /openclaw/workflow`       | `readWorkflowLogs`                                         | ні                                   | read-only (n8n logs)                                              |
| `POST /openclaw/telegram`       | `readTelegramTopicHistory`                                 | ні                                   | read-only (`tg_topic_archive`)                                    |
| `POST /openclaw/decision`       | `recordDecision`                                           | так (запис decision-row)             | app-DB insert `openclaw_decisions`                                |
| `POST /openclaw/decisions/list` | `listRecentDecisions`                                      | ні                                   | read-only                                                         |
| `POST /openclaw/classify`       | `classifyMessage` (Haiku)                                  | ні                                   | read-only (Anthropic call; `503` без key, `502` на upstream fail) |
| `POST /openclaw/budget`         | `checkDailyBudget`                                         | ні                                   | read-only (budget envelope)                                       |

### Observability / metrics / ritual family

| Route                                 | Handler                                       | Audit-write             | Mutation-target                             |
| ------------------------------------- | --------------------------------------------- | ----------------------- | ------------------------------------------- |
| `POST /openclaw/ai-cost-summary`      | `buildAiCostSummary`                          | ні                      | read-only (`ai_usage_daily` + prom-counter) |
| `POST /openclaw/perf-snapshot`        | `buildPerfSnapshot`                           | ні                      | read-only (prom register)                   |
| `POST /openclaw/invocations/open`     | `openInvocation`                              | **так (lifecycle row)** | app-DB insert `openclaw_invocations`        |
| `POST /openclaw/invocations/finalize` | `finalizeInvocation`                          | **так (lifecycle row)** | app-DB update `openclaw_invocations`        |
| `POST /openclaw/invocations/list`     | `listRecentInvocations`                       | ні                      | read-only                                   |
| `POST /openclaw/metrics/stripe`       | `getStripeMetrics`                            | ні                      | read-only (Stripe API)                      |
| `POST /openclaw/metrics/sentry`       | `getSentryIssues`                             | ні                      | read-only (Sentry API)                      |
| `POST /openclaw/metrics/server`       | `getServerStats`                              | ні                      | read-only                                   |
| `POST /openclaw/metrics/posthog`      | `getPostHogStats`                             | ні                      | read-only (PostHog API)                     |
| `POST /openclaw/github/releases`      | `getGithubReleases`                           | ні                      | read-only (GitHub API)                      |
| `POST /openclaw/briefing/morning`     | `assembleMorningBriefing` (+`isFounderMuted`) | ні                      | read-only (fail-soft assembler)             |
| `POST /openclaw/ritual/weekly`        | `assembleWeeklyReview`                        | ні                      | read-only (fail-soft assembler)             |
| `POST /openclaw/ritual/monthly`       | `assembleMonthlyOkrReview`                    | ні                      | read-only (fail-soft assembler)             |

### Write-tool family (ADR-0036 — approval-gated на Gateway-side ПЕРЕД викликом)

| Route                                 | Handler                                                            | Audit-write                                                   | Mutation-target                         |
| ------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------- | --------------------------------------- |
| `POST /openclaw/write/strategy-doc`   | `commitToStrategyDoc` (repo allowlist `assertOpenClawRepoAllowed`) | ні (audit через окремий write-audit/log)                      | **зовн. GitHub commit**                 |
| `POST /openclaw/write/github-issue`   | `createGithubIssue` (repo allowlist)                               | ні (окремий write-audit)                                      | **зовн. GitHub issue**                  |
| `POST /openclaw/write/post-to-topic`  | `postToTopic` (topic allowlist `POST_TO_TOPIC_ALLOWLIST`)          | **так — mirror у `tg_topic_archive` при `status==='posted'`** | **зовн. Telegram post** + app-DB insert |
| `POST /openclaw/write/pause-workflow` | `pauseWorkflow`                                                    | ні (окремий write-audit)                                      | **зовн. n8n pause**                     |
| `POST /openclaw/write/mute-alert`     | `muteSentryAlert`                                                  | ні (окремий write-audit)                                      | **зовн. Sentry mute**                   |

### Write-audit family (ADR-0037 — append-only lifecycle log)

| Route                             | Handler                 | Audit-write                    | Mutation-target                      |
| --------------------------------- | ----------------------- | ------------------------------ | ------------------------------------ |
| `POST /openclaw/write-audit/log`  | `recordWriteAudit`      | **так (це і є audit-таблиця)** | app-DB insert `openclaw_write_audit` |
| `POST /openclaw/write-audit/list` | `listRecentWriteAudits` | ні                             | read-only                            |

### n8n delegation family (PR-C1c — tier-gated)

| Route                             | Handler                                                                                | Audit-write | Mutation-target                   |
| --------------------------------- | -------------------------------------------------------------------------------------- | ----------- | --------------------------------- |
| `POST /openclaw/n8n/list`         | `listN8nWorkflows`                                                                     | ні          | read-only                         |
| `POST /openclaw/n8n/describe`     | `describeN8nWorkflow`                                                                  | ні          | read-only                         |
| `POST /openclaw/n8n/trigger`      | `triggerN8nWorkflow` (Tier A auto / Tier C gated; B/D + unknown → `N8nAllowlistError`) | ні          | **зовн. n8n trigger**             |
| `POST /openclaw/n8n/activate`     | `activateN8nWorkflow` (Tier A/C only)                                                  | ні          | **зовн. n8n activate/deactivate** |
| `POST /openclaw/snapshot/refresh` | `refreshBusinessSnapshot` (fan-out усіх Tier A)                                        | ні          | **зовн. n8n fan-out trigger**     |

### Mute family (PR /mute Phase 5b — founder DND)

| Route                        | Handler            | Audit-write | Mutation-target                    |
| ---------------------------- | ------------------ | ----------- | ---------------------------------- |
| `POST /openclaw/mute/set`    | `setFounderMute`   | ні          | app-DB upsert mute-state           |
| `POST /openclaw/mute/clear`  | `clearFounderMute` | ні          | app-DB clear mute-state            |
| `POST /openclaw/mute/status` | `getFounderMute`   | ні          | read-only                          |
| `POST /openclaw/mute/check`  | `isFounderMuted`   | ні          | read-only (outbound-channel guard) |

### Whois / code-understanding / SEO families (read-only)

| Route                           | Handler                                       | Audit-write | Mutation-target           |
| ------------------------------- | --------------------------------------------- | ----------- | ------------------------- |
| `POST /openclaw/whois`          | `lookupWhois` (+ optional Telegram `getChat`) | ні          | read-only aggregator      |
| `POST /openclaw/github/search`  | `githubSearch`                                | ні          | read-only (GitHub API)    |
| `POST /openclaw/github/tree`    | `githubTree`                                  | ні          | read-only (GitHub API)    |
| `POST /openclaw/github/diff`    | `githubDiff`                                  | ні          | read-only (GitHub API)    |
| `POST /openclaw/github/prs`     | `githubPrs`                                   | ні          | read-only (GitHub API)    |
| `POST /openclaw/seo/gsc`        | `seoGscQuery`                                 | ні          | read-only (env-stub GSC)  |
| `POST /openclaw/seo/lighthouse` | `seoPsiAudit`                                 | ні          | read-only (env-stub PSI)  |
| `POST /openclaw/seo/serp`       | `seoSerpLookup`                               | ні          | read-only (env-stub SERP) |

### Reminder family (PR-C1b — FSM store)

| Route                                  | Handler                                              | Audit-write | Mutation-target                           |
| -------------------------------------- | ---------------------------------------------------- | ----------- | ----------------------------------------- |
| `POST /openclaw/reminders/set`         | `setReminder`                                        | ні          | app-DB insert reminder                    |
| `POST /openclaw/reminders/list-due`    | `listDueReminders`                                   | ні          | read-only (cron-poller)                   |
| `POST /openclaw/reminders/mark-sent`   | `markReminderSent`                                   | ні          | app-DB FSM transition `pending→sent`      |
| `POST /openclaw/reminders/mark-failed` | `markReminderFailed`                                 | ні          | app-DB FSM transition `pending→failed`    |
| `POST /openclaw/reminders/cancel`      | `markReminderCancelled` (founder-scoped owner check) | ні          | app-DB FSM transition `pending→cancelled` |
| `POST /openclaw/reminders/list`        | `listFounderReminders`                               | ні          | read-only                                 |

### Перше прочитання матриці (raw signal, не recommendations)

- **Найбільший security-finding-кандидат:** 5 зовнішньо-мутуючих write-tools (`write/*`) + 3 зовнішньо-мутуючих n8n-tools (`n8n/trigger`, `n8n/activate`, `snapshot/refresh`) сидять за **тим самим** bearer-токеном, що й суто read-tools. Approval-gate (ADR-0036) живе на Gateway-side ПЕРЕД HTTP-викликом — на цьому шарі немає re-verification, тож скомпрометований `INTERNAL_API_KEY` дає прямий доступ до зовнішніх write-ів в обхід approval-flow. Захист тут — repo/topic/tier allowlists (`assertOpenClawRepoAllowed`, `POST_TO_TOPIC_ALLOWLIST`, `N8nAllowlistError`), а не actor-auth.
- **Audit-write розрив:** write-tools `strategy-doc` / `github-issue` / `pause-workflow` / `mute-alert` самі НЕ пишуть audit-row — покладаються на окремий `write-audit/log` виклик з Gateway. Якщо Gateway-side не викличе `recordWriteAudit`, зовнішня мутація стається **без** persisted-audit. `post-to-topic` — єдиний write-tool, що мирорить себе в БД інлайн. Це звіряти проти ADR-0037 §lifecycle.
- **Rate-limiting:** лише `forget` має explicit rate-limit (3 deletes/h/founder). Решта write/n8n маршрутів — без per-route throttle на цьому шарі.

## Cross-refs

- **Code:** [`apps/server/src/routes/internal/openclaw.ts`](../../../apps/server/src/routes/internal/openclaw.ts) (1819 LOC, 57 POST-маршрутів).
- **Guard:** [`apps/server/src/routes/internal/index.ts`](../../../apps/server/src/routes/internal/index.ts) (shared bearer + HMAC).
- **Policy ADR:** [`docs/04-governance/adr/0027-openclaw-console-mcp-policy.md`](../../04-governance/adr/0027-openclaw-console-mcp-policy.md) (allowlist + audit + approval).
- **Gateway ADR:** [`docs/04-governance/adr/0055-openclaw-external-gateway.md`](../../04-governance/adr/0055-openclaw-external-gateway.md) (external bot identity + plugin architecture).
- **Strategic modes ADR:** [`docs/04-governance/adr/0033-openclaw-multi-personas-and-council.md`](../../04-governance/adr/0033-openclaw-multi-personas-and-council.md) (council + approval-gate model).
- **Webhook ADR:** [`docs/04-governance/adr/0041-openclaw-telegram-webhook.md`](../../04-governance/adr/0041-openclaw-telegram-webhook.md) (token-rotation + idempotency).
- **PR plan:** [`docs/90-work/planning/pr-plan-backend-perf-2026-05.md` §PR-12](../planning/archive/pr-plan-backend-perf-2026-05.md).
- **Routing map:** [`docs/03-operations/observability/alert-bot-routing.md`](../../03-operations/observability/alert-bot-routing.md).
