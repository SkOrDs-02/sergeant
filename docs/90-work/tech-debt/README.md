# Технічний борг

> **Last validated:** 2026-07-20 by @cursoragent (full reconcile vs HEAD). **Next review:** 2026-10-18.
> **Status:** Active — живі реєстри: `backend.md` / `frontend.md` / `mobile.md` / `tech-debt-assessment-2026-07-01.md`. Закриті плани у [`archive/`](./archive/).

> **Оновлено 2026-07-20.** Re-audit усіх живих реєстрів проти коду на `main` (`a7a2814`). Ключові зсуви: web coverage floor **89** (не 85); server `max-lines` allowlist **порожній** + `asyncHandler` видалено (PR #134); міграції **82** (latest `082_plata_card_token.sql`); hosting-секції backend → **Coolify/Hetzner** (ADR-0074); mobile type-bypass allowlist **порожній**; JSON assessment 2026-06-05 перенесено в `archive/`. Деталі — у [`tech-debt-assessment-2026-07-01.md`](./tech-debt-assessment-2026-07-01.md).

Living-реєстри технічного боргу.

## Активні

| Документ                                                                     | Опис                                              |
| ---------------------------------------------------------------------------- | ------------------------------------------------- |
| [`frontend.md`](./frontend.md)                                               | Фронтенд tech-debt (`apps/web`)                   |
| [`backend.md`](./backend.md)                                                 | Бекенд tech-debt (`apps/server` + migrations)     |
| [`mobile.md`](./mobile.md)                                                   | Mobile (`apps/mobile` Expo + `apps/mobile-shell`) |
| [`tech-debt-assessment-2026-07-01.md`](./tech-debt-assessment-2026-07-01.md) | Актуальний burndown / assessment                  |

## Архів

Закриті плани й історичні оцінки — [`archive/`](./archive/) (Batch 2026-07-20, 90-day gate skipped; JSON snapshot доархівовано в тому ж reconcile):

| Документ                                                                               | Опис                                           |
| -------------------------------------------------------------------------------------- | ---------------------------------------------- |
| [`priority-1-executive.md`](archive/priority-1-executive.md)                           | Зведення P1-спринту (критичний борг)           |
| [`syncV2-engineering-ticket.md`](archive/syncV2-engineering-ticket.md)                 | Тікет: поділ `syncV2.ts`                       |
| [`syncV2-refactor-plan.md`](archive/syncV2-refactor-plan.md)                           | План рефакторингу Stage 2                      |
| [`syncV2-refactor-execution.md`](archive/syncV2-refactor-execution.md)                 | Звіт виконання рефакторингу                    |
| [`technical-assessment-2026-06-05.md`](archive/technical-assessment-2026-06-05.md)     | Історичний аудит 2026-06-05                    |
| [`technical-assessment-2026-06-05.json`](archive/technical-assessment-2026-06-05.json) | Машиночитабельний зріз того ж аудиту           |
| [`express-5-migration-plan.md`](archive/express-5-migration-plan.md)                   | Express 4→5 план (виконано; asyncHandler done) |

Кожен **живий** файл має CI freshness-gate ([`scripts/check-tech-debt-freshness.mjs`](../../../scripts/check-tech-debt-freshness.mjs))
з порогом 60 днів. Маркер `> **Оновлено YYYY-MM-DD.**` у заголовку
треба вручну оновлювати при кожному audit-passе.

## Статус-маркери — що можна брати зараз, а що ні

Щоб заблоковані/«не-готові» таски не плуталися з тими, які можна робити
прямо зараз, кожен **не-actionable** пункт несе явний токен
`🚫 Blocked-reason: <category>`. Actionable-таски токена не мають.

| Category         | Значення                                                                   | Що потрібно для розблокування                                    |
| ---------------- | -------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `data-gated`     | Код готовий/частково готовий, але рішення впирається у збір даних з прода. | Накопичити дані (напр. ≥ 7 днів RUM-телеметрії) і прийняти call. |
| `external-infra` | Потрібна провізія в зовнішньому сервісі (Apple/Google/Sentry/Coolify).     | Створити ресурс / виставити секрет поза репо.                    |
| `dep-blocked`    | Чекає на оновлення залежності чи платформи.                                | Бамп блокуючої залежності (напр. Expo SDK).                      |
| `owner-decision` | Потребує архітектурного рішення власника (не механічний фікс).             | Рішення `@Skords-01` (allowlist vs міграція, тригер ініціативи). |
| `by-design`      | Навмисний scaffold / lifecycle-маркер — не видаляти.                       | Дочекатися `@nextStep` / `@removeBy` з маркера файлу.            |

**Знайти всі не-готові таски одразу:**

```bash
grep -rn "Blocked-reason" docs/90-work/tech-debt/
```

Усе, що НЕ потрапило у цей grep, вважається actionable.
