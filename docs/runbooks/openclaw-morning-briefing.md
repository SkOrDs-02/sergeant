# OpenClaw morning briefing — hardcoded template (PR-26)

> **Last validated:** 2026-05-13 by Devin. **Next review:** 2026-08-11.
> **Status:** Active

Operational runbook для morning-briefing template-у (PR-26 з
[`docs/planning/pr-plan-2026-05.md`](../planning/pr-plan-2026-05.md);
Phase 2.A у [`docs/launch/tech/openclaw-roadmap.md`](../launch/tech/openclaw-roadmap.md)).
Покриває (a) які 5 секцій рендеряться + з яких джерел, (b) як read-only
manual probe-нути endpoint, (c) як degrade-ається при `notConfigured`-секціях.

## Що робить module

Two-tier module:

- **`buildMorningBriefing(data: MorningBriefingData): string`** — pure
  Markdown-formatter. Не робить I/O. Викликається з тестів та orchestrator-ів.
- **`assembleMorningBriefing(input)` → `{ markdown, data }`** — orchestrator.
  Викликає у паралель 5 read-tool-ів і мапить їх у `MorningBriefingData`:

  | Секція                         | Джерело                                                                               |
  | ------------------------------ | ------------------------------------------------------------------------------------- |
  | 💵 MRR / Stripe                | `getStripeMetrics({ days: windowDays })`                                              |
  | 👥 Signups / PostHog           | `getPostHogStats` (`$pageview`) + окремий trend для `subscription_started`            |
  | 🔀 PR-черга / GitHub           | `githubPrs({ state: "open" })` — drafts excluded, `needs-review` ≡ no reviewers/teams |
  | ⚙️ n8n workflow-и              | `listN8nWorkflows({ limit: 250 })`                                                    |
  | 🚨 User-facing alerts / Sentry | `getSentryIssues({ level: "error", limit: sentryLimit })`                             |

  Усі виклики виконуються через `Promise.allSettled` — будь-який rejection
  стає `note` у відповідній секції (briefing рендерить інші 4 секції без
  пропусків).

Реалізація: <code>apps/server/src/modules/openclaw/briefing/{types,template,builder}.ts</code>.

## HTTP route

```http
POST /api/internal/openclaw/briefing/morning
Content-Type: application/json

{
  "windowDays": 1,      // 1..30, default 1
  "githubRepo": "...",  // owner/repo, default env.OPENCLAW_GITHUB_REPO
  "sentryLimit": 3,     // 1..20, default 3
  "prLimit": 5          // 1..30, default 5
}
```

Response:

```json
{
  "markdown": "🌅 *Морній брифінг — 2026-05-12*\n\n*💵 MRR / Stripe*\n...",
  "data": {
    "generatedAt": "2026-05-13T06:00:00.000Z",
    "reportingDate": "2026-05-12",
    "stripe": { ... },
    "signups": { ... },
    "prQueue": { ... },
    "workflows": { ... },
    "alerts": { ... }
  }
}
```

`reportingDate` — `YYYY-MM-DD` для дня перед `nowMs` у Europe/Kyiv (domain
invariant з [`docs/architecture/domain-invariants.md`](../architecture/domain-invariants.md)).

## Smoke-test

```bash
curl -sS -X POST http://localhost:3000/api/internal/openclaw/briefing/morning \
  -H "Content-Type: application/json" -d '{}' | jq -r '.markdown'
```

Очікуваний output (без сконфігурованих джерел):

```
🌅 *Морній брифінг — 2026-05-12*

*💵 MRR / Stripe*
- _STRIPE_SECRET_KEY не сконфігурований — Stripe-метрики недоступні._

*👥 Signups / PostHog*
- _POSTHOG_API_KEY / POSTHOG_PROJECT_ID не сконфігуровані — PostHog-метрики недоступні._

*🔀 PR-черга / GitHub*
- _OpenClaw GitHub auth не сконфігурована — PR-черга недоступна._

*⚙️ n8n workflow-и*
- _N8N_API_URL / N8N_API_KEY не сконфігуровані — n8n-метрики недоступні._

*🚨 User-facing alerts / Sentry*
- _SENTRY_AUTH_TOKEN не сконфігурований — Sentry-метрики недоступні._
```

## Env-vars matrix

| Env                     | Section affected | Notes                                           |
| ----------------------- | ---------------- | ----------------------------------------------- |
| `STRIPE_SECRET_KEY`     | 💵 Stripe        | Без нього — `notConfigured: true`               |
| `POSTHOG_API_KEY`       | 👥 Signups       | Обидва ключі потрібні                           |
| `POSTHOG_PROJECT_ID`    | 👥 Signups       | Обидва ключі потрібні                           |
| `OPENCLAW_GITHUB_APP_*` | 🔀 PR-черга      | Або GitHub App, або `OPENCLAW_GITHUB_PAT` (dev) |
| `OPENCLAW_GITHUB_REPO`  | 🔀 PR-черга      | Default `Skords-01/Sergeant`                    |
| `N8N_API_URL`           | ⚙️ Workflow-и    | Обидва потрібні                                 |
| `N8N_API_KEY`           | ⚙️ Workflow-и    | Обидва потрібні                                 |
| `SENTRY_AUTH_TOKEN`     | 🚨 Sentry        | + `SENTRY_ORG` для повного шляху                |
| `SENTRY_ORG`            | 🚨 Sentry        |                                                 |

## Cron wiring

PR-27 (`feat(ops): WF-25 morning-briefing cron`) додав n8n workflow
[`ops/n8n-workflows/25-morning-briefing-cron.json`](../../ops/n8n-workflows/25-morning-briefing-cron.json),
який дергає endpoint щоранку о 07:00 Kyiv і шле markdown founder-у
через `@OpenClaw_sergeant_bot` raw HTTP. Audit-row у `n8n_webhook_events`
зберігає кожен exec для replay/diagnostics (PR-28).

Monitor / disable / env-vars matrix — у
[`docs/observability/runbook.md` § WF-25 — Morning briefing cron](../observability/runbook.md#wf-25--morning-briefing-cron-0700-kyiv--founder-dm).

Legacy `morning-digest` CronJob (`ops/openclaw/provision-cron.mjs` →
`/digest day` Layer 0-shortcut, `0 9 * * *` UTC) досі активний у
gateway-боті як fallback; PR-27 НЕ ламає його, але майбутній
LLM-summarization-PR замінить raw template на Anthropic-proposal
("сьогодні фокусуємо на X через Y") і той fallback зможемо вимкнути.

## Error-handling

- **rejected promise** (network error, 5xx upstream) → секція рендерить
  `- ${note}` із generic-меседжем "недоступно (fetch failed)". Інші
  секції рендеряться нормально.
- **`notConfigured: true`** з джерела (env-var unset) → hint-меседж
  під emoji-header-ом, без зайвих метрик.
- **partial data** (тільки кілька полів від upstream) → `_не виміряно_`
  fallback на missing-поля.

## Escalation

Якщо briefing repeatedly empty / wrong:

1. `curl POST /api/internal/openclaw/briefing/morning` локально — поглянь
   `data.<section>.notConfigured` чи `data.<section>.note` у JSON-відповіді.
2. `pnpm --filter @sergeant/server exec vitest run src/modules/openclaw/briefing/`
   — 33 unit-теста для template + builder.
3. Перевір env-vars matrix вище.
