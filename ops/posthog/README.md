# Sergeant PostHog assets

> **Last validated:** 2026-05-13 by @Skords-01 / Devin. **Next review:** 2026-08-11.
> **Status:** Active

PostHog assets, що версіонуються разом із кодом — на відміну від manually-pinned дашбордів усередині PostHog UI. Сюди йдуть **portable manifests** для дашбордів, які можна імпортувати через PostHog REST API (`POST /api/projects/:id/insights/` + `POST /api/projects/:id/dashboards/`). Runbook-и (HogQL, цілі, алерти) лежать поруч у [`docs/observability/`](../../docs/observability/).

## Структура

```
ops/posthog/
└── dashboards/
    └── founder-pulse.json    # WF-60 growth-funnel dashboard (PR-10).
```

| Файл                                                               | Скоуп                                                                                                                                                                 | Runbook                                                                                            |
| ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| [`dashboards/founder-pulse.json`](./dashboards/founder-pulse.json) | DAU/WAU/MAU, WF-60 funnel (signup → onboarding → first_action → subscription), per-module funnel, D1/D7/D30 retention, activation rate, new-MRR, funnel-ZEROES canary | [`docs/observability/posthog-founder-pulse.md`](../../docs/observability/posthog-founder-pulse.md) |

## Контракт JSON-файлу

Manifest — наш власний portable shape, **не** raw PostHog dashboard export. Це свідома відмова від PostHog-native експорту: PostHog `Insight` / `Dashboard` об'єкти прив'язані до конкретних `project_id`, `team_id`, `short_id`, які різні в `prod (167740)` і `dev (167756)` проєктах. Portable shape переживає це, але вимагає тонкого importer-а під час deploy.

```jsonc
{
  "version": 1,                            // bump on breaking schema changes
  "key": "founder-pulse",                  // stable id (kebab-case)
  "name": "Founder Pulse",                 // PostHog dashboard display name
  "description": "...",                    // PostHog dashboard description
  "timezone": "Europe/Kyiv",               // hard-coded для domain invariants
  "events_contract": { /* canonical events the dashboard depends on */ },
  "super_properties": ["platform", ...],   // expected super-properties
  "person_properties": ["vibe", ...],      // expected person-properties
  "panels": [
    {
      "key": "active-users",               // stable per-panel id
      "name": "Active users — DAU / WAU / MAU",
      "type": "trends" | "funnel" | "retention" | "hogql",
      "size": "wide" | "half" | "narrow",
      "description": "...",
      "rationale": "...",
      "targets": { /* numeric thresholds */ },
      // type-specific body:
      "query":  { "kind": "HogQLQuery", "query": "SELECT ..." },     // for `hogql`
      "steps":  [ { "event": "signup_completed" }, ... ],            // for `funnel`
      "cohortizing_event": "signup_completed",                       // for `retention`
      "breakdown": { "type": "super_property" | "person_property",
                     "key": "platform" }
    }
  ],
  "alerts": [ { "panel": "...", "condition": "...", "severity": "P1" | "P2" } ],
  "umbrella_dashboard": {
    "name": "Founder Pulse",
    "tiles": [ { "panel": "active-users", "row": 1, "width": "full" } ]
  }
}
```

## Імпорт у PostHog

Поки що — manual via PostHog UI (Insights → SQL editor → paste `query.query`, save, pin to dashboard). Для кожного `panel`:

1. **PostHog → Default project (`167740`) → Data exploration → SQL editor.**
2. Вставити `panel.query.query` (HogQL). Перевірити `LIMIT 100` для контракту.
3. **Save as Insight.** Назва = `panel.name`. Опис = `panel.description` + `panel.rationale`.
4. Pin to **Dashboards → Founder Pulse** (створити, якщо немає).
5. Cross-check у runbook (`docs/observability/posthog-founder-pulse.md`) — додати live insight `short_id` після збереження.

Auto-import (бажано) — окремий PR під WF-16 (`ops/n8n-workflows/16-posthog-daily-metrics.json`) розширюється або з'являється нова `import-posthog-dashboard.mjs` CLI-команда. Покривається [PR-11 з pr-plan-2026-05](../../docs/planning/pr-plan-2026-05.md).

## Контракт із canonical events

JSON `events_contract` — це snapshot пейлоадів на момент додавання панелі. Якщо подія в [`packages/shared/src/lib/analyticsEvents.ts`](../../packages/shared/src/lib/analyticsEvents.ts) змінює пейлоад, manifest **повинен** оновитись у тому самому PR-і. Інакше HogQL silently zero-out tiles ≥7 днів до того, як хтось помітить (див. `docs/observability/posthog-ftux-dashboards.md` §3 — той самий контракт).

## Пов'язано

- [`docs/observability/posthog-founder-pulse.md`](../../docs/observability/posthog-founder-pulse.md) — runbook + цілі + алерти для цього дашборду.
- [`docs/observability/posthog-ftux-dashboards.md`](../../docs/observability/posthog-ftux-dashboards.md) — runbook для FTUX-overview дашборду (manually-pinned у PostHog).
- [`packages/shared/src/lib/analyticsEvents.ts`](../../packages/shared/src/lib/analyticsEvents.ts) — canonical event-name registry.
- [`ops/n8n-workflows/60-growth-funnel-snapshot.json`](../n8n-workflows/60-growth-funnel-snapshot.json) — daily HogQL snapshot, що читає ті самі 4 funnel-події (PR-10 і WF-60 узгоджені на event names).
