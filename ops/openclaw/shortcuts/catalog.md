# Layer 0 Shortcuts Catalog

> **Last validated:** 2026-05-13 by Devin. **Next review:** 2026-08-11.
> **Status:** Scaffolded (PR-A v3).

17 детермінованих shortcut-ів. Кожен — окремий файл `packages/openclaw-plugin/src/shortcuts/<slug>.ts`. Жодного LLM-call на Layer 0. Зміна — `~30 хв` (новий файл + регулярка + canned template + тест).

Кожен запис: pattern → server endpoints → canned-template → cost (Layer 0 = $0 LLM).

---

## Metrics & status (6)

### `/metrics`

- **Pattern:** `^\/metrics\b` АБО фраза «як справи з метриками», «дай метрики», «what's the status of metrics»
- **Calls:** `refresh_business_snapshot` (Tier A: 63 + 60 паралельно) → `get_posthog_stats` → `get_stripe_metrics` → `get_sentry_issues({ limit: 5 })`
- **Template:** `canned-templates/metrics.md`
- **Сектори в outpput:** revenue today / signups today / MAU / Sentry top 5 / funnel conversion
- **Cost:** $0 LLM. ~8 секунд latency (n8n triggers + reads).
- **Розширення:** Canvas-чарт якщо variance > 20% від 7-day baseline.

### `/runway`

- **Pattern:** `^\/runway\b` АБО «скільки нам залишилось часу», «який рунвей»
- **Calls:** `query_app_db` (finance views: monthly burn, cash) → `get_stripe_metrics`
- **Template:** `canned-templates/runway.md`
- **Output:** «Cash: $X. Burn: $Y/мiс. Runway: Z місяців.»
- **Cost:** $0 LLM.

### `/status`

- **Pattern:** `^\/status\b` АБО «як справи в продукті», «чи все ок»
- **Calls:** `get_server_stats` → `get_github_releases({ limit: 1 })` → `get_sentry_issues({ limit: 0, hourBudget: 1 })`
- **Template:** `canned-templates/status.md`
- **Output:** 3 рядки: server p95 + latest deploy + Sentry rate.
- **Cost:** $0 LLM.

### `/sentry`

- **Pattern:** `^\/sentry\b`
- **Calls:** `get_sentry_issues({ limit: 5, severityGte: 'warning', hourBudget: 24 })`
- **Template:** `canned-templates/sentry.md`
- **Cost:** $0 LLM.

### `/stripe`

- **Pattern:** `^\/stripe\b`
- **Calls:** `get_stripe_metrics({ days: 1, includeFailures: true, includeRefunds: true })`
- **Template:** `canned-templates/stripe.md`
- **Cost:** $0 LLM.

### `/posthog`

- **Pattern:** `^\/posthog\b`
- **Calls:** `get_posthog_stats({ window: 'today', includeMAU: true, keyEvents: ['signup', 'first_value', 'churn'] })`
- **Template:** `canned-templates/posthog.md`
- **Cost:** $0 LLM.

---

## Code & repo (3)

### `/prs`

- **Pattern:** `^\/prs\b` АБО «що по PRs», «open PRs»
- **Calls:** `list_open_prs({ minAgeHours: 0, includeReviewerLoad: true })`
- **Template:** `canned-templates/prs.md`
- **Output:** Список PRs з age + reviewer + CI status.
- **Cost:** $0 LLM.

### `/releases`

- **Pattern:** `^\/releases\b`
- **Calls:** `get_github_releases({ limit: 5 })`
- **Template:** `canned-templates/releases.md`
- **Cost:** $0 LLM.

### `/builds`

