import type { Request, Response } from "express";
import pool from "../../../db.js";
import { NotFoundError, ValidationError } from "../../../obs/errors.js";
import {
  ImportBatchGetResponseSchema,
  ImportBatchUndoResponseSchema,
} from "@sergeant/shared";
import { serializeImportBatch } from "./serialize.js";
import type { ImportBatchRow } from "./serialize.js";
import { emitServerSyncOps } from "../../sync/serverOpLog.js";
import {
  MANUAL_EXPENSES_TABLE,
  buildManualExpenseDeleteOp,
} from "./syncOps.js";

type WithSessionUser = Request & { user?: { id: string } };

// Колонки `import_batches`, потрібні серіалізатору (`serialize.ts::
// ImportBatchRow`). Виписані буквально в КОЖНОМУ з трьох SQL нижче (а не
// через спільний template-interpolated constant) навмисно: `no-restricted-
// syntax` (docs/04-governance/security/hardening/M11-eslint-plugin-security.md)
// застерігає проти templated `query(...)` з `${...}` — інтерполяція тут
// була б статичною (не user input), але лишати її дешевше усунути, ніж
// пояснювати щоразу (той самий підхід, що `receipts/save.ts`).

function parseBatchId(req: Request): number {
  const idParam = req.params["id"];
  const batchId = Number(idParam);
  if (!idParam || !Number.isInteger(batchId) || batchId <= 0) {
    throw new ValidationError("Некоректний id батчу імпорту");
  }
  return batchId;
}

/**
 * GET /api/finyk/import/batches/:id — статус/підсумок батчу. Скоуп
 * `WHERE id = $1 AND user_id = $2` НАПРЯМУ в SELECT (не окрема
 * ownership-перевірка після fetch): чужий батч і неіснуючий id обидва
 * дають 404, не 403 — той самий підхід, що `receipts/get.ts` (не витікає,
 * чи id взагалі існує в іншого користувача).
 */
export async function getImportBatchHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const userId = (req as WithSessionUser).user!.id;
  const batchId = parseBatchId(req);

  const { rows } = await pool.query<ImportBatchRow>(
    `SELECT id, user_id, source, status, rows_total, rows_created,
            rows_linked, rows_skipped, created_row_ids, created_at, updated_at
       FROM import_batches
      WHERE id = $1 AND user_id = $2`,
    [batchId, userId],
  );
  const batchRow = rows[0];
  if (!batchRow) {
    throw new NotFoundError("Батч імпорту не знайдено");
  }

  res.status(200).json(
    ImportBatchGetResponseSchema.parse({
      batch: serializeImportBatch(batchRow),
    }),
  );
}

/**
 * DELETE /api/finyk/import/batches/:id — undo: tombstone кожного id з
 * `created_row_ids` у `finyk_manual_expenses` (`deleted_at`/`updated_at =
 * NOW()` — той самий "прямий SQL поза sync LWW" writer-патерн, що
 * `receipts/save.ts#insertManualExpenseForReceipt`; сервер-авторизовані
 * записи не консультуються з `applyFinykPerRowBlob`-конфліктною логікою),
 * потім `status = 'undone'`. `SELECT ... FOR UPDATE` на батчі — той самий
 * read-modify-write guard, що `me/profile.ts#removeMemoryBankEntry`: два
 * паралельні undo того самого батчу не мають гонитись за
 * `created_row_ids`.
 *
 * Ідемпотентний повторний виклик: SQL-умова `deleted_at IS NULL` у
 * tombstone-запиті сама no-op-ить другий виклик — `tombstoned: 0` на
 * повторному виклику (спостережуваність no-op без окремого статус-коду;
 * обидва виклики повертають 200).
 */
export async function deleteImportBatchHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const userId = (req as WithSessionUser).user!.id;
  const batchId = parseBatchId(req);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows: existingRows } = await client.query<ImportBatchRow>(
      `SELECT id, user_id, source, status, rows_total, rows_created,
              rows_linked, rows_skipped, created_row_ids, created_at, updated_at
         FROM import_batches
        WHERE id = $1 AND user_id = $2
        FOR UPDATE`,
      [batchId, userId],
    );
    const existing = existingRows[0];
    if (!existing) {
      throw new NotFoundError("Батч імпорту не знайдено");
    }

    const rowIds = serializeImportBatch(existing).createdRowIds;

    const tombstoneResult = await client.query<{
      id: string;
      deleted_at: Date;
    }>(
      `UPDATE finyk_manual_expenses
          SET deleted_at = NOW(), updated_at = NOW()
        WHERE user_id = $1 AND id = ANY($2::text[]) AND deleted_at IS NULL
      RETURNING id, deleted_at`,
      [userId, rowIds],
    );

    // Дзеркало емісії в `commit.ts`: undo мусить доїхати тим самим
    // pull-каналом, яким приїхало створення. Без цього рядок зникав би
    // лише на сервері й на пристрої, що натиснув кнопку, а решта
    // пристроїв лишалась із фантомом. `RETURNING` дає рівно ті рядки,
    // які цей виклик реально тонив, тож повторний (ідемпотентний) undo
    // не плодить опів.
    await emitServerSyncOps(
      client,
      userId,
      MANUAL_EXPENSES_TABLE,
      tombstoneResult.rows.map((r) =>
        buildManualExpenseDeleteOp(batchId, userId, r.id, r.deleted_at),
      ),
    );

    const { rows: updatedRows } = await client.query<ImportBatchRow>(
      `UPDATE import_batches
          SET status = 'undone', updated_at = NOW()
        WHERE id = $1 AND user_id = $2
        RETURNING id, user_id, source, status, rows_total, rows_created,
                  rows_linked, rows_skipped, created_row_ids, created_at, updated_at`,
      [batchId, userId],
    );
    const updated = updatedRows[0];
    if (!updated) {
      throw new Error(
        "import_batches UPDATE ... RETURNING повернув 0 рядків — драйвер-аномалія (рядок існував у SELECT FOR UPDATE щойно вище)",
      );
    }

    await client.query("COMMIT");

    res.status(200).json(
      ImportBatchUndoResponseSchema.parse({
        batch: serializeImportBatch(updated),
        tombstoned: tombstoneResult.rowCount ?? 0,
      }),
    );
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* secondary rollback failure swallowed — оригінальна помилка важливіша */
    }
    throw err;
  } finally {
    client.release();
  }
}
