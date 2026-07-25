# Sergeant PostHog assets

> **Last validated:** 2026-05-13 by @Skords-01 / Devin. **Next review:** 2026-08-11.
> **Status:** Active

PostHog assets, що версіонуються разом із кодом — на відміну від manually-pinned дашбордів усередині PostHog UI. Сюди йдуть **portable manifests** для дашбордів, які можна імпортувати через PostHog REST API (`POST /api/projects/:id/insights/` + `POST /api/projects/:id/dashboards/`). Runbook-и (HogQL, цілі, алерти) лежать поруч у [`docs/03-operations/observability/`](../../docs/03-operations/observability/).

## Структура

```
ops/posthog/
├── dashboards/
│   ├── founder-pulse.json      # WF-60 growth-funnel dashboard (PR-10).
│   └── hub-tab-perf.json       # RUM для Initiative 0017 (Hub tab-switch perf).
└── schema/
    └── dashboard.schema.json   # JSON Schema контракту манифесту (draft-07).
```

| Файл                                                               | Скоуп                                                                                                                                                                 | Runbook                                                                                                                        |
| ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| [`dashboards/founder-pulse.json`](./dashboards/founder-pulse.json) | DAU/WAU/MAU, WF-60 funnel (signup → onboarding → first_action → subscription), per-module funnel, D1/D7/D30 retention, activation rate, new-MRR, funnel-ZEROES canary | [`docs/03-operations/observability/posthog-founder-pulse.md`](../../docs/03-operations/observability/posthog-founder-pulse.md) |
| [`dashboards/hub-tab-perf.json`](./dashboards/hub-tab-perf.json)   | P50/P95 `ttiMs` по табах Hub, long-task burden, cache-hit ratio, гістограма TTI, денний тренд — з подій `hub_tab_switch_perf`                                         | [`docs/03-operations/observability/hub-perf-baseline.md`](../../docs/03-operations/observability/hub-perf-baseline.md)         |
| [`schema/dashboard.schema.json`](./schema/dashboard.schema.json)   | JSON Schema (draft-07) для всіх манифестів вище — на неї вказує поле `$schema` кожного файлу                                                                          | —                                                                                                                              |

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

### Lint-гейт

Контракт формалізовано в [`schema/dashboard.schema.json`](./schema/dashboard.schema.json) (JSON Schema draft-07) і перевіряється механічно:

```bash
pnpm lint:posthog-manifests   # AJV-валідація + референційні перевірки + юніт-тести
```

Гейт входить в агрегатний `pnpm lint`, тож ганяється в CI на кожному PR. Що він ловить понад схему:

- `panels[].key` унікальні; кожен `alerts[].panel` і `umbrella_dashboard.tiles[].panel` вказує на наявну панель; жодна панель не загубилась поза tiles;
- `key` манифесту збігається з іменем файлу (від нього ж деривується tag-namespace);
- **колізія tag-namespace між манифестами** (див. нижче);
- панель, яку `buildQuery()` імпортера не вміє відрендерити (тип поза `funnel` / `retention` і без `query.kind = "HogQLQuery"`) — раніше це падало аж у рантаймі імпорту;
- `timezone` завжди `Europe/Kyiv` (доменний інваріант), `targets` обовʼязкові в кожній панелі, невідомі поля заборонені (`additionalProperties: false` — гейт проти мовчазного drift-у).

`targets` можна тимчасово заповнити явною заглушкою (`"TBD після baseline (<дата>)"`), але не можна лишити порожніми: панель без цілі неможливо прочитати як «добре чи погано».

### Tag-namespace (важливо для другого манифесту)

Імпортер деривує namespace з `manifest.key` — ініціали kebab-сегментів: `founder-pulse` → `fp`, `hub-tab-perf` → `htp`, `value-loops` → `vl`. На кожен інсайт пишеться трійка тегів:

```
[ "<manifest.key>", "managed-by-manifest", "<prefix>:<panel.key>" ]
```

Пошук «оновити чи створити» **обмежений інсайтами, що належать поточному манифесту** (тег `manifest.key` або власний префікс). До цієї зміни матчер сканував увесь проєкт по `fp:` + fallback по імені, тому другий манифест зі збігом `panel.key` або назви панелі мовчки PATCH-нув би живий інсайт Founder Pulse. Тепер це неможливо, і колізію префіксів окремо ловить `pnpm lint:posthog-manifests`.

