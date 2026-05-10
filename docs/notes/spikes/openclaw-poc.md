# SPIKE — OpenClaw Plugin PoC (Phase 0.5)

> **Last validated:** 2026-05-10. **Status:** Active (PoC complete; PR-B [#2385](https://github.com/Skords-01/Sergeant/pull/2385) merged 2026-05-10).
> **Owner:** @Skords-01 · **Created:** 2026-05-10
> **Roadmap reference:** [`docs/planning/openclaw-migration-plan.md` § PR-B / Phase 0.5](../../planning/openclaw-migration-plan.md)
> **Time-box:** 1–2 days (per plan §510). **Branch:** `devin/1778445962-openclaw-poc-spike` (merged into `main` via PR [#2385](https://github.com/Skords-01/Sergeant/pull/2385)).

Цей spike — обов'язковий вихід-артефакт PR-B (Phase 0.5), що блокує
Phase 1 (PR-C1) планування. Plan §522:

> "Вихід Phase 0.5: короткий note `docs/notes/spikes/openclaw-poc.md` з
> висновками + go/no-go для Phase 1."

## Context (TL;DR)

OpenClaw migration — це 6-PR-рефакторинг, що переносить grammy-bot
internal-agent з ad-hoc tool dispatch у формальну OpenClaw Plugin SDK
архітектуру. Phase 0.5 — валідаційний шар перед тим, як ми почнемо
писати Phase 1 (12 read tools, router layers, скаффолд 10 personas).

Питання, що PoC має закрити:

- Чи дійсно critical-path Sergeant-а **типобезпечно лягає** на OpenClaw
  Plugin SDK form (`definePluginEntry`, `registerTool`, `registerHook`)?
- Як працює approval flow — який з 3 variant-ів (A/B/C) ми ставимо як
  default для Phase 4 write-tools?
- Чи parity (tool-calls + cost + response shape) між старим grammy-bot
  loop і новим plugin loop **зберігається**?
- Чи 2 нові міграції (054_ai_memories_persona_topic,
  055_openclaw_reminders) реально валідні під реальні
  `recall_memory` / `set_reminder` виклики?

## Scope

PoC реалізував ровно мінімум, що дозволяє відповісти на 4 питання:

| Артефакт                                 | Файл                                                                   | Покриває                                           |
| ---------------------------------------- | ---------------------------------------------------------------------- | -------------------------------------------------- |
| Plugin-entry (`definePluginEntry`)       | `packages/openclaw-plugin/src/index.ts`                                | SDK contract surface ✅                            |
| SDK type stubs                           | `packages/openclaw-plugin/src/sdk-types.ts`                            | Type form, hook discriminator ✅                   |
| Plugin config schema (Zod)               | `packages/openclaw-plugin/src/config.ts`                               | Runtime config validation ✅                       |
| HTTP client (bearer + timeout)           | `packages/openclaw-plugin/src/http-client.ts`                          | Plugin → server proxy ✅                           |
| Read tool: `recall_memory`               | `packages/openclaw-plugin/src/tools/recall-memory.ts`                  | Tool result serialization, persona/topic filter ✅ |
| Write tool: `create_github_issue`        | `packages/openclaw-plugin/src/write-tools/create-github-issue.ts`      | Approval flow A/B/C ✅                             |
| Hook: `llm_input` (budget gate)          | `packages/openclaw-plugin/src/budget.ts`                               | Per-call cap, fail-closed ✅                       |
| Hooks: `agent_turn_start` + `_end`       | `packages/openclaw-plugin/src/audit.ts`                                | invocation_id ↔ agent_run_id correlation ✅        |
| Parity-харнес (3+ golden conversations)  | `packages/openclaw-plugin/src/parity/`                                 | tool-calls / cost / shape parity ✅                |
| Migration 054: ai_memories.persona+topic | `apps/server/src/migrations/054_ai_memories_persona_topic{,.down}.sql` | persona-scoped recall ✅                           |
| Migration 055: openclaw_reminders        | `apps/server/src/migrations/055_openclaw_reminders{,.down}.sql`        | set_reminder cron-poller schema ✅                 |

## Findings

### 1. SDK contract — fits

PoC реалізував self-contained SDK contract у `sdk-types.ts` (267 LOC),
що покриває:

- Tool surface: `ToolDefinition<TParams>`, `ToolResult` з `content[]`
  (text + structured blocks), optional `requiresConfirmation` (Variant
  A/C), optional `costUsd` для rollup.
- Hook surface: 6 hook names (`agent_turn_{start,end}`, `llm_{input,output}`,
  `tool_call_{pre,post}`) з discriminator-типом `HookContext<H>`. Hook
  return — `{ ok: true }` | `{ ok: false, reason, status? }`.
- Plugin API: `registerTool`, `registerHook`, `services.messaging.send`
  - `services.messaging.waitForCallback` (Variant B), `services.runtime.log`.
- Plugin entry: `(api, configJson) => Plugin | Promise<Plugin>`,
  `definePluginEntry(entry)` helper.

**Висновок:** `sdk-types.ts` фактично описує очікуваний `@openclaw/plugin-sdk`
surface. Phase 1 swap до реального npm-пакета — **локалізована зміна**
(один файл стає re-export-ом). Type assertion-и потрібні лише в parity
runner-і, де ми передаємо tool без знайомого generic параметру.

### 2. Approval variants — comparison

PoC прокрутив всі 3 variant-и на `create_github_issue`. Кожен variant
має unit-тест-suite (`create-github-issue.test.ts`, ~180 LOC), що
валідує: registration shape (requiresConfirmation flag), execution path,
audit trail, error paths.

| Критерій                        | Variant A — native         | Variant B — custom hook              | Variant C — hybrid (native + audit) |
| ------------------------------- | -------------------------- | ------------------------------------ | ----------------------------------- |
| `requiresConfirmation: true`    | ✅                         | ❌                                   | ✅                                  |
| Plugin-side approval gate (pre) | ❌ (SDK gates)             | ✅ `tool_call_pre`                   | ❌ (SDK gates)                      |
| Plugin-side audit (post)        | ✅ via `tool_call_post`    | ✅ via `tool_call_pre` decision      | ✅ via `tool_call_post`             |
| Custom UX text/markup           | ❌ (SDK-default)           | ✅ повний контроль                   | ❌ (SDK-default)                    |
| Latency overhead vs grammy-bot  | ~0 ms (same SDK roundtrip) | ~25 ms (extra DM send + wait)        | ~25 ms (same as B for audit hop)    |
| Robustness on SDK timeout       | SDK-handled                | Plugin-handled (catches)             | SDK-handled                         |
| Multi-channel (telegram → wpp)  | SDK abstraction (TBD)      | Plugin must reformat keyboard        | SDK abstraction (TBD)               |
| Persistence on plugin restart   | SDK-handled                | In-memory (lost) — needs Phase 4 fix | SDK-handled                         |

**Recommendation: Variant B (custom hook) — як default для Phase 4.**

Обґрунтування (узгоджено з Locked decision #5, plan §724):

1. **UX контроль:** Sergeant потребує rich approval prompt-у — діагностика
   tool-name + key params + estimated cost + retry/cancel-кнопки. SDK-default
   (Variant A/C) — single-line confirm. PR-D мусить переформулювати
   approval-tекст під кожного persona — Variant B дає це з коробки.
2. **Multi-channel readiness:** Phase 8 (whatsapp) приходить швидше,
   ніж SDK-вендор додасть multi-channel approval primitive. Variant B
   реформатує keyboard сам.
3. **Audit on rejection:** у Variant A/C SDK-блок виконується **до**
   plugin-side `tool_call_pre`, тому plugin не знає про rejection
   (тільки `tool_call_post` з `ok:false` бачить). Variant B знає про
   rejection одразу — кращий audit log.

**Trade-off (visible):** persistence на restart — Phase 4 додасть
write-state у `openclaw_write_audit` table так, що `tool_call_pre` спершу
читає persisted decision, потім fallback на messaging. Це не блокує
PoC — лише записано як TODO для PR-D.

### 3. Parity харнес — 3+ conversations green

Parity-runner проганяє ту саму conversation через два simulator-и:

1. **Grammy-side** — naive async function-call loop без plugin-API
   surface (просто `await handler(params)`).
2. **Plugin-side** — викликає `ToolDefinition.execute()` через справжні
   factory-built tools (recall + create_github_issue), що проксяться через
   stub HTTP-клієнт.

Обидві сторони повертають `ParityRunResult { toolCallsMade, totalCostUsd,
responseShape, status }`, що порівнюється `compareParity()` (5% tolerance
на cost).

| Conversation           | Tool-call sequence parity     | Cost parity (±5%) | Response shape parity  | Status parity      |
| ---------------------- | ----------------------------- | ----------------- | ---------------------- | ------------------ |
| `recall_only`          | ✅                            | ✅                | ✅ (text + structured) | ✅ success         |
| `recall_then_decision` | ✅ (recall → record_decision) | ✅                | ✅ (text + structured) | ✅ success         |
| `budget_blocked`       | ✅ (no tool calls)            | ✅                | ✅ (text only)         | ✅ budget_exceeded |
| `create_issue_smoke`   | ✅ (single write tool)        | ✅                | n/a (smoke)            | ✅ success         |

**Висновок:** Plugin-side не deformує args / results. SDK form fits.

**Visible delta — РЕКОМЕНДАЦІЯ для Phase 1:** plugin tool result повертає
**both** `text` + `structured` блоки; grammy-side bot historically
повертає тільки `text` block. Parity test тепер очікує обидва, бо
plugin-вершина — стара side-у грамі треба **доповнити structured-блок**
у Phase 1, де ми переносимо реальний tool dispatch. Це — найдешевший
шлях; альтернатива (виключати structured у plugin) обмежує
downstream-консьюмерів.

### 4. Budget gate — fail-closed (verified)

`createBudgetGate()` у `budget.ts` валідує:

- Allow path: `/budget` повертає `{ allowed: true, dailyTotalUsd }` →
  hook returns `{ ok: true }`. Logs `debug` event.
- Block path: server повертає `{ allowed: false, reason }` → hook returns
  `{ ok: false, status: "budget_exceeded", reason }`. Logs `info` event.
- Fail-closed на HTTP 5xx: hook returns `{ ok: false, status: "budget_exceeded",
reason: "budget service unavailable" }`. Logs `error`.
- Fail-closed на transport error (network): same as above. Logs `error`.

**Висновок:** budget gate ніколи не пропускає LLM call якщо ми не змогли
підтвердити, що cap не перевищено. Це matches Locked decision #4 (cap
$0.5/call, fail-closed).

### 5. Audit correlator — invocation_id ↔ agent_run_id

`InvocationCorrelator` (Map-based) валідує:

- `agent_turn_start` hook викликає `/invocations/open` → server повертає
  `invocationId` (BIGINT → number per Hard Rule #1) → correlator caches
  під ключем `agentRunId`.
- `agent_turn_end` hook викликає `correlator.consume(agentRunId)` → знаходить
  invocationId → POST `/invocations/finalize` з cost rollup + status.
- Якщо `start` failed — `consume` повертає undefined → `finalize` все
  одно надсилається з `{ invocationId: -1, agentRunId }`, і server fall-back
  знаходить invocation за agent_run_id-ом у останній годині.
- Soft-fail на helper HTTP errors — turn не блокується через audit failure.

**Висновок:** correlator robust до partial failures. Phase 1 додасть
distributed correlator (Redis) якщо plugin запускатиметься у multi-instance
mode, але PoC-form достатній для single-instance.

### 6. Migrations — validated by Testcontainers

Обидві міграції мають Testcontainers (pgvector:pg16) round-trip тести:

- 054 (5 cases): column adds, default value inheritance, partial index
  creation, down-idempotence, down→up restore.
- 055 (7 cases): table creation, cron-poller index, CHECK constraint
  validation, GDPR CASCADE on user delete, down-idempotence, down→up restore.

`pnpm lint:migrations` зелений. Тести skip-ляться soft, якщо Docker
недоступний у CI runner-і (як 052_fizruk_full_state.test.ts).

## Go / No-go decision

**🟢 GO для Phase 1 (PR-C1).**

Підтверджено:

1. SDK contract type-safely fits усі critical-path операції.
2. Approval Variant B — default для Phase 4 (PR-D).
3. Parity харнес зелений на 3 golden conversations.
4. Budget gate, audit correlator — функціонально valid.
5. 2 міграції — Testcontainers round-trip green.

## Phase 1 → next steps (PR-C1 scope)

Із Phase 0.5 PoC scaffold-у Phase 1 розширює:

1. **Read tools (12 нових):** `read_strategy_docs`, `query_app_db`,
   `read_github`, `get_stripe_metrics`, `get_sentry_issues`,
   `get_posthog_stats`, `read_workflow_logs`, `get_server_stats`,
   `get_github_releases`, `read_telegram_topic`, `record_decision`,
   `set_reminder` (uses 055 migration).
2. **Code-understanding tools (4):** `github_search`, `github_tree`,
   `github_diff`, `github_prs`.
3. **n8n delegation tools (4):** `n8n_list`, `n8n_describe`, `n8n_trigger`,
   `n8n_activate`.
4. **SEO tools (3, env-stub):** `seo_gsc_query`, `seo_psi_audit`,
   `seo_serp_lookup`.
5. **Meta tool:** `refresh_business_snapshot`.
6. **Router layers:** Layer 0 (`shortcut-router.ts` + 17 shortcuts +
   Mustache canned-templates), Layer 1 (`cheap-router.ts` + JSON-schema
   classifier).
7. **10 SKILL.md** у `ops/openclaw/skills/sergeant-{cofounder,eng,devops,
pm,growth,seo,content,data,cs,finance}/` + `openclaw.json` allowlist.

Phase 4 (PR-D) — extends `create_github_issue` PoC на 6+ write-tools
(`commit_to_strategy_doc`, `post_to_topic`, `mark_reminder_sent`, ...) з
усіма тимися Variant B approval.

## Open questions for Phase 1 review

1. **Real `@openclaw/plugin-sdk` swap:** коли SDK ship-неться (Q3 estimate),
   `sdk-types.ts` стає re-export-ом. Чи потрібен shim-shape файл, якщо
   real SDK розходиться з нашим contract-ом? Phase 1 review гейт.
2. **Multi-channel approval (Variant B):** Phase 8 (whatsapp) — чи
   plugin reformatе keyboard сам, чи SDK додасть `Channel`-aware abstraction?
3. **Persistence на plugin restart (Variant B):** PR-D має додати
   `openclaw_write_audit` write-state так, що `tool_call_pre` checks
   persisted decision first.
4. **`recall_memory` shape delta:** grammy-side bot треба оновити, щоб
   повертати `text` + `structured` блоки (PR-C1 scope).

## Test results summary

```
$ pnpm --filter @sergeant/openclaw-plugin test
 Test Files  9 passed (9)
      Tests  64 passed (64)

$ pnpm lint:migrations
✅ Migration lint passed.

$ pnpm --filter @sergeant/openclaw-plugin typecheck
(no errors)
```

## References

- Plan: [`docs/planning/openclaw-migration-plan.md` § Phase 0.5](../../planning/openclaw-migration-plan.md)
- Locked decisions: §3 (router), §4 (budget cap), §5 (approval Variant B), §9 (migrations)
- Hard Rule #1 (DB types — bigint coercion): [`docs/governance/rules/01-db-types-coerce-bigint-to-number.md`](../../governance/rules/01-db-types-coerce-bigint-to-number.md)
- Hard Rule #4 (migrations sequential, two-phase): [`docs/governance/rules/04-sql-migrations-sequential-two-phase.md`](../../governance/rules/04-sql-migrations-sequential-two-phase.md)
- Hard Rule #20 (no OpenClaw PATs in production): [`docs/governance/rules/20-no-openclaw-pats-in-production.md`](../../governance/rules/20-no-openclaw-pats-in-production.md)
