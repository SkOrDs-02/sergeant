# Engineering Initiatives

> **Last validated:** 2026-05-03 by Devin. **Next review:** 2026-08-03.
> **Status:** Active

Цей розділ — **операційний плейлист** для інженерної команди. Кожен файл — одна окрема ініціатива, яка описує проблему, обсяг змін, план виконання та критерії готовності.

## Чим це не є

- **Це не аудит.** Аудити лежать у [`docs/audits/`](../audits/) і фіксують стан у конкретний момент. Ініціативи — це **плани змін**, які виходять з аудитів.
- **Це не ADR.** ADR ([`docs/adr/`](../adr/)) фіксують **рішення** post-factum. Ініціатива — це **робота, яку треба зробити**, і вона може породити ADR як побічний продукт.
- **Це не tech-debt registry.** [`docs/tech-debt/`](../tech-debt/) — реєстр боргу. Ініціатива має **дату завершення** і **метрики успіху**; борг там осідає, поки ініціатива його не закриє.

## Як читати

Кожен файл має префікс `NNNN-` за порядком створення (як у ADR), стабільний slug і таку саму структуру:

| Секція            | Призначення                                          |
| ----------------- | ---------------------------------------------------- |
| **TL;DR**         | 3–4 речення. Що робимо і чому зараз.                 |
| **Чому зараз**    | Контекст, тригер, ризик зволікання.                  |
| **Скоуп**         | In / Out — щоб не розпливалось.                      |
| **План змін**     | Розбито на фази / PR-и з конкретними файлами.        |
| **Критерії DONE** | Метрики, гарди в CI, видимі ефекти.                  |
| **Ризики**        | Що може піти не так і як митиґуємо.                  |
| **Власник / ETA** | Хто веде та орієнтовний дедлайн.                     |
| **Посилання**     | Аудит-сорс, ADR, tech-debt, релевантні PR-и, issues. |

## Активні ініціативи (травень 2026)

| #    | Назва                                                                      | Пріоритет | Власник      | ETA              | Статус                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ---- | -------------------------------------------------------------------------- | --------- | ------------ | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0001 | [Module decomposition + `max-lines` guard](./0001-module-decomposition.md) | P0        | `@Skords-01` | Sprint 1 (2 wk)  | **Done** (2026-05-04) — Phase 1 [#1555](https://github.com/Skords-01/Sergeant/pull/1555) + Phase 2 [#1593](https://github.com/Skords-01/Sergeant/pull/1593) [#1594](https://github.com/Skords-01/Sergeant/pull/1594) [#1596](https://github.com/Skords-01/Sergeant/pull/1596) [#1597](https://github.com/Skords-01/Sergeant/pull/1597) [#1603](https://github.com/Skords-01/Sergeant/pull/1603) + Phase 3 finalize. 5 з 5 запланованих топ-1 моноліт-файлів декомпоновано. Lint guard active. Carry-over (FinykApp, Workouts, drift) → successor. |
| 0002 | [Mobile platform decision](./0002-mobile-platform-decision.md)             | P0        | `@Skords-01` | Sprint 1 (2 wk)  | In progress (Phase 1 — sunset locked, lint guard live, PR open)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 0003 | [Sync v2 rollout & v1 sunset](./0003-sync-v2-rollout-and-v1-sunset.md)     | P0        | `@Skords-01` | Sprint 1–2       | Proposed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| 0004 | [Server observability (Sentry + OTel)](./0004-server-observability.md)     | P0        | `@Skords-01` | Sprint 1 (1 wk)  | **Done** (2026-05-04) — Sentry server-side + ALS context + `traceparent` middleware + 9 Grafana dashboards + Prom alerts шипнуто. OTEL distributed tracing → carry-over до [ADR-0035](../adr/0035-distributed-tracing-opentelemetry.md) follow-up.                                                                                                                                                                                                                                                                                                |
| 0005 | [AI cost optimisation (prompt cache)](./0005-ai-cost-and-prompt-cache.md)  | P0        | `@Skords-01` | Sprint 1 (3 dni) | **Done** (2026-05-04) — Prompt-cache на 2 breakpoints (`system[0]` + last tool) у `chat.ts`, `ai_tokens_total` / `ai_cost_estimate_usd_total` / `anthropic_prompt_cache_hit_total` Prom counters, 7-panel `ai-cost.json` Grafana, alerts. Policy зафіксована в [ADR-0039](../adr/0039-anthropic-prompt-cache-policy.md).                                                                                                                                                                                                                          |
| 0006 | [Frontend routing & code-split](./0006-frontend-routing-and-code-split.md) | P1        | `@Skords-01` | Sprint 2 (2 wk)  | Proposed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| 0007 | [Design-system tooling (Storybook + VR)](./0007-design-system-tooling.md)  | P1        | `@Skords-01` | Sprint 2 (2 wk)  | Proposed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| 0008 | [Platform hardening (rate-limit, health)](./0008-platform-hardening.md)    | P1        | `@Skords-01` | Sprint 2 (1 wk)  | Proposed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |

## Статуси

- **Proposed** — драфт готовий, ще не почато.
- **In progress** — є PR-и в роботі, статус видно у мердж-чек-листі ініціативи.
- **Done** — всі PR-и змерджено, `Критерії DONE` виконано. Файл лишається в репі для історії.
- **Withdrawn** — ініціативу відкликано (проблема зникла / змінилися пріоритети). Поясніть у файлі.

## Гайдлайн для авторів

1. Перш ніж відкрити нову ініціативу — перевірте, чи це не вписується в існуючу. Краще оновити, ніж множити.
2. Один PR — одна фаза. Не змішуйте «впровадити lint-правило» і «декомпонувати 7 файлів» в одному PR.
3. Якщо ініціатива потребує архітектурного рішення — створіть ADR в тому ж sprint-і. Слід — посилання сюди.
4. Закриваючи ініціативу — оновіть статус у цій таблиці і допишіть короткий **Outcome** в кінці файлу (що вийшло, що ні, посилання на змерджені PR-и).

## Джерела

- [`docs/audits/`](../audits/) — формальні аудити, з яких ці ініціативи виросли (зокрема `2026-04-28-sergeant-comprehensive-audit.md` та design-review від 2026-05-03).
- [`docs/tech-debt/`](../tech-debt/) — борг, який ці ініціативи мають закривати.
- [`docs/adr/`](../adr/) — фіксація рішень, які з ініціатив випливають.
