# OpenClaw morning briefing — hardcoded template + LLM proposals (PR-26 / O1)

> **Last validated:** 2026-05-13 by Devin. **Next review:** 2026-08-11.
> **Status:** Active

Operational runbook для morning-briefing-у:

- **PR-26** ([`docs/planning/pr-plan-2026-05.md`](../planning/pr-plan-2026-05.md))
  — 5 hardcoded секцій (Stripe / PostHog / GitHub PR-черга / n8n / Sentry).
- **O1 / Phase 2.A** у [`docs/launch/tech/openclaw-roadmap.md`](../launch/tech/openclaw-roadmap.md)
  — LLM-секція «🎯 Пропозиції на сьогодні» (3 next-actions
  від cofounder-а на основі ранкових метрик) над холодними блоками.

Покриває (a) які секції рендеряться + з яких джерел, (b) як read-only
manual probe-нути endpoint, (c) як degrade-ається при `notConfigured`-секціях

- при Anthropic outage-і.

## Що робить module

Two-tier module:

- **`buildMorningBriefing(data: MorningBriefingData): string`** — pure
  Markdown-formatter. Не робить I/O. Викликається з тестів та orchestrator-ів.
- **`assembleMorningBriefing(input)` → `{ markdown, data }`** — orchestrator.
  Викликає у паралель 5 read-tool-ів і мапить їх у `MorningBriefingData`:

  | Секція                         | Джерело                                                                               |
  | ------------------------------ | ------------------------------------------------------------------------------------- |
  | 🎯 Пропозиції на сьогодні (O1) | `LLMProvider` (PR-23) — вхід = summary 5 метричних секцій                             |
  | 💵 MRR / Stripe                | `getStripeMetrics({ days: windowDays })`                                              |
  | 👥 Signups / PostHog           | `getPostHogStats` (`$pageview`) + окремий trend для `subscription_started`            |
  | 🔀 PR-черга / GitHub           | `githubPrs({ state: "open" })` — drafts excluded, `needs-review` ≡ no reviewers/teams |
  | ⚙️ n8n workflow-и              | `listN8nWorkflows({ limit: 250 })`                                                    |
  | 🚨 User-facing alerts / Sentry | `getSentryIssues({ level: "error", limit: sentryLimit })`                             |

  Всі 5 metric-викликів виконуються через `Promise.allSettled` — будь-який
  rejection стає `note` у відповідній секції; LLM-виклик відбувається
  після збору метрик (секвенційно), бо він приймає їхнє summary як
  контекст. Будь-яка помилка LLM — fail-soft через `note` в секції.

Реалізація: <code>apps/server/src/modules/openclaw/briefing/{types,template,builder}.ts</code>.

## HTTP route

```http
POST /api/internal/openclaw/briefing/morning
Content-Type: application/json

{
  "windowDays": 1,           // 1..30, default 1
  "githubRepo": "...",       // owner/repo, default env.OPENCLAW_GITHUB_REPO
  "sentryLimit": 3,          // 1..20, default 3
  "prLimit": 5,              // 1..30, default 5
  "includeProposals": true   // boolean, default true — O1 LLM-секція
}
```

`includeProposals: false` вимикає LLM-call — корисно при Anthropic
incident-і або для отримання чистого 5-секційного briefing-у без
витрат токенів.

Response:

```json
{
  "markdown": "🌅 *Морній брифінг — 2026-05-12*\n\n*🎯 Пропозиції на сьогодні*\n1. Закрити PR #101 …",
  "data": {
    "generatedAt": "2026-05-13T06:00:00.000Z",
    "reportingDate": "2026-05-12",
    "stripe": { ... },
    "signups": { ... },
    "prQueue": { ... },
    "workflows": { ... },
    "alerts": { ... },
    "proposals": {
      "proposals": ["Закрити PR #101", "Перевірити Sentry spike", "Розписати growth-experiment"],
      "reasoning": "PR-черга росте, Sentry показав error, growth блокує MRR."
    }
  }
}
```

При LLM-outage / `LLM_PROVIDER=stub` секція `proposals` рендериться як
`{notConfigured: true, note: "…"}` або `{note: "…"}` без списку (див.
§ LLM proposals нижче).

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

