# `@sergeant/openclaw-plugin`

> **Last validated:** 2026-05-12 by Devin (Stage 4a hooks + native approval). **Status:** Stage 4a — 25 read-tools + 5 write-tools + 4 hooks (`llm_input`, `before_agent_start`, `agent_end`, `before_tool_call`) на real `openclaw@2026.5.7` SDK.

Тонкий TypeScript-плагін, що реєструє Sergeant tools у [OpenClaw Gateway](https://openclaw.ai) runtime через HTTP-проксі до `apps/server /api/internal/openclaw/*`.

Source-of-truth для контексту і дорожньої карти: [`docs/planning/openclaw-migration-plan.md` § Reality update 2026-05-12](../../docs/planning/openclaw-migration-plan.md). Цей README — короткий статус самого пакета.

## Поточний стан (Stage 4a)

`src/index.ts` реєструє **30 tools + 4 hooks** через `api.registerTool` / `api.registerHook` SDK поверх real `openclaw@2026.5.7`.

**25 read-tools:** `recall_memory`, `read_strategy_docs`, `record_decision`, `query_app_db`, `get_server_stats`, `get_stripe_metrics`, `get_posthog_stats`, `get_sentry_issues`, `read_github`, `github_search`, `github_tree`, `github_diff`, `github_prs`, `get_github_releases`, `n8n_list`, `n8n_describe`, `n8n_trigger`, `n8n_activate`, `refresh_business_snapshot`, `read_workflow_logs`, `read_telegram_topic`, `seo_gsc_query`, `seo_psi_audit`, `seo_serp_lookup`, `set_reminder`.

**5 write-tools:** `create_github_issue`, `commit_to_strategy_doc`, `post_to_topic`, `pause_workflow`, `mute_alert`. Усі вважаються мутуючими; гейтаються `before_tool_call` hook-ом який повертає `{ requireApproval: {...} }` — host рендерить approval UI, `onResolution` логує рішення в `/write-audit/log`.

**4 hooks:**

- `llm_input` — per-call USD budget gate (`POST /api/internal/openclaw/budget`); fail-closed (network/5xx → block). [`src/hooks/budget.ts`](./src/hooks/budget.ts)
- `before_agent_start` — відкриває invocation row (`POST /invocations/open`); кешує `invocationId ↔ runId` у in-memory `InvocationCorrelator` (Map). [`src/hooks/audit.ts`](./src/hooks/audit.ts)
- `agent_end` — фіналізує invocation (`POST /invocations/finalize`) з rollup cost/duration/iterations/status; soft-fail якщо корелятор порожній (server fallback'ить за runId).
- `before_tool_call` — для write-tools повертає `requireApproval` payload, для read-tools `undefined` (пас-тру). [`src/hooks/write-approval.ts`](./src/hooks/write-approval.ts)

Кожен tool — `api.registerTool({ name, label, description, parameters: Type.Object(...), async execute(invocationId, params) { ... } })`. Параметри валідуються `typebox@1.1.x` (не Zod і не `@sinclair/typebox`). Tools проксяться через HTTP до існуючих server endpoints `/api/internal/openclaw/<endpoint>` з `Authorization: Bearer ${INTERNAL_API_KEY}` (server API не змінюється). Для write-tools додатковий server-side гейт — алловліст + `/write-audit/log` (див. `apps/server/src/routes/internal/openclaw.ts`).

### Чого ще НЕ зареєстровано

- **Layer 0 shortcut router** (17 shortcuts + canned templates) — Stage 4b. Потребує `before_agent_start` payload extension. Legacy reference: `src/legacy/shortcut-router.ts` + `shortcuts/`.
- **Layer 1 cheap-router** (Haiku JSON-classifier) — Stage 4c. System prompt вже на volume (`ops/openclaw/cheap-router.system.md`). Legacy reference: `src/legacy/cheap-router.ts`.
- **Per-persona tool allowlist** — Stage 5a. Зараз плоский `tools.alsoAllow` (усі 10 personas мають усі 30 tools).
- **Strategic-modes wiring + council orchestration + morning-digest cron** — Stage 5b/5c/5d. SKILL-и є у `ops/openclaw/skills/`, копіюються на volume через `docker-entrypoint.sh`; plugin-side orchestration і slash-handlers ще не написані.

## Чому існує `src/legacy/`

PR-B…PR-F v3.1 plan-у (merged 2026-05-10..11) реалізовував повну функціональність (write-tools, hooks, council, strategic modes, parity harness) на **локально вгаданих** `sdk-types.ts`. При першому деплої на Railway виявилося, що `openclaw@2026.5.7` SDK має іншу форму: `definePluginEntry` приймає об'єкт, а не функцію; параметри — `typebox` (не `@sinclair/typebox`); `label` — required; config — `api.config`; entry-файл — TypeScript source.

Stage 1 rewrite ([PR #2438](https://github.com/Skords-01/Sergeant/pull/2438), `14ee42e2`) перенесло увесь pre-rewrite plugin у `src/legacy/` як reference і написало мінімальний MVP (3 tools) на real SDK. Stage 2 ([PR #2449](https://github.com/Skords-01/Sergeant/pull/2449), `257ca2ef`) долив решту 22 read-tools. Stage 3 ([PR #2463](https://github.com/Skords-01/Sergeant/pull/2463), `1b68f159`) додав 5 write-tools як HTTP-проксі. Stage 4a (цей PR) реєструє 4 hook-и через `api.registerHook`: budget gate + invocation lifecycle + native approval — без копіювання legacy approval-variants логіки (вона не потрібна — native SDK підтверджено спайком).

`src/legacy/` лишається у репі тільки як **довідник** при міграції Stage 3+ (write-tools, hooks, routers, council, parity). Не імпортуй з нього у `src/index.ts`. Не запускай тести у `src/legacy/**` як частину CI — вони можуть посилатися на neexistuyuche `sdk-types.ts` форму.

## Як SDK підключений

```ts
// src/index.ts (Stage 4a)
import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
import { Type } from "typebox";

export default definePluginEntry({
  id: "sergeant",
  name: "Sergeant",
  description: "25 read tools + 5 write tools + 4 hooks (Stage 4a)",
  register(api) {
    const config = api.pluginConfig ?? resolveConfigFromEnv();
    // 30× api.registerTool(...)  —  read + write
    api.registerHook("llm_input", budgetGate);
    api.registerHook("before_agent_start", openInvocation);
    api.registerHook("agent_end", finalizeInvocation);
    api.registerHook("before_tool_call", writeApproval);
  },
});
```

`api.config` / `api.pluginConfig` зчитується з `openclaw.json § plugin.config` (через env-substitution у `ops/openclaw/openclaw.example.json` під час `docker-entrypoint.sh`).

## Як запускати локально

`@sergeant/openclaw-plugin` запускається OpenClaw Gateway runtime-ом, не як standalone Node-процес. Для локального теста плагіну:

```bash
pnpm --filter @sergeant/openclaw-plugin test          # vitest unit tests
pnpm --filter @sergeant/openclaw-plugin typecheck     # tsc --noEmit
```

Для повного e2e (Gateway → plugin → server) використовуй `Dockerfile.openclaw-gateway` локально або встановлюй OpenClaw глобально (`npm i -g openclaw`) — див. [`ops/openclaw/README.md`](../../ops/openclaw/README.md).

## Наступні кроки

Послідовність Stages 4b → 8+ описана у [`docs/planning/openclaw-migration-plan.md` § Stage tracker](../../docs/planning/openclaw-migration-plan.md#stage-tracker-2026-05-12--нинішній-source-of-truth). SDK reality-check spike закрився Stage 3 — див. [`docs/notes/spikes/openclaw-sdk-5.7-real-api.md`](../../docs/notes/spikes/openclaw-sdk-5.7-real-api.md).
