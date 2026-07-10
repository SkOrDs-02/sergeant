# Технічний борг

> **Last validated:** 2026-07-10 by @cursoragent (mobile TS 6 align; openclaw paths). **Next review:** 2026-10-08.
> **Status:** Active

Living-реєстри технічного боргу.

| Документ                                                                     | Опис                                                                                      |
| ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| [`frontend.md`](./frontend.md)                                               | Фронтенд tech-debt (`apps/web`)                                                           |
| [`backend.md`](./backend.md)                                                 | Бекенд tech-debt (`apps/server` + migrations)                                             |
| [`mobile.md`](./mobile.md)                                                   | Mobile tech-debt (`apps/mobile` Expo + `apps/mobile-shell` Capacitor)                     |
| [`priority-1-executive.md`](./priority-1-executive.md)                       | Зведення P1-спринту (критичний борг): статус виконання та відповідальні                   |
| [`syncV2-engineering-ticket.md`](./syncV2-engineering-ticket.md)             | Інженерний тікет: аналіз та план поділу `syncV2.ts` на модулі                             |
| [`syncV2-refactor-plan.md`](./syncV2-refactor-plan.md)                       | План рефакторингу `syncV2.ts` — Stage 2: витягання apply-функцій                          |
| [`syncV2-refactor-execution.md`](./syncV2-refactor-execution.md)             | Виконання рефакторингу `syncV2.ts` (авто-генерований звіт прогресу)                       |
| [`technical-assessment-2026-06-05.md`](./technical-assessment-2026-06-05.md) | Технічний аудит монорепо 2026-06-05: 8 підагентів, повний обсяг (4 аплікації, 12 пакетів) |

Кожен файл має CI freshness-gate ([`scripts/check-tech-debt-freshness.mjs`](../../../scripts/check-tech-debt-freshness.mjs))
з порогом 60 днів. Маркер `> **Оновлено YYYY-MM-DD.**` у заголовку
треба вручну оновлювати при кожному audit-passе (touch без зміни маркера
лічильник не скидає — це не час файлу, а явна декларація).

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