| Env                     | Section affected | Notes                                                                          |
| ----------------------- | ---------------- | ------------------------------------------------------------------------------ |
| `STRIPE_SECRET_KEY`     | 💵 Stripe        | Без нього — `notConfigured: true`                                              |
| `POSTHOG_API_KEY`       | 👥 Signups       | Обидва ключі потрібні                                                          |
| `POSTHOG_PROJECT_ID`    | 👥 Signups       | Обидва ключі потрібні                                                          |
| `OPENCLAW_GITHUB_APP_*` | 🔀 PR-черга      | Або GitHub App, або `OPENCLAW_GITHUB_PAT` (dev)                                |
| `OPENCLAW_GITHUB_REPO`  | 🔀 PR-черга      | Default `Skords-01/Sergeant`                                                   |
| `N8N_API_URL`           | ⚙️ Workflow-и    | Обидва потрібні                                                                |
| `N8N_API_KEY`           | ⚙️ Workflow-и    | Обидва потрібні                                                                |
| `SENTRY_AUTH_TOKEN`     | 🚨 Sentry        | + `SENTRY_ORG` для повного шляху                                               |
| `SENTRY_ORG`            | 🚨 Sentry        |                                                                                |
| `ANTHROPIC_API_KEY`     | 🎯 Пропозиції    | Без нього LLM-fallback → `StubProvider` → `notConfigured: true`                |
| `LLM_PROVIDER`          | 🎯 Пропозиції    | `anthropic` (default) / `stub` / `openrouter`. `stub` вважається notConfigured |

## LLM proposals (O1 / Phase 2.A)

Перша секція briefing-у — LLM-генеровані 3 next-action-и для founder-а
(режим cofounder-Сергій, українська). Рендериться над холодними
метричними блоками, щоб першим бачення було § Пропозиції, а не цифри.

### Wiring

- Provider: `getLLMProvider()` (PR-23) → резолвить за `env.LLM_PROVIDER` /
  `env.ANTHROPIC_API_KEY`. При `LLM_PROVIDER=stub` або відсутньому ключі
  — `StubProvider` → секція «Пропозиції» рендериться як `notConfigured`.
- Model: `claude-sonnet-4-5-20250929`, `maxTokens=400`, `temperature=0.4`.
  ~300 вхідних / ~150 вихідних токенів на briefing.
- Endpoint label для Prometheus + Sentry breadcrumb-ів —
  `internal/openclaw/briefing/morning/proposals` (окремий від
  `classify` / `weekly-digest`).

### Output shape

```json
{
  "proposals": {
    "proposals": ["…", "…", "…"],
    "reasoning": "… (optional, 1-2 речення)",
    "notConfigured": false,
    "note": "… (optional, див. § Error-handling)"
  }
}
```

LLM відповідає raw-JSON-ом (`extractJsonFromText` витягує його навіть
якщо обгорнутий у markdown). Ми обрізаємо `proposals[]` до перших 3 i
фільтруємо порожні / non-string елементи.

### Fail-soft матриця

| Ситуація                             | `data.proposals`                                   | UI hint                                      |
| ------------------------------------ | -------------------------------------------------- | -------------------------------------------- |
| `LLM_PROVIDER=stub` / нема ключа     | `{ notConfigured: true, note: "… stub-режимі …" }` | «_LLM-провайдер не сконфігурований…_»        |
| Anthropic 429                        | `{ note: "LLM rate-limit; фокус — roadmap…" }`     | «- LLM rate-limit…»                          |
| Anthropic timeout                    | `{ note: "LLM timeout; фокус — roadmap…" }`        | «- LLM timeout…»                             |
| Anthropic 5xx / generic error        | `{ note: "LLM-пропозиції недоступні…" }`           | «- LLM-пропозиції недоступні (див. Sentry).» |
| LLM повернув non-JSON / [] proposals | `{ note: "LLM повернув невалідний JSON…" }`        | «- LLM повернув невалідний JSON…»            |
| `includeProposals: false`            | відсутня                                           | секція не рендериться                        |

Моніторинг: Sentry breadcrumb від `invokeLLM` з tag `endpoint:
internal/openclaw/briefing/morning/proposals` + Prometheus counter
`llm_calls_total{endpoint="internal/openclaw/briefing/morning/proposals"}`.
При incident-і вимикаємо секцію через `LLM_PROVIDER=stub` (env-var у
Railway) або через body-param `includeProposals: false` (caller-side).

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
gateway-боті як fallback. Після O1 (ця ревізія рунбуку) WF-25 вже
продукує LLM-proposals разом з метриками, тому legacy CronJob можна
вимкнути після 1-2 тижнів spot-check-ів (founder-підтвердження, що
WF-25 ship-иться регулярно + LLM-секція без фейлів).

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
   — 63 unit-теста для template + builder + LLM proposals варіації.
3. Перевір env-vars matrix вище.
4. Якщо `proposals.note` містить «LLM rate-limit» / «недоступні» —
   див. Sentry за endpoint `internal/openclaw/briefing/morning/proposals`,
   та Prometheus `llm_calls_total{result="error"}` для того ж endpoint-у.
   При продовженій Anthropic incident-і вимкни LLM-секцію через
   `LLM_PROVIDER=stub` у Railway.
