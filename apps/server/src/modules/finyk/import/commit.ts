import type { Request, Response } from "express";
import type { PoolClient } from "pg";
import pool from "../../../db.js";
import { parseBody } from "../../../http/validate.js";
import {
  ImportCommitRequestSchema,
  ImportCommitResponseSchema,
} from "@sergeant/shared";
import type { ImportCommitRow } from "@sergeant/shared";
import { assignImportRowIds } from "./rowKey.js";
import { findMonoMatch } from "./dedupMono.js";
import { serializeImportBatch } from "./serialize.js";
import type { ImportBatchRow } from "./serialize.js";

type WithSessionUser = Request & { user?: { id: string } };

/**
 * `finyk_manual_expenses.data_json` — той самий blob-shape, що клієнт
 * пише (`apps/web/src/modules/finyk/hooks/useStorage.types.ts::ManualExpense`)
 * і що читає `manualExpenseToTransaction` (`@sergeant/finyk-domain`):
 * `amount` — ЗАВЖДИ додатна величина у ГРИВНЯХ, напрям несе ОКРЕМЕ поле
 * `kind` ("expense"|"income"; відсутнє поле — легасі-фолбек "expense",
 * але НОВІ записи (той самий контракт, що `ManualExpenseSheet.tsx`)
 * пишуть `kind` завжди явно, тому цей серверний writer теж завжди
 * явний — не покладається на легасі-дефолт).
 *
 * AI-DANGER: якщо це поле випустити для income-рядків, клієнт прочитає
 * запис як ЗВИЧАЙНУ ВИТРАТУ (дефолт `resolveManualExpenseKind` —
 * `"expense"`) — сума не зміниться, але ЗНАК у розрахунках підсумків
 * стане хибним МОВЧКИ (та сама категорія проблем, що Hard Rule #1
 * bigint-string leak, тільки на рівні домену, не типу).
 */
interface ManualExpenseBlob {
  id: string;
  date: string;
  description: string;
  amount: number;
  category: string;
  kind: "expense" | "income";
}

const FALLBACK_DESCRIPTION = "Без опису";

/**
 * INSERT ... ON CONFLICT (id) DO NOTHING RETURNING id — детермінований
 * `id` (rowKey.ts) робить повторний commit того самого рядка (той самий
 * файл/період завантажено вдруге) no-op замість дубля (0022 § Відкриті
 * рішення №2). `true` — реально вставлено (created); `false` — конфлікт,
 * рядок уже існував (дубль, tier 2 дедупу спеки).
 */
async function insertManualExpenseRow(
  client: PoolClient,
  userId: string,
  id: string,
  row: ImportCommitRow,
): Promise<boolean> {
  const blob: ManualExpenseBlob = {
    id,
    date: row.date,
    description: row.description.trim() || FALLBACK_DESCRIPTION,
    amount: row.amountKopiykas / 100,
    category: row.category,
    kind: row.direction,
  };
  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO finyk_manual_expenses (id, user_id, data_json)
     VALUES ($1, $2, $3::jsonb)
     ON CONFLICT (id) DO NOTHING
     RETURNING id`,
    [id, userId, JSON.stringify(blob)],
  );
  return rows.length > 0;
}

/**
 * POST /api/finyk/import/commit — вибрані/відредаговані draft-рядки
 * (скрін банкінгу або виписка) → триярусний дедуп (тут: тіри 1+2; тір 3,
 * чекова `(user_id, source, fiscal_num)` унікальність, — поверхня v1
 * `receipts`, не цього ендпоінта) → журнал `import_batches` +
 * `finyk_manual_expenses` рядки.
 *
 * Транзакційно, один SQL BEGIN/COMMIT на весь запит (той самий патерн, що
 * `receipts/save.ts`): якщо щось падає посеред циклу — ROLLBACK відкочує
 * і вже вставлені рядки цього ж commit-у, і сам journal-рядок
 * `import_batches` (він пишеться ОСТАННІМ, з фінальними лічильниками, а
 * не спершу з placeholder-статусом — цей slice синхронний, проміжного
 * async-стану немає, тому двоетапний insert+update тут не потрібен).
 *
 * Порядок дедупу ЗА рядком — (а) mono, потім (б) between-imports
 * (буквально зі спеки): рядок, що matched на mono, НІКОЛИ не доходить до
 * ON CONFLICT-перевірки. AI-DANGER: якщо рядок раніше (в іншому commit)
 * уже створив `finyk_manual_expenses`-запис БЕЗ мono-матчу, а тепер (у
 * цьому commit-і) той самий рядок matched-иться на mono, яка з'явилась
 * пізніше (backfill/webhook-лаг) — стара manual-expense НЕ видаляється
 * (matcher "ніколи не зливає і не видаляє дані", той самий принцип, що
 * `receipts/matcher.ts`), і платіж може порахуватись ДВІЧІ (стара
 * manual-expense + нова mono-транзакція). Спека не описує авто-злиття
 * цього кейсу — задокументовано як відоме обмеження в звіті server-agent-а
 * замість мовчазного "виправлення" непроханою логікою.
 *
 * `findMonoMatch`/rowKey обчислюються з `row.description` "як дано" (ДО
 * `FALLBACK_DESCRIPTION`-підстановки) — фолбек лише для збереженого
 * blob-у, не для хешу; порожній опис сам по собі стабільне значення для
 * групування/дедупу.
 */
export default async function commitImportHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const body = parseBody(ImportCommitRequestSchema, req);
  const userId = (req as WithSessionUser).user!.id;

  const ids = assignImportRowIds(userId, body.rows);
  const rowsWithIds = body.rows.map((row, idx) => ({
    row,
    id: ids[idx] ?? "",
  }));

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    let created = 0;
    let monoMatched = 0;
    let duplicate = 0;
    const createdRowIds: string[] = [];

    for (const { row, id } of rowsWithIds) {
      const match = await findMonoMatch(client, {
        userId,
        date: row.date,
        amountKopiykas: row.amountKopiykas,
        direction: row.direction,
      });
      if (match) {
        monoMatched++;
        continue;
      }

      const inserted = await insertManualExpenseRow(client, userId, id, row);
      if (inserted) {
        created++;
        createdRowIds.push(id);
      } else {
        duplicate++;
      }
    }

    const rowsTotal = body.rows.length;
    const rowsSkipped = monoMatched + duplicate;

    const { rows: batchRows } = await client.query<ImportBatchRow>(
      `INSERT INTO import_batches
         (user_id, source, status, rows_total, rows_created, rows_linked, rows_skipped, created_row_ids)
       VALUES ($1, $2, 'completed', $3, $4, 0, $5, $6::jsonb)
       RETURNING id, user_id, source, status, rows_total, rows_created,
                 rows_linked, rows_skipped, created_row_ids, created_at, updated_at`,
      [
        userId,
        body.source,
        rowsTotal,
        created,
        rowsSkipped,
        JSON.stringify(createdRowIds),
      ],
    );
    const batchRow = batchRows[0];
    if (!batchRow) {
      throw new Error(
        "import_batches INSERT ... RETURNING повернув 0 рядків — драйвер-аномалія",
      );
    }

    await client.query("COMMIT");

    const batchId = serializeImportBatch(batchRow).id;
    res.status(201).json(
      ImportCommitResponseSchema.parse({
        batchId,
        created,
        linked: 0,
        skipped: { monoMatched, duplicate },
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