- **Pattern:** `^\/builds\b` АБО «remix deploys», «railway deploys»
- **Calls:** `query_app_db` (на основі Railway webhook events у `n8n_executions` table, Tier D #15)
- **Template:** `canned-templates/builds.md`
- **Cost:** $0 LLM.

---

## Operations (3)

### `/workflows`

- **Pattern:** `^\/workflows\b`
- **Calls:** `list_n8n_workflows()` → results enriched з `n8n-allowlist.json` tier mapping
- **Template:** `canned-templates/workflows.md`
- **Output:** 19 workflows + tier + last execution status.
- **Cost:** $0 LLM.

### `/refresh_metrics`

- **Pattern:** `^\/refresh_metrics\b` АБО `/refresh\b`
- **Calls:** `refresh_business_snapshot()` (meta-tool: fire Tier A `63 + 60 + 99` паралельно, чекає 8 sec timeout, then reads DB snapshots)
- **Template:** `canned-templates/refresh-result.md`
- **Output:** «Refreshed: growth, funnel, heartbeat. Last refreshed N seconds ago.»
- **Cost:** $0 LLM.

### `/heartbeat` / `/health`

- **Pattern:** `^\/(heartbeat|health)\b`
- **Calls:** `get_server_stats({ healthCheck: true })` → ping `apps/server`, OpenClaw Gateway `/healthz`, n8n `/healthz`
- **Template:** `canned-templates/heartbeat.md`
- **Cost:** $0 LLM.

---

## Memory & decisions (4)

### `/recall <query>`

- **Pattern:** `^\/recall\s+(.+)` (capture query)
- **Calls:** `recall_memory({ query: $1, topK: 5 })`
- **Template:** `canned-templates/recall.md`
- **Cost:** $0 LLM.

### `/decisions`

- **Pattern:** `^\/decisions\b`
- **Calls:** `decisions/list({ limit: 10, days: 30 })`
- **Template:** `canned-templates/decisions.md`
- **Cost:** $0 LLM.

### `/digest day|week`

- **Pattern:** `^\/digest\s+(day|week)`
- **Calls:** агрегує usual heartbeat sections з window=24h або 168h
- **Template:** `canned-templates/digest.md`
- **Cost:** $0 LLM.

### `/remind <when> <what>`

- **Pattern:** `^\/remind\s+([\w\d\:\-\+T]+)\s+(.+)`
- **Calls:** `set_reminder({ dueAt: $1, message: $2, channel: 'telegram' })` (parse iso/relative date з `date-fns` локально)
- **Template:** `canned-templates/reminder-set.md`
- **Cost:** $0 LLM.

---

## Force-think (1)

### `/think <питання>`

- **Pattern:** `^\/think\s+(.+)`
- **Calls:** N/A на Layer 0 — bypass shortcut router. Передає до Layer 2 з `model = persona.model_for_thinking` (Opus у cofounder).
- **Template:** N/A — full agent loop.
- **Cost:** **Layer 2 only.** Цей shortcut не «економить» — навпаки, він explicit-форсує дорогу модель.

---

## Implementation pattern

```ts
// packages/openclaw-plugin/src/shortcuts/metrics.ts
import { defineShortcut } from "../shortcut-router";

export const metricsShortcut = defineShortcut({
  name: "metrics",
  patterns: [
    /^\/metrics\b/,
    /як справи з метриками/i,
    /дай метрики/i,
    /what's the status of metrics/i,
  ],
  async execute(_match, ctx) {
    await ctx.tool("refresh_business_snapshot", {});
    const [posthog, stripe, sentry] = await Promise.all([
      ctx.tool("get_posthog_stats", { window: "today" }),
      ctx.tool("get_stripe_metrics", { days: 1 }),
      ctx.tool("get_sentry_issues", { limit: 5 }),
    ]);
    return ctx.render("canned-templates/metrics.md", {
      posthog,
      stripe,
      sentry,
    });
  },
});
```

`shortcut-router.ts` ітерує по всім зареєстрованим shortcut-ам у `llm_input` hook **перед** будь-яким LLM-call. Якщо `match` — execute + reply + skip LLM.

---

## Telemetry

Кожне виконання Layer 0 shortcut пише row у `openclaw_invocations` з:

- `trigger = 'shortcut'`
- `shortcut_name = 'metrics'`
- `cost_usd = 0` (тільки tool execute, без LLM)
- `latency_ms = <execution time>`

Це дозволяє у Phase 6 рахувати % message-ів, які обійшлися без LLM (метрика економії).
