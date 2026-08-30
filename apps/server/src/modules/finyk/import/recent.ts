import type { Request, Response } from "express";
import pool from "../../../db.js";
import {
  IMPORT_SOURCES,
  ImportRecentResponseSchema,
  type ImportRecentSource,
} from "@sergeant/shared";
// Підшлях, а не кореневий барель: `@sergeant/finyk-domain` тягне
// `categories.ts` -> `@sergeant/design-tokens`, якого немає в образі
// (див. AI-DANGER у Dockerfile.api). Ловиться лише збіркою образу.
import { IMPORT_REMINDER_HISTORY_SIZE } from "@sergeant/finyk-domain/domain/importReminder";

/**
 * `GET /api/finyk/import/recent` — дати останніх успішних батчів по
 * кожному типу документа, для плашки «залий документи» (спека
 * `docs/90-work/planning/specs/finyk-import-reminders.md`).
 *
 * Ендпоінт віддає ФАКТИ, а не вердикт «показувати плашку». Причина не
 * стилістична: умова плашки росте від часу, а не від даних, тож серверна
 * відповідь застаріває сама на довго відкритій вкладці (PWA тримають
 * тижнями) — рівно та пастка, яку вже ловив `useMonoStaleness`. Рішення
 * ухвалює `FinykDomain.evaluateImportReminder` на клієнті, з власним
 * годинником.
 *
 * `status = 'completed'` у WHERE обовʼязковий: undone-батч свої рядки вже
 * tombstone-нув, тож рахувати його як «людина щось залила» було б
 * неправдою — плашка мовчала б саме тоді, коли даних насправді немає.
 */

type WithSessionUser = Request & { user?: { id: string } };

interface RecentImportRow {
  source: string;
  created_at: Date | string;
}

const KNOWN_SOURCES: readonly string[] = IMPORT_SOURCES;

/**
 * Групує рядки в `{ source, recentAt[] }`, найновіший першим.
 *
 * Невідомий `source` відкидається, а не валить відповідь. `import_batches.
 * source` — TEXT без CHECK (міграція 122: «словник живе в коді домену»),
 * тож новий тип документа зʼявиться тут раніше, ніж у Zod-енумі. Для
 * серіалізатора батчу fail-loud правильний (він описує конкретний батч,
 * який користувач щойно створив); тут навпаки: нагадування — допоміжна
 * поверхня, і 500 замість тихого пропуску одного типу був би гіршим
 * обміном.
 */
export function serializeRecentImports(
  rows: readonly RecentImportRow[],
): ImportRecentSource[] {
  const bySource = new Map<string, string[]>();

  for (const row of rows) {
    if (!KNOWN_SOURCES.includes(row.source)) continue;
    const iso =
      row.created_at instanceof Date
        ? row.created_at.toISOString()
        : new Date(row.created_at).toISOString();
    if (iso === "Invalid Date") continue;

    const bucket = bySource.get(row.source);
    if (bucket) bucket.push(iso);
    else bySource.set(row.source, [iso]);
  }

  return [...bySource.entries()].map(([source, recentAt]) => ({
    source,
    recentAt: recentAt.sort((a, b) => b.localeCompare(a)),
  })) as ImportRecentSource[];
}

export async function getRecentImportsHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const userId = (req as WithSessionUser).user!.id;

  const { rows } = await pool.query<RecentImportRow>(
    `SELECT source, created_at
       FROM (
         SELECT source, created_at,
                ROW_NUMBER() OVER (
                  PARTITION BY source ORDER BY created_at DESC
                ) AS rn
           FROM import_batches
          WHERE user_id = $1 AND status = 'completed'
       ) ranked
      WHERE rn <= $2
      ORDER BY source ASC, created_at DESC`,
    [userId, IMPORT_REMINDER_HISTORY_SIZE],
  );

  res.status(200).json(
    ImportRecentResponseSchema.parse({
      sources: serializeRecentImports(rows),
    }),
  );
}

export default getRecentImportsHandler;
