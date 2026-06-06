# Priority 1 — Критичний спринт (ВИКОНАНО ЧАСТИНОВО)

> **Last validated:** 2026-06-06 by @Skords-01. **Next review:** 2026-09-06.
> **Status:** Active

## Статус виконання

| #   | Дія                                                                   | Відповідальний | Статус                | Примітка                                                                                                                                |
| --- | --------------------------------------------------------------------- | -------------- | --------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Розділити syncV2.ts на модулі ≤600 рядків, додати покриття тестами    | Backend        | **В процесі**         | Stage 1: syncV2-types.ts створено (82 рядки). Потрібні ще: syncV2-core.ts, модулі apply, syncV2-handler.ts. Орієнтовний час — 3-5 днів. |
| 2   | Підняти пороги покриття вебу до рядків 50%, гілок 40% (проміжна ціль) | Frontend       | **Очікує планування** | Потрібно проаналізувати uncovered surfaces в idb, shared-lib-ui.                                                                        |
| 3   | Перезібрати базовий образ distroless до спливу CVE 2026-07-02         | DevOps         | **Очікує виконання**  | CVE в .trivyignore спливають 2026-07-02.                                                                                                |

## Артефакти створені для syncV2 рефакторингу

1. **syncV2-types.ts** (`apps/server/src/modules/sync/syncV2-types.ts`) — 82 рядки, типи та константи витягнуті
2. **ADR-0063** (`docs/adr/0063-syncv2-modular-refactor.md`) — архітектурне рішення
3. **Plan** (`docs/tech-debt/syncV2-refactor-plan.md`) — детальний план рефакторингу
4. **Ticket** (`docs/tech-debt/syncV2-engineering-ticket.md`) — технічний тікет

## Наступні кроки (Backend-інженер запускає):

```bash
# Перехід у робочу гілку
git checkout refactor/syncV2-split-modules

# Stage 2: shared helpers (parseOptionalDate, toJsonbParam, тощо)
# Stage 3-6: Per-module apply-функції
# Stage 7: handlers (syncV2Push + syncV2Pull)
# Stage 8: тести
```

## Методологія рефакторингу

1. **TDD перед змінами:** залучити сутність syncV2.test.ts
2. **Поступовий podsil:** кожна apply-функція в модулі
3. **Registry update:** OP_LOG_TABLE_REGISTRY імпортує функції з модулів
4. **Фінальний tearDown:** удалити syncV2.ts, залишити лише импорти
