import { IMPORT_BATCH_STATUSES } from "@sergeant/shared";
import type { ImportBatchStatus } from "@sergeant/shared";

/**
 * DB-row → wire-shape серіалізатор для `import_batches` (Hard Rule #1).
 *
 * `pg` повертає `id BIGSERIAL` як **рядок** — `db.ts#installInt8Parser()`
 * коерсить int8 глобально на рівні pg-драйвера, але серіалізатор лишається
 * другим рубежем (Hard Rule #1 вимагає явну коерсію САМЕ тут, незалежно
 * від driver-рівня — той самий подвійний-рубіж підхід, що
 * `receipts/serialize.ts`). `rows_total`/`rows_created`/`rows_linked`/
 * `rows_skipped` — `INTEGER` (int4), НЕ bigint — `pg` повертає їх уже як
 * `number` нативно, коерсія не потрібна (на відміну від `id`).
 */

export interface ImportBatchRow {
  id: unknown;
  user_id: string;
  source: string;
  status: string;
  rows_total: number;
  rows_created: number;
  rows_linked: number;
  rows_skipped: number;
  created_row_ids: unknown;
  created_at: Date | string;
  updated_at: Date | string;
}

export interface SerializedImportBatch {
  id: number;
  source: string;
  status: ImportBatchStatus;
  rowsTotal: number;
  rowsCreated: number;
  rowsLinked: number;
  rowsSkipped: number;
  createdRowIds: string[];
  createdAt: string;
  updatedAt: string;
}

/**
 * Коерсить довільне DB bigint-поле (рядок, або вже `number`, якщо
 * driver-парсер випередив) у `number`. Кидає, а не тихо повертає `0`/`NaN`
 * — bigint-поле, що не коерситься, це driver-аномалія (issue #708 у Hard
 * Rule #1), fail loud, не fail silent (той самий підхід, що
 * `receipts/serialize.ts#toNumberOrThrow`).
 */
function toNumberOrThrow(v: unknown, field: string): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) {
    throw new Error(
      `serializeImportBatch: не вдалось коерсити поле "${field}" (${String(v)}) у number`,
    );
  }
  return n;
}

function isoOf(v: Date | string): string {
  return v instanceof Date ? v.toISOString() : new Date(v).toISOString();
}

/**
 * `created_row_ids` — JSONB-масив (auto-parsed `pg`-драйвером, на відміну
 * від bigint-колонок), CHECK-обмежений на рівні БД (`jsonb_typeof(...) =
 * 'array'`, міграція 122). Елементи фільтруються до `string` захисно — у
 * цьому slice туди пишуться ЛИШЕ `finyk_manual_expenses.id` (TEXT), але
 * серіалізатор не довіряє формі стовпця мовчки (той самий "не довіряй
 * driver-рівню" принцип, що coerce вище).
 */
function toStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === "string");
}

function toStatus(v: string): ImportBatchStatus {
  // Словник — код домену (міграція 122 коментар: "словник живе в коді
  // домену", БЕЗ DB CHECK). Невідоме значення — driver/дані-аномалія;
  // fail loud за тим самим принципом, що bigint-коерсія вище, а не тихий
  // фолбек на 'completed', який приховав би биті дані від API-споживача.
  // Перевірка — від спільного IMPORT_BATCH_STATUSES (ревʼю PR #818):
  // хардкод-літерали тут дрейфували б від словника схеми мовчки.
  if ((IMPORT_BATCH_STATUSES as readonly string[]).includes(v)) {
    return v as ImportBatchStatus;
  }
  throw new Error(`serializeImportBatch: невідомий status "${v}"`);
}

export function serializeImportBatch(
  row: ImportBatchRow,
): SerializedImportBatch {
  return {
    id: toNumberOrThrow(row.id, "id"),
    source: row.source,
    status: toStatus(row.status),
    rowsTotal: row.rows_total,
    rowsCreated: row.rows_created,
    rowsLinked: row.rows_linked,
    rowsSkipped: row.rows_skipped,
    createdRowIds: toStringArray(row.created_row_ids),
    createdAt: isoOf(row.created_at),
    updatedAt: isoOf(row.updated_at),
  };
}
