# Domain invariants

> **Last validated:** 2026-05-13 by @Skords-01. **Next review:** 2026-08-11.
> **Status:** Active

> Things that bite hard if assumed wrong. Compact pointer in [`AGENTS.md § Domain invariants`](../../AGENTS.md#domain-invariants); deep prose lives here. Treat this file as canonical when web ↔ mobile ↔ server logic disagrees.

## Time and dates

- **Single source of truth: Europe/Kyiv.** All "today / yesterday / this week" UI logic computes day boundaries against `Europe/Kyiv` (UTC+2/+3 with DST).
- **Storage:** `timestamptz` in Postgres (UTC at rest), but read with `timezone('Europe/Kyiv', ts)` when bucketing by day in SQL.
- **Day key format:** `YYYY-MM-DD` interpreted in Kyiv local time. This is what `coachKeys.insight(dayKey)`, `digestKeys.byWeek(weekKey)`, and Routine streaks use.
- **Week start:** Monday (ISO 8601). `weekKey` = `YYYY-Www`.
- **Don't** use `new Date().toISOString().slice(0,10)` — it gives a UTC day, which flips a day at 21:00–22:00 Kyiv time and breaks Routine streaks for late-evening users.

## Money (UAH)

- **Database & API: minor units (kopiykas) as `number`** after bigint coercion. Mono webhook delivers minor units; we keep that representation through the stack.
- **UI display:** divide by 100 at render time only. For Finyk transactions and balances use `fmtAmt(minor, currencyCode?)` from `@sergeant/finyk-domain/lib/formatting` — it handles `+`/`-` sign and currency symbol consistently. For other contexts (insights, dashboards) write a thin local helper that wraps `(minor / 100).toLocaleString("uk-UA", { minimumFractionDigits: 2 })` rather than re-inlining the math at every call site.
- **Negative = expense, positive = income.** Match Mono's convention; transfers between own accounts come as a pair (-X on source, +X on destination) and are netted in budget calculations, not summed.

## Identity

- User IDs are Better Auth opaque strings (e.g. `I3BUW5atld8oOHM7lpFEJBIInpW1hzv7`). Do not assume UUID format. Cookies are HTTP-only; auth in tests goes via Better Auth test session helpers.
- Canonical auth surface for the server: `apps/server/src/auth.ts` (Better Auth wiring) + `apps/server/src/http/requireSession.ts` (`requireSession()` / `requireSessionSoft()` middleware). Never re-read the cookie manually — go through these.

## AI tool execution path

The HubChat assistant uses Anthropic tool-calling. Tools are **defined on the server**, **executed on the client** — server is a thin pass-through:

```
┌─────────────────┐    POST /api/chat        ┌────────────────────────┐
│ HubChat (web)   │ ──────────────────────▶  │ apps/server            │
│ apps/web/src/   │                          │ src/modules/chat/      │
│ core/HubChat.   │                          │  - chat.ts (handler)   │
│ tsx             │                          │  - tools.ts (TOOLS)    │
└─────────────────┘                          │  - toolDefs/*.ts       │
        ▲                                    └───────────┬────────────┘
        │ stream: text + tool_use blocks                 │
        │                                                ▼
        │                                    ┌────────────────────────┐
        │                                    │ Anthropic Messages API │
        │                                    │ (streaming, with tools)│
        │                                    └───────────┬────────────┘
        │                                                │
        │ ◀──────────────────────────────────────────────┘
        │
        ▼ tool_use{name,input}
┌──────────────────────────────────────┐
│ Client executor                      │
│ apps/web/src/core/lib/               │
│  hubChatActions.ts                   │
│   ├─ create_transaction → localStorage / api-client
│   ├─ log_meal → localStorage / api-client
│   ├─ start_workout → MMKV-web
│   ├─ mark_habit_done → localStorage
│   └─ … (one handler per tool)
└──────────────────────────────────────┘
        │ result text
        ▼ tool_result block sent back to model
┌──────────────────────────────────────┐
│ ChatMessage renders markdown + cards │
│ via hubChatActionCards.ts mapper     │
└──────────────────────────────────────┘
```

**Implications when changing tools:**

- A new tool needs three coordinated edits: `apps/server/src/modules/chat/toolDefs/<domain>.ts` (definition), `apps/web/src/core/lib/hubChatActions.ts` (executor), and (if user-visible) `hubChatActionCards.ts` + optionally `hubChatQuickActions.ts`.
- The server **does not** run tool side effects — never put DB writes in `chat.ts`. They go through the regular `apps/server/src/modules/<domain>/*` HTTP endpoints, called by the client executor.
- "Risky" tools (delete/forget/import) live in `RISKY_TOOLS` in `hubChatActionCards.ts` and get a "Критична дія" badge in the UI.

### `max_tokens` budget per request

`apps/server/src/modules/chat/chat.ts` uses two distinct `max_tokens` values, intentionally:

| Request                      | `max_tokens` | Where (chat.ts)                 | Why                                                                                                                                              |
| ---------------------------- | ------------ | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| First user-message chat call | **1500**     | line ~243, payload to Anthropic | Enough for a tool call + short reply, OR a structured direct-text answer with markdown formatting (3–6 sentences українською).                   |
| Tool-result continuation     | **2500**     | line ~181, follow-up payload    | Фінальна відповідь юзеру після tool_result — брифінги, підсумки, аналіз бюджету. Markdown-таблиці + кілька секцій легко займають 1.5–2k токенів. |

Do **not** lower these without testing the worst-case `/help` response and the largest tool-result blob (briefing + weekly summary go through the continuation path).
When Anthropic returns `stop_reason: "max_tokens"`, the model may truncate **mid-JSON-tool-call** — the client `executeAction` then throws a parse error and the user sees "Невідома дія". On the continuation path it instead truncates the user-facing markdown mid-sentence (this is what motivated the bump from 400→2500 / 600→1500 in PR #804). If you need a longer system prompt or more tools, raise `max_tokens` first; do not silently squeeze the budget.

**Auto-continuation ([PR #813](https://github.com/Skords-01/Sergeant/pull/813)): сервер сам дотягує обірвані текстові відповіді.** Якщо upstream віддав `stop_reason: "max_tokens"` і в `content` лише `text`-блоки (без `tool_use`), `callAnthropicWithContinuation` (non-stream) і `streamAnthropicToSse` (SSE) додають partial-text як останнє `assistant`-повідомлення і б'ють ще один upstream-виклик — Anthropic продовжить рівно з обриву. Cap — `MAX_TEXT_CONTINUATIONS = 3` (env `CHAT_MAX_TEXT_CONTINUATIONS`), бо runaway-генерація на N×max_tokens — це баг у промпті, а не легітимний кейс. **Не вимикай continuation як «оптимізацію»**: воно безпечне (паритет з ручним «продовж»), і саме воно ховає коротко-cap-нуті відповіді, поки `max_tokens` встановлений правильно. Якщо `tool_use` присутній у відповіді — continuation НЕ відбувається (бо далі має йти `tool_result` від клієнта, не assistant-text).

### `SYSTEM_PREFIX` is a prompt-cache candidate

`SYSTEM_PREFIX` (in `apps/server/src/modules/chat/toolDefs/systemPrompt.ts`) is the same on every request — only the appended `context` block varies. That makes it the natural target for Anthropic prompt caching (`cache_control: { type: "ephemeral" }` on the `system` array). Two consequences:

1. **Don't churn `SYSTEM_PREFIX`.** Each edit invalidates the cache for every active user, so a casual wording tweak can briefly multiply Anthropic spend. Batch prompt changes; bump a `SYSTEM_PROMPT_VERSION` constant when wiring caching so cache misses are observable.
2. **`context` (the dynamic data block) must stay outside the cached segment.** When caching is wired, the cached prefix is `SYSTEM_PREFIX` only; the per-user `context` is appended as a separate, non-cached `text` block.

Anthropic cache breakpoints have a model-specific minimum length and silently no-op below it: the request succeeds, but both `cache_creation_input_tokens` and `cache_read_input_tokens` stay `0`. In the PR #790 smoke, `SYSTEM_PREFIX` alone was ~987 tokens — below the Sonnet 1024-token floor observed there — so the viable Sergeant rollout also marks the last stable tool definition with `cache_control`. That tools breakpoint is the real cost win today; the `SYSTEM_PREFIX` marker stays forward-looking for when the prompt grows past the minimum.

See the `enable-prompt-caching` playbook for the actual rollout steps.

## Anti-patterns from past bugs

Real regressions we've shipped — do not repeat:

1. **bigint → string leaks ([#708](https://github.com/Skords-01/Sergeant/issues/708)).** Mono account balances suddenly went stringly-typed in the API; arithmetic in the dashboard silently produced `"123" + "456" = "123456"`. Fix: explicit `Number(r.id)` in serializers, snapshot tests on response shapes. ([Rule #1](../governance/rules/01-db-types-coerce-bigint-to-number.md).)
2. **`vitest.base.ts` ESM crash ([#720](https://github.com/Skords-01/Sergeant/pull/720)).** A `.ts` file behind `package exports` failed to load under Node's native ESM loader, and **every** package's `pnpm test` died. Lesson: shared config files exposed via `package.json` `exports` must be `.js` (with JSDoc types) or be transpiled, not raw `.ts`.
3. **Hardcoded RQ keys.** Several places had `["finyk", "transactions"]` inline; bulk-invalidate after a mutation missed half of them. Centralized factories make this impossible. ([Rule #2](../governance/rules/02-rq-keys-via-centralized-factories.md).)
4. **One-shot DB migration that dropped a column.** Pre-deploy ran the migration before the new image started serving, so the still-warm old version crashed on the missing column. Two-phase migration policy ([Rule #4](../governance/rules/04-sql-migrations-sequential-two-phase.md)) prevents this.
5. **Skipped `// AI-DANGER` zone.** A subtle timing-safe comparison was rewritten as `===` during a "cleanup" PR. Catch them with `// AI-DANGER:` markers and lint warnings on malformed prefixes.
6. **Direct `localStorage.setItem` in chat tool handlers.** A handler that writes to localStorage via `localStorage.setItem` (instead of the project's `lsSet` helper) bypasses quota fallbacks **and** the cloud-sync queue used by `cloudsync`. Under a concurrent request (e.g. user fires two tool calls fast, or background sync runs) the local write and the cloud-sync write race — the user sees the change in the UI but the next device boot pulls a stale value from cloud. Always go through `ls` / `lsSet` (or `safeReadLS` / `safeWriteLS` / `createModuleStorage`); the same wrappers are also enforced by the `sergeant-design/no-raw-local-storage` ESLint rule.
