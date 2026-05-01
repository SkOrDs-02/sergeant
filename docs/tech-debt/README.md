# Технічний борг

> **Last validated:** 2026-05-01 by @devin-ai-integration[bot]. **Next review:** 2026-07-30.
> **Status:** Active

Living-реєстри технічного боргу.

| Документ                       | Опис                                                                  |
| ------------------------------ | --------------------------------------------------------------------- |
| [`frontend.md`](./frontend.md) | Фронтенд tech-debt (`apps/web`)                                       |
| [`backend.md`](./backend.md)   | Бекенд tech-debt (`apps/server` + migrations)                         |
| [`mobile.md`](./mobile.md)     | Mobile tech-debt (`apps/mobile` Expo + `apps/mobile-shell` Capacitor) |

Кожен файл має CI freshness-gate ([`scripts/check-tech-debt-freshness.mjs`](../../scripts/check-tech-debt-freshness.mjs))
з порогом 60 днів. Маркер `> **Оновлено YYYY-MM-DD.**` у заголовку
треба вручну оновлювати при кожному audit-passе (touch без зміни маркера
лічильник не скидає — це не час файлу, а явна декларація).
