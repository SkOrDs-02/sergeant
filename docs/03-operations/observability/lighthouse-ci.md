# Lighthouse CI — perf-budget gate

> **Last touched:** 2026-07-21 by @Skords-01. **Next review:** 2026-10-19.
> **Status:** Active

## Призначення

T5 gate (Sprint 9-10, S10-T3): автоматична перевірка Core Web Vitals `apps/web` на кожному PR, щоб регресії продуктивності (важкі bundle-и, render-blocking ресурси, повільний LCP) ловилися до merge, а не в проді.

## Як працює gate

- **Workflow:** [`.github/workflows/lighthouse-ci.yml`](../../../.github/workflows/lighthouse-ci.yml) — `pull_request` до `main` + `workflow_dispatch`. Status check у PR: **`Lighthouse CI`**.
- **Config:** [`apps/web/lighthouserc.json`](../../../apps/web/lighthouserc.json) — 3 прогони на маршрут, `desktop` preset, тільки категорія `performance`.
- **Маршрути (median з 3 runs):** `/`, `/finyk`, `/fizruk`, `/nutrition/menu`. `/nutrition` редіректить на `/nutrition/menu`, тому LHCI аудить canonical path напряму. `/` — це корінь Hub (окремого `/hub` не існує).
- **`/routine` тимчасово виключений** з LHCI — повторювані CI-only `NO_FCP` runtime-фейли (Chrome trace не встигає зловити First Contentful Paint у CI-середовищі). Маршрут покритий Playwright smoke-тестами замість Lighthouse, доки причина не полагоджена.

## Бюджети (median run)

| Метрика                          | Поріг   | Рівень              |
| -------------------------------- | ------- | ------------------- |
| `largest-contentful-paint` (LCP) | 3000 ms | `error` (fail-stop) |
| `first-contentful-paint` (FCP)   | 1500 ms | `warn`              |
| `total-blocking-time` (TBT)      | 200 ms  | `warn`              |

LCP — єдина метрика, що зупиняє merge (`error`); FCP/TBT лише попереджають (`warn`), job лишається зеленим.

## Локальний прогін

```bash
pnpm --filter @sergeant/web build          # без VERCEL=1 → build кладеться у ../server/dist
VERCEL=1 pnpm --filter @sergeant/web build  # потрібен для vite preview, щоб знайти dist
pnpm --filter @sergeant/web lighthouse      # lhci autorun: піднімає vite preview + жене LHCI
```

Reports падають у `apps/web/.lighthouseci/` (gitignored).

## Як читати результати в CI

1. Job `Lighthouse CI (perf budgets)` у PR-таб CI.
2. У кроці `Run Lighthouse CI` LHCI друкує `Open the report at <url>` — клік відкриває HTML-репорт на `storage.googleapis.com` (по одному URL на маршрут).
3. Або завантаж artifact `lighthouse-reports` (retention 14 днів) — `.lighthouseci/lhr-*.html` + `manifest.json`.
4. `NO_FCP` / server-start flake після retry — job soft-pass-ить з GitHub warning; деталі у `lhci-attempt.log`.

## Зміна бюджетів

Жорсткого override-механізму немає (на відміну від `size-limit` `audit-exception` label). Якщо потрібен hotfix-bypass:

1. **Preferred:** полагодь регресію перед merge — знайди у звіті `unused-javascript`, `largest-contentful-paint-element`, `render-blocking-resources`.
2. **Якщо потрібен incident-bypass:** додай у PR-description `[skip-lighthouse-ci]` + причину; у follow-up PR (≤24h) — або фікс регресії, або підняти поріг у `apps/web/lighthouserc.json` з justification у commit message.
3. GitHub required-status-check flip (переведення `Lighthouse CI` у required через branch-protection settings) — manual, зовнішній до цього репо.

## Джерела

- [`apps/web/AGENTS.md § Lighthouse CI`](../../../apps/web/AGENTS.md#lighthouse-ci-perf-budget-gate) — повний surface-specific опис (routes, gotchas, E2E-заміна для `/routine`).
- [`docs/90-work/planning/sprint-9-10-plan-2026.md`](../../90-work/planning/sprint-9-10-plan-2026.md) § S10-T3.