Виняток свідомий: `founder-pulse` лишається в `LEGACY_GLOBAL_NAME_FALLBACK` — його сім живих інсайтів створено до тегування (`short_id` у runbook §1), тож для нього збережено project-wide fallback по імені. Нові манифести його **не** отримують.

## Імпорт у PostHog

**Auto-import (рекомендовано):** [`scripts/posthog/import-founder-pulse.mjs`](../../scripts/posthog/import-founder-pulse.mjs) створює всі insights + umbrella dashboard через REST API. Idempotent — повторний запуск reuse-ить dashboard і матчить insights за per-panel тегом (див. § «Tag-namespace»), з fallback-ом на `name`:

```bash
POSTHOG_API_KEY=phx_… pnpm posthog:import \
  --manifest ops/posthog/dashboards/founder-pulse.json \
  [--project 167740] [--host https://eu.posthog.com] [--dry-run]
```

`POSTHOG_API_KEY` — personal API key із правом запису. Тільки через env; ніколи в репо, логах чи описі PR (AGENTS.md § SECURITY, Hard Rule #20). Перед будь-яким записом у прод (`167740`) прогони той самий манифест на dev-проєкті `167756` із `--dry-run` і звір план.

Funnel-панелі → native `FunnelsQuery`, retention → `RetentionQuery`, решта → HogQL SQL-insights. `--dry-run` друкує план без запису.

**Manual (fallback)** — via PostHog UI (Insights → SQL editor → paste `query.query`, save, pin to dashboard). Для кожного `panel`:

1. **PostHog → Default project (`167740`) → Data exploration → SQL editor.**
2. Вставити `panel.query.query` (HogQL). Перевірити `LIMIT 100` для контракту.
3. **Save as Insight.** Назва = `panel.name`. Опис = `panel.description` + `panel.rationale`.
4. Pin to **Dashboards → Founder Pulse** (створити, якщо немає).
5. Cross-check у runbook (`docs/03-operations/observability/posthog-founder-pulse.md`) — додати live insight `short_id` після збереження.

✅ Auto-import реалізовано (2026-06-26): [`scripts/posthog/import-founder-pulse.mjs`](../../scripts/posthog/import-founder-pulse.mjs) — закриває PR-11. Опційний наступний крок — cron-обгортка (WF-16) для періодичного re-sync drift-detection.

## Контракт із canonical events

JSON `events_contract` — це snapshot пейлоадів на момент додавання панелі. Якщо подія в [`packages/shared/src/lib/analyticsEvents.ts`](../../packages/shared/src/lib/analyticsEvents.ts) змінює пейлоад, manifest **повинен** оновитись у тому самому PR-і. Інакше HogQL silently zero-out tiles ≥7 днів до того, як хтось помітить (див. `docs/03-operations/observability/posthog-ftux-dashboards.md` §3 — той самий контракт).

## Пов'язано

- [`schema/dashboard.schema.json`](./schema/dashboard.schema.json) — контракт манифесту; [`scripts/posthog/lint-manifests.mjs`](../../scripts/posthog/lint-manifests.mjs) — гейт (`pnpm lint:posthog-manifests`).
- [`docs/03-operations/observability/posthog-founder-pulse.md`](../../docs/03-operations/observability/posthog-founder-pulse.md) — runbook + цілі + алерти для цього дашборду.
- [`docs/03-operations/observability/hub-perf-baseline.md`](../../docs/03-operations/observability/hub-perf-baseline.md) — runbook для `hub-tab-perf.json`.
- [`docs/03-operations/observability/posthog-ftux-dashboards.md`](../../docs/03-operations/observability/posthog-ftux-dashboards.md) — runbook для FTUX-overview дашборду (manually-pinned у PostHog).
- [`packages/shared/src/lib/analyticsEvents.ts`](../../packages/shared/src/lib/analyticsEvents.ts) — canonical event-name registry.
- [`ops/n8n-workflows/60-growth-funnel-snapshot.json`](../n8n-workflows/60-growth-funnel-snapshot.json) — daily HogQL snapshot, що читає ті самі 4 funnel-події (PR-10 і WF-60 узгоджені на event names).
