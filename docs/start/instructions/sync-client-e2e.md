# Sync client E2E — ручна інструкція для gate першої фази

> **Status:** Active
> **Runtime-specific:** yes
> **Last touched:** 2026-09-06 by Codex. **Next review:** 2027-03-06.
> Ручний прогін синхронізації між пристроями після злиття PR-1…PR-4 ([`sync-client-wiring-playbook.md`](../../work/specs/planning/sync-client-wiring-playbook.md) §4.5, §8).

## Передумови

- Локально: `pnpm dev:db`, `pnpm dev:server`, `pnpm dev:web`
- Два авторизовані профілі **або** web + емулятор Expo з одним тестовим користувачем
- Тестовий користувач із Better Auth; demo-seed не ставить sync-операції в чергу

## A. Web ↔ Web: виконання звички

1. **Профіль A** (Chrome): увійди → Routine → познач звичку виконаною сьогодні.
2. У DevTools → Network дочекайся `POST /api/v2/sync/push` → **200**.
3. **Профіль B** (інкогніто або другий профіль): увійди тим самим користувачем → Routine.
4. Дочекайся `GET /api/v2/sync/pull` під час старту або в межах 60 секунд; за потреби зроби повне перезавантаження.
5. **Успіх:** виконання видно в heatmap або календарі профілю B.

## B. Web → Mobile: ручна витрата Finyk

1. **Web:** Finyk → додай ручну витрату «Sync E2E test».
2. Переконайся, що push на web повернув 200.
3. **Mobile:** переведи застосунок на передній план, щоб `AppState active` запустив pull.
4. **Успіх:** витрата зʼявилася в мобільному списку.

## B2. Друга фаза: синхронізація визначення звички

1. **Профіль A:** Routine → створи звичку «Phase 2 sync test».
2. Переконайся, що push повернув 200.
3. **Профіль B** або мобільний застосунок на передньому плані: дочекайся pull у межах 60 секунд.
4. **Успіх:** звичку видно у списку.

Handoff: [`sync-client-wiring-phase2-handoff.md`](https://github.com/Skords-01/Sergeant/blob/d068c73a2f21881d5c1305544fe99f3ea8be81f4/docs/90-work/planning/archive/sync-client-wiring-phase2-handoff.md) §3.

## C. Приглушення echo

1. У профілі A виконай mutation і дочекайся успішного push.
2. У тому самому профілі дочекайся наступного pull.
3. **Успіх:** UI не застосовує зміну двічі й не блимає; у SQLite немає дубльованих рядків.

## D. Регресія demo-режиму (R5)

1. В інкогніто відкрий demo entry URL і переконайся, що звички відобразилися.
2. Зроби повне перезавантаження.
3. **Успіх:** звички лишилися видимими, у консолі немає помилок запуску sync engine.

## Розбір невдалого прогону

| Симптом                         | Що перевірити                                                                     |
| ------------------------------- | --------------------------------------------------------------------------------- |
| Push не запускається            | `bootSyncEngineWriter` у `main.tsx`; користувач увійшов; є рядки `sync_op_outbox` |
| Push повертає 401               | Session cookie та авторизація на API                                              |
| Pull порожній, push успішний    | `X-Origin-Device-Id` на обох клієнтах; на сервері `sync_op_log.status=applied`    |
| Pull застосовано, UI застарілий | Модульний `notify*CacheRefresh` або routine `emitRoutineStorage`                  |
| Зламаний лише Mobile            | PR-4 злитий; `bootSyncEngineReader` викликається в `_layout.tsx`                  |

## Автоматизований smoke у CI

```bash
pnpm --filter @sergeant/web exec vitest run src/core/syncEngine/syncRoundTrip.test.ts
pnpm --filter @sergeant/server test:integration -- syncV2
```

## Related

- [`sync-client-wiring.md`](../../work/specs/planning/sync-client-wiring.md)
- [`sync-client-wiring-playbook.md`](../../work/specs/planning/sync-client-wiring-playbook.md)
