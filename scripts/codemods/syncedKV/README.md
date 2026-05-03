# `syncedKV` codemod

> **Last validated:** 2026-05-03 by @Skords-01 / Devin. **Next review:** 2026-08-01.
> **Status:** Active

PR #008 (`refactor(web): replace localStorage.setItem monkey-patch with explicit useSyncedKVStore`) видалив monkey-patch на `localStorage.setItem` і ввів пару `syncedKV` / `safeWriteSyncedLS` як explicit-обгортку поверх `webKVStore`. До PR #008 будь-який `safeWriteLS(STORAGE_KEYS.X, …)` із sync-tracked ключем X тихо тригерив `enqueueChange(X)` через monkey-patch; після PR #008 той самий call-site нічого не enqueueить, бо `safeWriteLS` пише напряму в `localStorage`. Codemod перетворює всі такі call-sites у `safeWriteSyncedLS(…)`.

## Запуск

```bash
node scripts/codemods/syncedKV/script.mjs            # dry-run + список файлів
node scripts/codemods/syncedKV/script.mjs --write    # застосувати in-place
```

Скрипт ходить по `apps/web/src/**/*.{ts,tsx}` (без `__tests__/` і `*.test.*`/`*.spec.*`), знаходить `safeWriteLS(KEY, …)` де `KEY` — `STORAGE_KEYS.<NAME>` або стрингова літерала, що збігається зі sync-tracked ключем у `SYNC_MODULES` (`packages/shared/src/sync/modules.ts`). Імпорт `safeWriteSyncedLS` додається автоматично.

## Idempotency

Повторний запуск — no-op: після першого `--write` немає більше `safeWriteLS(<tracked>, …)`, і dry-run виведе `would rewrite 0 call(s)` з exit code 0.

## Long-term enforcement

Без перезапуску, через 6 місяців хтось може ввести новий sync-tracked write через `safeWriteLS`. Тому:

1. **CI drift-check.** Запуск у dry-run mode (без `--write`) повертає exit code 1 якщо знайдено хоч один call-site, що потребує переписування. Підключіть у `.github/workflows/*.yml` як швидкий лінт-крок (5–10 секунд).
2. **ESLint guard (TODO PR #013).** Більш точний guard через AST-rule, який блокує `safeWriteLS` для будь-якого `STORAGE_KEYS.<TRACKED_NAME>`. До поки не реалізовано — codemod-as-CI-check тримає лінію.

## Запущено

- 2026-05-03 — мануально (5 call-sites, окремий PR #008). Codemod залишається тут для майбутніх sync-tracked ключів.
