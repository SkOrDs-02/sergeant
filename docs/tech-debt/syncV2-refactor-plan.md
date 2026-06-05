# syncV2.ts Refactoring Plan — Stage 2: Apply Functions Extraction

## Ціль 
Розділити 3096-рядковий файл на модулі ≤600 рядків.

## Виконано ✓

### Крок 1: syncV2-types.ts (завершено)
- APPLY_REJECT_REASONS, ENGINE_REJECT_REASONS
- ApplyRejectReason, EngineRejectReason, RejectReason типи
- AppliedStatus, ApplyFn типи

### Крок 2: syncV2-core.ts (завершено)
- readOriginDeviceId
- recordSyncV2
- parseOptionalDate, parseRequiredDate, parseOptionalNumber, parseOptionalInt, toNonNegativeInt, toJsonbParam

### Крок 3: Apply-функції per-модуль (завершено)

Структура модулів sync:
```
apps/server/src/modules/sync/
├── syncV2.ts (~475 рядків) ✓
├── syncV2-types.ts (~55 рідків) ✓
├── syncV2-core.ts (~241 рядок) ✓
├── routine/
│   └── applySync.ts (applyRoutineEntries, applyRoutineStreaks) ✓
├── fizruk/
│   └── applySync.ts (5 функцій) ✓
├── nutrition/
│   └── applySync.ts (5 функцій) ✓
└── finyk/
    └── applySync.ts (14 функцій) ✓
```

### Крок 4: Оновлено реєстри (завершено)
- OP_LOG_TABLE_REGISTRY імпортує з модулів
- INCREMENT_OP_SUPPORTED_TABLES, SYNC_V2_SUPPORTED_TABLES експортуються з syncV2.ts

## Наступні кроки
- [ ] Запустити тести для верифікації
- [ ] Оновити документацію