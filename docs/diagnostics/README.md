# Diagnostics

> **Last validated:** 2026-05-03 by @Skords-01.
> **Status:** Active

Глибокі deep-dive прожарки коду / архітектури / UX, які **не** є періодичними аудитами.

## Чим це відрізняється від `docs/audits/`?

| | `docs/audits/` | `docs/diagnostics/` |
| --- | --- | --- |
| Періодичність | Регулярні (квартальні / напівщорічні) | Ad-hoc, на запит |
| Скоуп | Вся система чи весь домен | Тонкий зріз або фокусована thematic прожарка |
| Lifecycle | Active / Closed / Archived | Active / Superseded |
| Що породжує | Roadmap, plan, tracker | Спрямовані рекомендації + посилання у відповідні tracker-и |
| Приклад | `2026-04-28-sergeant-comprehensive-audit.md` | `2026-05-03-web-deep-dive/` |

> **Правило:** якщо документ описує **загальний стан** системи на дату — це аудит. Якщо це **точкова прожарка** з конкретними fix points — це diagnostic.

## Lifecycle

- **Active** — рекомендації ще не повністю мігровані у tracker / implementation roadmap.
- **Superseded** — наступна прожарка тієї самої поверхні замістила попередню, або висновки повністю переїхали у `docs/audits/*-implementation-roadmap.md` / `docs/tech-debt/*`.

## Документи

| Документ | Скоуп | Status |
| --- | --- | --- |
| [`2026-05-03-web-deep-dive/`](./2026-05-03-web-deep-dive/) | Глибока прожарка `apps/web` + `apps/server` + `packages/*` (frontend ergonomics, architecture, backend, performance, security, testing, DevX) | Active |

## Як додавати новий diagnostic

1. Створи директорію `YYYY-MM-DD-<slug>/` з:
   - `00-overview.md` — TL;DR + scoring + roadmap (impact × cost).
   - Окремі файли по темах (`01-...md`, `02-...md`, ...).
2. У кожному файлі:
   - У front-matter блоці зазнач `Last validated`, `Status`, `Scope`, `Related`.
   - Маркуй знахідки `[Bad]` / `[Good]` / `[Mixed]`.
   - Посилайся на конкретні файли (`apps/web/src/...:line`).
   - Кожна `[Bad]`-знахідка має «**Recommendation / fix points**» секцію.
3. Заведи запис у цьому README.
4. Якщо рекомендація переходить у roadmap / implementation — додай хрест-посилання `→ tracked in: docs/audits/<...>-implementation-roadmap.md`.
