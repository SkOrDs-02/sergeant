# `@sergeant/openclaw-plugin`

> **Last validated:** 2026-05-12 by Devin (Stage 3 write-tools). **Status:** Stage 3 — 25 read-tools + 5 write-tools на real `openclaw@2026.5.7` SDK; без hooks (сервер-side allowlist + write-audit єдиний гейт).

Тонкий TypeScript-плагін, що реєструє Sergeant tools у [OpenClaw Gateway](https://openclaw.ai) runtime через HTTP-проксі до `apps/server /api/internal/openclaw/*`.

Source-of-truth для контексту і дорожньої карти: [`docs/planning/openclaw-migration-plan.md` § Reality update 2026-05-12](../../docs/planning/openclaw-migration-plan.md). Цей README — короткий статус самого пакета.

## Поточний стан (Stage 3)

`src/index.ts` реєструє **30 tools** (25 read + 5 write) через `api.registerTool` SDK поверх real `openclaw@2026.5.7`.

**25 read-tools:** `recall_memory`, `read_strategy_docs`, `record_decision`, `query_app_db`, `get_server_stats`, `get_stripe_metrics`, `get_posthog_stats`, `get_sentry_issues`, `read_github`, `github_search`, `github_tree`, `github_diff`, `github_prs`, `get_github_releases`, `n8n_list`, `n8n_describe`, `n8n_trigger`, `n8n_activate`, `refresh_business_snapshot`, `read_workflow_logs`, `read_telegram_topic`, `seo_gsc_query`, `seo_psi_audit`, `seo_serp_lookup`, `set_reminder`.

**5 write-tools:** `create_github_issue`, `commit_to_strategy_doc`, `post_to_topic`, `pause_workflow`, `mute_alert`. Усі вважаються мутуючими; `_stage-status` overlay-skill навчає агента явно запитувати підтвердження від founder-а перед викликом — автоматичний approval gate (`before_tool_call` hook з native `requireApproval` SDK return) — Stage 4a.

Кожен tool — `api.registerTool({ name, label, description, parameters: Type.Object(...), async execute(invocationId, params) { ... } })`. Параметри валідуються `typebox@1.1.x` (не Zod і не `@sinclair/typebox`). Tools проксяться через HTTP до існуючих server endpoints `/api/internal/openclaw/<endpoint>` з `Authorization: Bearer ${INTERNAL_API_KEY}` (server API не змінюється). Для write-tools server-side гейти — алловліст + `/write-audit/log` (див. `apps/server/src/routes/internal/openclaw.ts`).

### Чого ще НЕ зареєстровано

- **4 hooks** — Stage 4 work. `llm_input` per-call budget gate (`/budget`), `agent_end` invocation finalize (`/invocations/finalize`), `before_tool_call` approval+audit, Layer 0 shortcut router (17 shortcuts), Layer 1 cheap router (Haiku JSON-classifier). Real SDK signatures зафіксовані в [`docs/notes/spikes/openclaw-sdk-5.7-real-api.md`](../../docs/notes/spikes/openclaw-sdk-5.7-real-api.md). Legacy implementations — у `src/legacy/{budget,audit,shortcut-router,cheap-router}.ts` (як reference для endpoint-ів; SDK shape хибний).
- **Per-persona tool allowlist** — Stage 5a. Зараз плоский `tools.alsoAllow` (усі 10 personas мають усі 30 tools).
- **Strategic-modes wiring + council orchestration + morning-digest cron** — Stage 5b/5c/5d. SKILL-и є у `ops/openclaw/skills/`, копіюються на volume через `docker-entrypoint.sh`; plugin-side orchestration і slash-handlers ще не написані.

## Чому існує `src/legacy/`

PR-B…PR-F v3.1 plan-у (merged 2026-05-10..11) реалізовував повну функціональність (write-tools, hooks, council, strategic modes, parity harness) на **локально вгаданих** `sdk-types.ts`. При першому деплої на Railway виявилося, що `openclaw@2026.5.7` SDK має іншу форму: `definePluginEntry` приймає об'єкт, а не функцію; параметри — `typebox` (не `@sinclair/typebox`); `label` — required; config — `api.config`; entry-файл — TypeScript source.

Stage 1 rewrite ([PR #2438](https://github.com/Skords-01/Sergeant/pull/2438), `14ee42e2`) перенесло увесь pre-rewrite plugin у `src/legacy/` як reference і написало мінімальний MVP (3 tools) на real SDK. Stage 2 ([PR #2449](https://github.com/Skords-01/Sergeant/pull/2449), `257ca2ef`) долив решту 22 read-tools. Stage 3 (цей PR) додав 5 write-tools як HTTP-проксі — без копіювання legacy approval-variants логіки (вона не потрібна — native SDK підтверджено спайком).

`src/legacy/` лишається у репі тільки як **довідник** при міграції Stage 3+ (write-tools, hooks, routers, council, parity). Не імпортуй з нього у `src/index.ts`. Не запускай тести у `src/legacy/**` як частину CI — вони можуть посилатися на neexistuyuche `sdk-types.ts` форму.

## Як SDK підключений

```ts
// src/index.ts (Stage 3)
import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
import { Type } from "typebox";

export default definePluginEntry({
  id: "sergeant",
  name: "Sergeant",
  description: "25 read tools + 5 write tools, no hooks yet",
  register(api) {
    const config = api.pluginConfig ?? resolveConfigFromEnv();
    // 30× api.registerTool(...)  —  read + write
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

Послідовність Stages 3a → 8+ описана у [`docs/planning/openclaw-migration-plan.md` § Stage tracker](../../docs/planning/openclaw-migration-plan.md#stage-tracker-2026-05-12--нинішній-source-of-truth). Перш ніж писати Stage 3 / Stage 4 — потрібен **SDK reality-check spike** (`api.registerHook`, approval API, scheduler API). Output → `docs/notes/spikes/openclaw-sdk-5.7-real-api.md` або ADR-0056.
