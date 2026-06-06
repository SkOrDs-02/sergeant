# ADR-0063: syncV2.ts модульний рефакторинг

- **Status:** accepted
- **Date:** 2026-06-05
- **Supersedes:** —

## Context

syncV2.ts важить 2 912 рядки (4.9× межа Hard Rule #18 за 600 рядків). Це критичний файл:

- містить apply-логіку для 22 таблиць (routine, fizruk, nutrition, finyk)
- має ~0% покриття тестами
- 8 ESLint suppressions (`eslint-disable no-restricted-syntax`) для SQL-вставок

Технічний борг нарастає: кожен новий модуль додає apply-функцію в цей файл.

## Decision

Розділити syncV2.ts на модулярну структуру:

```
apps/server/src/modules/sync/
├── syncV2.ts (handlers: syncV2Push, syncV2Pull, ~300 рядків)
├── syncV2-types.ts (типи + константи + реєстр таблиць, ~300 рядків)
├── syncV2-core.ts (shared helpers: parseOptionalDate, toJsonbParam, ~150 рядків)
├── routine/
│   └── applySync.ts (applyRoutineEntries, applyRoutineStreaks)
├── fizruk/
│   └── applySync.ts (5 функцій)
├── nutrition/
│   └── applySync.ts (5 функцій)
└── finyk/
    └── applySync.ts (14 функцій)
```

**Ключові правила:**

1. OP_LOG_TABLE_REGISTRY залишається в syncV2-types.ts, але посилається на apply-функції з модулів
2. Shared helpers винесені в syncV2-core.ts
3. Кожен модуль відповідає за свою apply-логіку
4. Тести обов'язкові для кожної apply-функції

## Consequences

### Позитивні

- Жоден файл не перевищує 600 рядків
- Легший доступ до модуля-специфічної логіки
- Можливість тестувати окремі модуля
- Легше розширювати новими таблицями

### Від'їднені

- Наразі треба 3-5 днів на рефакторинг
- Тимчасова регресія під час міграції
- Потрібні нові тести (0% → 80%+ для syncV2)

## Implementation Plan

1. **Stage 1:** syncV2-types.ts (типи + константи) — **DONE** (файл створений)
2. **Stage 2:** syncV2-core.ts (shared helpers)
3. **Stage 3:** routine/applySync.ts (виділити applyRoutine\*)
4. **Stage 4:** fizruk/applySync.ts (виділити 5 applyFizruk\*)
5. **Stage 5:** nutrition/applySync.ts (виділити 5 applyNutrition\*)
6. **Stage 6:** finyk/applySync.ts (виділити 14 applyFinyk\*)
7. **Stage 7:** syncV2.ts (handlers + registry)
8. **Stage 8:** syncV2.test.ts (написати тести)

## References

- Hard Rule #18: Module-size discipline
- Security-audit відмінності: SQL-інтерполяція в syncV2.ts
- Test Coverage ризик: 11 серверних файлів >600 рядків
