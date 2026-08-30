---
name: sergeant-module-push
description: Use when the task touches push notifications — web push, APNs, FCM, notification fan-out, push audit; UA: задача про push/сповіщення/APNs/FCM.
lang: uk
lang-reason: Body is Ukrainian per Hard Rule #15 (internal docs in Ukrainian); the `description:` carries an EN trigger phrase plus the `; UA:` clause so tool-routing stays stable across LLM providers whose attention biases toward English. See `sergeant-writing-skills` § Грамар.
---

# Push — власник інфра-модуля

Інфра-модуль без продуктового канону: контекст і журнал рішень живуть прямо тут (рішення 6 спеки `docs/90-work/planning/specs/agent-module-owners.md`). Роутинг двовимірний: технічні правила поверхні бере surface-скіл.

## Контекст

- Server-driven fan-out на три канали: web push + APNs + FCM ([ADR-0019](../../../docs/04-governance/adr/0019-push-notifications.md)).
- APNs — окрема provider-бібліотека ([ADR-0048](../../../docs/04-governance/adr/0048-apns-provider-library.md)).
- Аудит доставки — `audit.ts` поруч із `push.ts` (integration-тести в тій самій теці).

## Мапа файлів

- Server: `apps/server/src/modules/push/`.
- Web-клієнт: RQ-ключі `pushKeys` з `apps/web/src/shared/lib/api/queryKeys.ts` (Hard Rule #2).

## Інваріанти модуля

- Fan-out ініціює сервер; клієнт лише реєструє підписку — не додавай client-side розсилок.
- Невалідна/протухла підписка — очікуваний кейс: деактивація, не exception у основному потоці.
- Тексти сповіщень — українською, за tone-of-voice `docs/01-product/copy/style-guide.uk.md`.
- Нагадування модулів ідуть через стандартизовані Hub-механізми ([ADR-0067](../../../docs/04-governance/adr/0067-engagement-mechanism-standardization.md)), push — транспорт, не власник розкладу.

## Журнал рішень

| Дата       | Рішення                                              | Джерело/ADR                                                            |
| ---------- | ----------------------------------------------------- | ---------------------------------------------------------------------- |
| 2026-05-06 | APNs — через окрему provider-бібліотеку (Proposed)   | [ADR-0048](../../../docs/04-governance/adr/0048-apns-provider-library.md) |
| 2026-04-27 | Push — server-driven fan-out на web + APNs + FCM     | [ADR-0019](../../../docs/04-governance/adr/0019-push-notifications.md) |

## Роутинг далі

- Технічні правила поверхні: `sergeant-server-api`; мобільні канали — `sergeant-mobile-expo`.
- Каталог: [docs/00-start/agents/agent-skills-catalog.md](../../../docs/00-start/agents/agent-skills-catalog.md).
