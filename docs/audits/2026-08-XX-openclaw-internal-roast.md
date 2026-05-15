# OpenClaw Internal Routes Deep Roast — `apps/server/src/routes/internal/openclaw.ts` (stub)

> **Last validated:** 2026-05-15 by Claude Opus 4.7 (external session — pr-plan-backend-perf PR-12 scoping stub). **Next review:** 2026-08-11.
> **Status:** Draft

> **Owner:** TBD (backend-engineer)
> **Trigger window:** Q3 2026 (next backend-roast cycle). Заплановано **2026-08-11** як baseline-date.
> **Tracking:** [`docs/planning/pr-plan-backend-perf-2026-05.md` §PR-12](../planning/pr-plan-backend-perf-2026-05.md).

## TL;DR

`apps/server/src/routes/internal/openclaw.ts` — **1781 рядок**. Hosts усі ритуали + write-tool approval-gate-и для зовнішнього OpenClaw Gateway (ADR-0055). Поверхня бачить production traffic від `@OpenClaw_sergeant_v2_bot` + n8n cron-у; питань три:

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

- **Permission-matrix audit** — пройти всі `r.post(...)`/`r.get(...)` колл-сайти, скласти таблицю `route → guard → audit-write → mutation-target`. Pattern mirror від [`store.ts`](../../apps/server/src/modules/openclaw/store.ts) audit-log helpers.
- **Approval-gate trace** — `rg "approval|approve|deny" apps/server/src/routes/internal/openclaw.ts` + walk через `tools/openclaw/src/agents/openclaw.ts` `before_tool_call` hook chain. Verify ADR-0033 §Approval contract.
- **Rate-limit baseline** — Grafana panel для p95 latency + RPS на `/api/internal/openclaw/*`. Звіряти з expected n8n cron throughput.
- **Smoke checklist** — для кожного write-tool: запустити staging Telegram → перевірити чи a) approval emit-нувся; b) post-approval audit-row записано; c) DB-mutation viewable; d) PostHog event fired.

## Cross-refs

- **Code:** [`apps/server/src/routes/internal/openclaw.ts`](../../apps/server/src/routes/internal/openclaw.ts) (1781 LOC).
- **Policy ADR:** [`docs/adr/0027-openclaw-console-mcp-policy.md`](../adr/0027-openclaw-console-mcp-policy.md) (allowlist + audit + approval).
- **Gateway ADR:** [`docs/adr/0055-openclaw-gateway-migration.md`](../adr/0055-openclaw-gateway-migration.md) (external bot identity + plugin architecture).
- **Strategic modes ADR:** [`docs/adr/0033-openclaw-multi-personas-and-council.md`](../adr/0033-openclaw-multi-personas-and-council.md) (council + approval-gate model).
- **Webhook ADR:** [`docs/adr/0041-openclaw-telegram-webhook.md`](../adr/0041-openclaw-telegram-webhook.md) (token-rotation + idempotency).
- **PR plan:** [`docs/planning/pr-plan-backend-perf-2026-05.md` §PR-12](../planning/pr-plan-backend-perf-2026-05.md).
- **Routing map:** [`docs/observability/alert-bot-routing.md`](../observability/alert-bot-routing.md).
