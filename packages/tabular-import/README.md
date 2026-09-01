# @sergeant/tabular-import

> **Last touched:** 2026-09-01 by @claude. **Next review:** 2026-12-01.
> **Status:** Active

Спільний шар читання табличних файлів — pure TypeScript, без React і без DOM. Виріс із дублікатів у імпортерах finyk (виписки банків) та fizruk (експорти трекерів) і винесений окремим пакетом у [#1001](https://github.com/SkOrDs-02/sergeant/pull/1001).

## Що всередині

- **`csvParser`** — розбір CSV з автовизначенням роздільника та лапок.
- **`xlsxGrid`** — читання `.xlsx` у прямокутну сітку рядків (через `zipReader`).
- **`htmlTableGrid`** — витяг `<table>` з HTML-експортів у ту саму сітку.
- **`tabularFile`** — фасад: визначає формат за вмістом/розширенням і віддає уніфіковану сітку.
- **`zipReader`** — мінімальний ZIP-читач для `.xlsx` без зовнішніх залежностей.
- **`__fixtures__/makeXlsx`** — генератор тестових `.xlsx` (експортується для тестів консумерів).

## Використання

```ts
import { gridFromTabularFile, tokenizeCsv } from "@sergeant/tabular-import";
```

Консумери: `apps/server/src/modules/finyk/import/*` (виписки), імпорт зовнішніх трекерів fizruk ([спека](../../docs/90-work/planning/specs/import-external-trackers.md)).

## Тести

```bash
pnpm --filter @sergeant/tabular-import test       # Vitest
pnpm --filter @sergeant/tabular-import typecheck
```
