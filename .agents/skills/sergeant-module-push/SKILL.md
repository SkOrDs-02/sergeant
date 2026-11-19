---
name: sergeant-module-push
description: "Use when the task touches push notifications — web push, APNs, FCM, notification fan-out, push audit; UA: задача про push/сповіщення/APNs/FCM."
lang: uk
lang-reason: "Body is Ukrainian per Hard Rule #15 (internal docs in Ukrainian); the `description:` carries an EN trigger phrase plus the `; UA:` clause so tool-routing stays stable across LLM providers whose attention biases toward English. See `sergeant-writing-skills` § Грамар."
---

# Push — власник інфра-модуля

Інфра-модуль без продуктового канону: контекст і журнал рішень живуть прямо тут (рішення 6 [спеки agent-module-owners](https://github.com/Skords-01/Sergeant/blob/d1a37e0bed4e403477376eae9ee9a078e4179da8/docs/90-work/planning/specs/archive/agent-module-owners.md), архів старого репо). Роутинг двовимірний: технічні правила поверхні бере surface-скіл.

## Контекст

- Server-driven fan-out на три канали: web push + APNs + FCM ([ADR-0019](../../../docs/governance/adr/0019-push-notifications.md)).
- APNs — окрема provider-бібліотека ([ADR-0048](../../../docs/governance/adr/0048-apns-provider-library.md)).
- Аудит доставки — `audit.ts` поруч із `push.ts` (integration-тести в тій самій теці).

## Мапа файлів

- Server: `apps/server/src/modules/push/`.
- Web-клієнт: RQ-ключі `pushKeys` з `apps/web/src/shared/lib/api/queryKeys.ts` (Hard Rule #2).

## Інваріанти модуля

- Fan-out ініціює сервер; клієнт лише реєструє підписку — не додавай client-side розсилок.
- Невалідна/протухла підписка — очікуваний кейс: деактивація, не exception у основному потоці.
- Тексти сповіщень — українською, за tone-of-voice `docs/product/copy/style-guide.uk.md`.
- Нагадування модулів ідуть через стандартизовані Hub-механізми ([ADR-0067](../../../docs/governance/adr/0067-engagement-mechanism-standardization.md)), push — транспорт, не власник розкладу.

## Журнал рішень

| Дата       | Рішення                                              | Джерело/ADR                                                            |
| ---------- | ----------------------------------------------------- | ---------------------------------------------------------------------- |
| 2026-11-18 | Тихі години налаштовувані й вимикаються: тумблер і межі з точністю до хвилини (`user_preferences.quiet_hours_*`, дефолт увімкнено 22:00-08:00, міграція 168), у поясі пристрою, а не за Києвом. Гейтять, як і раніше, лише час, який обирає продукт (нудж 09:00 переходить на кінець тихих годин, компромісний час), і глушать push про операцію Monobank зовсім, без ранкового зведення і беззвучної доставки; у Monobank окремий тумблер `push_mono_transactions` (дефолт увімкнено, поза стелею). Час нагадувань (звички, тренування, їжа) і доба відміток рахуються в поясі пристрою (`user_preferences.time_zone`, IANA, LWW з клієнта; невідомий = Europe/Kyiv) і на сервері (`apps/server/src/lib/reminders/userClock.ts`), і в таймері відкритої вкладки (`useModuleReminder`) | `docs/work/specs/notifications-quiet-hours-and-device-time.md`; П-22 (А), П-23 (А), Б-1 (А), Б-2 (А) у § 11.9 `docs/work/research/2026-11-17-modules-teardown-vs-leaders.md` |
| 2026-09-27 | Нагадування звичок, тренувань, їжі й нудж Сержанта йдуть одним шаром зі спільною стелею на київську добу (`user_preferences.push_daily_cap`, 0-4, дефолт 2, міграція 148). Приводи понад стелю згортаються в одне сповіщення в компромісний час (`apps/server/src/lib/reminders/budget.ts`), слоти бюджету стовпляться в `push_reminder_log` як `push-budget-<день>-<k>`. Тихі години гейтять лише час, який обирає продукт (нудж, компроміс); час, поставлений людиною, лишається її. Новачок без підписки отримує запрошення увімкнути сповіщення в листах дня 1 і 3 | `docs/work/specs/reward-loop-and-reminders.md` |
| 2026-09-23 | Legacy `POST`/`DELETE /api/push/subscribe` видалено без метрики нульових викликів: `push_deprecation` логувався лише в pino і не доходив до Sentry, тож умову виміряти було неможливо | `docs/work/specs/tech-debt/backend.md` § «Legacy web-push HTTP» |
| 2026-05-06 | APNs — через окрему provider-бібліотеку (Proposed)   | [ADR-0048](../../../docs/governance/adr/0048-apns-provider-library.md) |
| 2026-04-27 | Push — server-driven fan-out на web + APNs + FCM     | [ADR-0019](../../../docs/governance/adr/0019-push-notifications.md) |

## Роутинг далі

- Технічні правила поверхні: `sergeant-server-api`; мобільні канали — `sergeant-mobile-expo`.
- Каталог: [docs/start/agents/agent-skills-catalog.md](../../../docs/start/agents/agent-skills-catalog.md).
