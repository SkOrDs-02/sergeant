# Технічний тікет: syncV2.ts — поділ на модулі

> **Last validated:** 2026-06-07 by @Skords-01. **Next review:** 2026-09-07.
> **Status:** Archived

> **Closeout 2026-06-07.** Рефакторинг повністю завершено — тікет більше не actionable.
> Реальний стан коду (звірено в `apps/server/src/modules/sync/`):
> `syncV2.ts` = **474 рядки** (було 2 912 / 3 096), `syncV2-core.ts` (~241),
> `syncV2Types.ts` (~55); 24 apply-функції винесено в 4 per-domain файли
> (`routine/applySync.ts`, `fizruk/applySync.ts`, `nutrition/applySync.ts`,
> `finyk/applySync.ts`). Тести існують: `syncV2.test.ts`,
> `syncV2.integration.test.ts` (Testcontainers), `syncV2Stream.*.test.ts`.
> Незалежне підтвердження: [`technical-assessment-2026-06-05.md`](./technical-assessment-2026-06-05.md)
> (рядок «**ВИПРАВЛЕНО:** Розбито на модулі»). Деталі стейджів — у
> [`syncV2-refactor-plan.md`](./syncV2-refactor-plan.md). Чекбокси нижче лишено
> для історичного запису.

## Інженерія

**Аналіз структури (на момент відкриття тікета — історичний):**

- syncV2.ts = 2 912 рядків
- Apply-функції: 30 функцій, розділених за модулями
- Handlers: syncV2Push (~310 рядків), syncV2Pull (~104 рядки)
- Shared helpers: parseOptionalDate, toJsonbParam и др. (~150 рядків)

## Кроки рефакторингу

### Stage 1 ✅ Готово

- [x] syncV2-types.ts створено (типи + константи + реєстр)

### Stage 2: Shared helpers ✅ Готово

- [x] Виділити parseOptionalDate, parseRequiredDate
- [x] Виділити toNonNegativeInt, parseOptionalNumber
- [x] Виділити toJsonbParam
- [x] Створити syncV2-core.ts

### Stage 3-6: Per-module apply ✅ Готово

- [x] routine/applySync.ts (applyRoutineEntries + applyRoutineStreaks)
- [x] fizruk/applySync.ts (5 функцій)
- [x] nutrition/applySync.ts (5 функцій)
- [x] finyk/applySync.ts (14 функцій)

### Stage 7: Handlers ✅ Готово

- [x] syncV2.ts → лише syncV2Push + syncV2Pull + registry
- [x] Імпорт apply-функцій з модулів

### Stage 8: Тести ✅ Готово

- [x] syncV2.test.ts — реалізувати тести
- [x] Мокати pool, тестувати edge cases
- [x] Покриття → 80%+

## Орієнтовний час

| Етап | Час       | Відповідальний |
| ---- | --------- | -------------- |
| 1    | ✅ Готово | Kilo           |
| 2    | 0.5 дні   | Backend        |
| 3-6  | 2 дні     | Backend        |
| 7    | 0.5 дні   | Backend        |
| 8    | 1-2 дні   | Backend/QA     |

**Total: 3-5 днів**

## Ризики

1. **SQL-інтерполяція:** Підтримується allowlist, але треба переконатись у продовженні
2. **Тести:** Наразі 0% — потрібні regression-тести перед рефакторингом
3. **Backfill:** Створити backup гілку перед стартом
