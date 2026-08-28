/**
 * Last validated: 2026-08-28
 * Status: Active
 *
 * Побудова `sync_op_log`-опів для рядків, які створює/тонить імпорт
 * (`commit.ts`, `batches.ts` undo). Сам запис — `modules/sync/serverOpLog.ts`;
 * тут лише форма опа й ключі ідемпотентності, спільні для обох шляхів.
 *
 * **Форма `row`.** Клієнтський `applyPullOp` для blob-таблиць мапить
 * ключі payload-у на КОЛОНКИ таблиці один-до-одного
 * (`applyGenericRegistryRow`), тож віддаємо рівно `id`, `user_id`,
 * `data_json`, `created_at`, `updated_at`, `deleted_at` — те саме, що
 * пише клієнтський dual-write (`sqliteWriter/specs.ts` § blob-tables).
 *
 * **Ключі.** `idempotency_key` має бути ≤64 символів (конвенція
 * API-шару, міграція 027), а `finyk_manual_expenses.id` — це вже
 * 69-символьний `imp1:<sha256>`. Тому ключ несе не сам id, а його
 * стабільне 128-бітне скорочення; `batchId` у префіксі розводить
 * insert-оп повторного імпорту від insert-опа першого (кожен commit —
 * власний батч), а undo того самого батчу двічі дає той самий
 * delete-ключ і другий раз no-op-иться.
 */
import { createHash } from "node:crypto";
import type { ServerSyncOp } from "../../sync/serverOpLog.js";

export const MANUAL_EXPENSES_TABLE = "finyk_manual_expenses";

function shortRowKey(rowId: string): string {
  return createHash("sha256").update(rowId).digest("hex").slice(0, 32);
}

export function importInsertOpKey(batchId: number, rowId: string): string {
  return `srvimp:${batchId}:${shortRowKey(rowId)}`;
}

export function importDeleteOpKey(batchId: number, rowId: string): string {
  return `srvimpdel:${batchId}:${shortRowKey(rowId)}`;
}

export interface ManualExpenseOpRow {
  id: string;
  dataJson: unknown;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Оп «рядок існує ось у такому вигляді». `clientTs` — `updated_at`
 * САМОГО рядка (не час запиту): так серверна репліка не перекриє
 * свіжішу локальну правку, а LWW на клієнті лишається чесним.
 */
export function buildManualExpenseInsertOp(
  batchId: number,
  userId: string,
  row: ManualExpenseOpRow,
): ServerSyncOp {
  return {
    idempotencyKey: importInsertOpKey(batchId, row.id),
    op: "insert",
    row: {
      id: row.id,
      user_id: userId,
      data_json: row.dataJson,
      created_at: row.createdAt.toISOString(),
      updated_at: row.updatedAt.toISOString(),
      deleted_at: null,
    },
    clientTs: row.updatedAt,
  };
}

/**
 * Оп «рядок видалено» для undo імпорту. Без нього undo прибирав рядки
 * лише на сервері й на пристрої, що натиснув кнопку: решта пристроїв
 * лишалась із фантомами (дзеркальна половина тієї самої дірки, що
 * робила створені рядки невидимими).
 */
export function buildManualExpenseDeleteOp(
  batchId: number,
  userId: string,
  rowId: string,
  deletedAt: Date,
): ServerSyncOp {
  return {
    idempotencyKey: importDeleteOpKey(batchId, rowId),
    op: "delete",
    row: {
      id: rowId,
      user_id: userId,
      deleted_at: deletedAt.toISOString(),
      updated_at: deletedAt.toISOString(),
    },
    clientTs: deletedAt,
  };
}
