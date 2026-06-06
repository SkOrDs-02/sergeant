# Технічний тікет: syncV2.ts — поділ на модулі

> **Last validated:** 2026-06-06 by @Skords-01. **Next review:** 2026-09-06.
> **Status:** Active

## Інженерія

**Аналіз структури:**
- syncV2.ts = 2 912 рядків
- Apply-функції: 30 функцій, розділених за модулями
- Handlers: syncV2Push (~310 рядків), syncV2Pull (~104 рядки)
- Shared helpers: parseOptionalDate, toJsonbParam и др. (~150 рядків)

## Кроки рефакторингу

### Stage 1 ✅ Готово
- [x] syncV2-types.ts створено (типи + константи + реєстр)

### Stage 2: Shared helpers
- [ ] Виділити parseOptionalDate, parseRequiredDate
- [ ] Виділити toNonNegativeInt, parseOptionalNumber
- [ ] Виділити toJsonbParam
- [ ] Створити syncV2-core.ts

### Stage 3-6: Per-module apply
- [ ] routine/applySync.ts (applyRoutineEntries + applyRoutineStreaks)
- [ ] fizruk/applySync.ts (5 функцій)
- [ ] nutrition/applySync.ts (5 функцій)  
- [ ] finyk/applySync.ts (14 функцій)

### Stage 7: Handlers
- [ ] syncV2.ts → лише syncV2Push + syncV2Pull + registry
- [ ] Імпорт apply-функцій з модулів

### Stage 8: Тести
- [ ] syncV2.test.ts — реалізувати тести
- [ ] Мокати pool, тестувати edge cases
- [ ] Покриття → 80%+

## Орієнтовний час

| Етап | Час | Відповідальний |
|------|-----|----------------|
| 1 | ✅ Готово | Kilo |
| 2 | 0.5 дні | Backend |
| 3-6 | 2 дні | Backend |
| 7 | 0.5 дні | Backend |
| 8 | 1-2 дні | Backend/QA |

**Total: 3-5 днів**

## Ризики

1. **SQL-інтерполяція:** Підтримується allowlist, але треба переконатись у продовженні
2. **Тести:** Наразі 0% — потрібні regression-тести перед рефакторингом
3. **Backfill:** Створити backup гілку перед стартом
