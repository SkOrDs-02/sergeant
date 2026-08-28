import type { Request, Response } from "express";
import type { PoolClient } from "pg";
import pool from "../../../db.js";
import { parseBody } from "../../../http/validate.js";
import {
  ImportCommitRequestSchema,
  ImportCommitResponseSchema,
} from "@sergeant/shared";
import type {
  ImportCommitRow,
  ImportCommitRowResult,
  ImportCommitRowStatus,
} from "@sergeant/shared";
import { assignImportRowIds } from "./rowKey.js";
import { findMonoMatch } from "./dedupMono.js";
import { serializeImportBatch } from "./serialize.js";
import type { ImportBatchRow } from "./serialize.js";
import { emitServerSyncOps } from "../../sync/serverOpLog.js";
import type { ServerSyncOp } from "../../sync/serverOpLog.js";
import {
  MANUAL_EXPENSES_TABLE,
  buildManualExpenseInsertOp,
} from "./syncOps.js";

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

interface UpsertedManualExpense {
  /** `true` — рядок реально вставлено цим викликом (created); `false` —
   * конфлікт, рядок уже існував (тір-2 дедуп). */
  inserted: boolean;
  /** Стан рядка ПІСЛЯ виклику: свіжовставлений або той, що вже лежав. */
  dataJson: unknown;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

/**
 * INSERT ... ON CONFLICT (id) DO NOTHING — детермінований `id`
 * (rowKey.ts) робить повторний commit того самого рядка (той самий
 * файл/період завантажено вдруге) no-op замість дубля (0022 § Відкриті
 * рішення №2).
 *
 * Повертає СТАН рядка, а не лише «вставили/ні»: серверний
 * `sync_op_log`-оп несе фактичний `data_json` і `updated_at` рядка, тож
 * для конфліктного рядка треба саме те, що вже лежить у базі, а не blob,
 * який щойно намагались вставити (категорія в базі могла бути іншою —
 * id хешує дату/суму/напрям/опис, але НЕ категорію). Друга гілка UNION
 * читає знімок ДО цього statement-у, тож вона порожня рівно тоді, коли
 * INSERT спрацював, і навпаки.
 *
 * `deletedAt !== null` — рядок існує, але tombstone (undo імпорту чи
 * ручне видалення). AI-DANGER: такий рядок НЕ можна реплікувати опом —
 * це воскресило б дані, які користувач свідомо прибрав.
 */
async function upsertManualExpenseRow(
  client: PoolClient,
  userId: string,
  id: string,
  row: ImportCommitRow,
): Promise<UpsertedManualExpense | null> {
  const blob: ManualExpenseBlob = {
    id,
    date: row.date,
    description: row.description.trim() || FALLBACK_DESCRIPTION,
    amount: row.amountKopiykas / 100,
    category: row.category,
    kind: row.direction,
  };
  const { rows } = await client.query<{
    data_json: unknown;
    created_at: Date;
    updated_at: Date;
    deleted_at: Date | null;
    inserted: boolean;
  }>(
    `WITH ins AS (
       INSERT INTO finyk_manual_expenses (id, user_id, data_json)
       VALUES ($1, $2, $3::jsonb)
       ON CONFLICT (id) DO NOTHING
       RETURNING data_json, created_at, updated_at, deleted_at
     )
     SELECT data_json, created_at, updated_at, deleted_at, TRUE AS inserted
       FROM ins
     UNION ALL
     SELECT data_json, created_at, updated_at, deleted_at, FALSE AS inserted
       FROM finyk_manual_expenses
      WHERE id = $1 AND user_id = $2 AND NOT EXISTS (SELECT 1 FROM ins)`,
    [id, userId, JSON.stringify(blob)],
  );
  const found = rows[0];
  if (!found) return null;
  return {
    inserted: found.inserted,
    dataJson: found.data_json,
    createdAt: found.created_at,
    updatedAt: found.updated_at,
    deletedAt: found.deleted_at,
  };
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
 * **Видимість на пристроях (фікс 2026-08-28).** Раніше рядок існував
 * лише в таблиці — а `syncV2Pull` читає ВИКЛЮЧНО `sync_op_log`, тож
 * жоден пристрій його не отримував; єдиним каналом лишався крихкий
 * клієнтський write-through, який вимикався цілком, щойно в батчі
 * траплявся бодай один пропущений рядок. Наслідок, який і привів до
 * цього фіксу: імпорт виписки «спрацював», повторне завантаження чесно
 * казало «схоже, вони вже є» (превʼю дивиться в БД), а в «Операціях»
 * рядків не було НІКОЛИ. Тепер кожен рядок, що після commit-у реально
 * лежить у таблиці ЖИВИМ, отримує серверний оп (`syncOps.ts` +
 * `sync/serverOpLog.ts`) — і created, і `duplicate`. Реплікація дублів
 * тут не косметика: саме вона витягує на пристрій рядки, які застрягли
 * на сервері до цього фіксу (повторний імпорт того самого файлу
 * самолікується). Tombstone-рядки (undo/ручне видалення) свідомо НЕ
 * реплікуються — інакше повторний імпорт воскрешав би видалене.
 *
 * Порядок дедупу ЗА рядком — (а) mono, потім (б) between-imports
 * (буквально зі спеки): рядок, що matched на mono, НІКОЛИ не доходить до
 * ON CONFLICT-перевірки. AI-DANGER: якщо рядок раніше (в іншому commit)
 * уже створив `finyk_manual_expenses`-запис БЕЗ мono-матчу, а тепер (у
 * цьому commit-і) той самий рядок matched-иться на mono, яка зʼявилась
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
  const rowsWithIds = body.rows.map((row, idx) => {
    const id = ids[idx];
    // Fail loud (ревʼю PR #818): порожній id тихо пішов би в
    // ON CONFLICT (id) DO NOTHING і кожен наступний такий рядок батчу
    // рахувався б «дублем» — мовчазна втрата даних замість помилки.
    if (!id) {
      throw new Error(
        "assignImportRowIds повернув менше id, ніж рядків — інваріант порушено",
      );
    }
    return { row, id };
  });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    let created = 0;
    let monoMatched = 0;
    let duplicate = 0;
    const createdRowIds: string[] = [];
    const rowResults: ImportCommitRowResult[] = [];
    /** Рядки, які після commit-у реально лежать у таблиці ЖИВИМИ — саме
     * їх реплікуємо опом (created + живі дублі, § докстрінг handler-а). */
    const replicable: Array<{ id: string; state: UpsertedManualExpense }> = [];

    for (const { row, id } of rowsWithIds) {
      const match = await findMonoMatch(client, {
        userId,
        date: row.date,
        amountKopiykas: row.amountKopiykas,
        direction: row.direction,
      });
      if (match) {
        monoMatched++;
        rowResults.push({ id, status: "mono_matched" });
        continue;
      }

      const upserted = await upsertManualExpenseRow(client, userId, id, row);
      let status: ImportCommitRowStatus;
      if (upserted?.inserted) {
        created++;
        createdRowIds.push(id);
        status = "created";
      } else {
        duplicate++;
        status = upserted?.deletedAt ? "tombstoned" : "duplicate";
      }
      if (upserted && upserted.deletedAt === null) {
        replicable.push({ id, state: upserted });
      }
      rowResults.push({ id, status });
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

    const batchId = serializeImportBatch(batchRow).id;

    // Рядки їдуть на пристрої тим самим pull-каналом, що й будь-яка інша
    // зміна. Емісія — ПІСЛЯ вставки батчу (потрібен його id для
    // idempotency-ключа) і ВСЕРЕДИНІ тієї самої транзакції: ROLLBACK не
    // має лишити оп про рядок, якого немає.
    const syncOps: ServerSyncOp[] = replicable.map(({ id, state }) =>
      buildManualExpenseInsertOp(batchId, userId, {
        id,
        dataJson: state.dataJson,
        createdAt: state.createdAt,
        updatedAt: state.updatedAt,
      }),
    );
    await emitServerSyncOps(client, userId, MANUAL_EXPENSES_TABLE, syncOps);

    await client.query("COMMIT");

    res.status(201).json(
      ImportCommitResponseSchema.parse({
        batchId,
        created,
        linked: 0,
        skipped: { monoMatched, duplicate },
        rows: rowResults,
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
