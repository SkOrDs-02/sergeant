# Технічний борг

> **Last validated:** 2026-07-20 by @cursoragent (post fast-forward archive). **Next review:** 2026-10-18.
> **Status:** Active — живі реєстри: `backend.md` / `frontend.md` / `mobile.md` / `tech-debt-assessment-2026-07-01.md`. Закриті плани у [`archive/`](./archive/).

Living-реєстри технічного боргу.

## Активні

| Документ                                                                     | Опис                                              |
| ---------------------------------------------------------------------------- | ------------------------------------------------- |
| [`frontend.md`](./frontend.md)                                               | Фронтенд tech-debt (`apps/web`)                   |
| [`backend.md`](./backend.md)                                                 | Бекенд tech-debt (`apps/server` + migrations)     |
| [`mobile.md`](./mobile.md)                                                   | Mobile (`apps/mobile` Expo + `apps/mobile-shell`) |
| [`tech-debt-assessment-2026-07-01.md`](./tech-debt-assessment-2026-07-01.md) | Актуальний burndown / assessment                  |

## Архів

Закриті плани й історичні оцінки — [`archive/`](./archive/) (Batch 2026-07-20, 90-day gate skipped):

| Документ                                                                           | Опис                                 |
| ---------------------------------------------------------------------------------- | ------------------------------------ |
| [`priority-1-executive.md`](archive/priority-1-executive.md)                       | Зведення P1-спринту (критичний борг) |
| [`syncV2-engineering-ticket.md`](archive/syncV2-engineering-ticket.md)             | Тікет: поділ `syncV2.ts`             |
| [`syncV2-refactor-plan.md`](archive/syncV2-refactor-plan.md)                       | План рефакторингу Stage 2            |
| [`syncV2-refactor-execution.md`](archive/syncV2-refactor-execution.md)             | Звіт виконання рефакторингу          |
| [`technical-assessment-2026-06-05.md`](archive/technical-assessment-2026-06-05.md) | Історичний аудит 2026-06-05          |

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
| `external-infra` | Потрібна провізія в зовнішньому сервісі (Apple/Google/Sentry/Railway).     | Створити ресурс / виставити секрет поза репо.                    |
| `dep-blocked`    | Чекає на оновлення залежності чи платформи.                                | Бамп блокуючої залежності (напр. Expo SDK).                      |
| `owner-decision` | Потребує архітектурного рішення власника (не механічний фікс).             | Рішення `@Skords-01` (allowlist vs міграція, тригер ініціативи). |

**Знайти всі не-готові таски одразу:**

```bash
grep -rn "Blocked-reason" docs/90-work/tech-debt/
```

Усе, що НЕ потрапило у цей grep, вважається actionable.
