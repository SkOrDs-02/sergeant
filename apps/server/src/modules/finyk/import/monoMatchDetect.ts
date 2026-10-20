/**
 * Last validated: 2026-10-20
 * Status: Active
 *
 * Мʼяка мітка `monoMatchLikely` на ПРЕВʼЮ (data-30; рішення власника: тір-1
 * лише для mono, для інших джерел мітка). Тір-1 дедуп на `commit`
 * (`dedupMono.ts`) мовчки скіпає рядок лише коли профіль батчу `mono`. Для
 * виписки Privat24, довільного CSV чи скріна збіг суми й дати з
 * mono-операцією майже завжди випадковий (кава, проїзд, круглий переказ), і
 * автоскіп робив би з цього зниклу витрату, тож тут рядок лише ПОЗНАЧАЄТЬСЯ:
 * бейдж + знята галочка у bulk-review, рішення за людиною. НІЧОГО не
 * викидаємо автоматично.
 *
 * Для профілю `mono` мітки немає: рядок і так буде пропущено на commit-і
 * (це і є «вже є в mono»), а превʼю не мусить ще й знімати галочку.
 *
 * Скрін Monobank-застосунку теж не `mono`-профіль (це vision, не файл банку),
 * і саме тут мітка найкорисніша: вона знімає галочку з рядка, який справді
 * вже є як mono-операція, а рішення лишає людині.
 *
 * Той самий предикат і те саме «споживання» (одна mono-операція на один
 * рядок), що в `findMonoMatchedRows`: мітка показує рівно те, що зробив би
 * commit з профілем `mono`.
 */
import type { PoolClient } from "pg";
import { findMonoMatchedRows } from "./dedupMono.js";
import type { DedupMonoInput } from "./dedupMono.js";

type Db = Pick<PoolClient, "query">;

/**
 * Повертає ті самі рядки в тому самому порядку; збіги отримують
 * `monoMatchLikely: true` (лише true — відсутнє поле означає «збігу немає»,
 * контракт `monoMatchLikelySchema` у `@sergeant/shared`). Порожній вхід не
 * ходить у БД.
 */
export async function markMonoMatchLikely<T extends DedupMonoInput>(
  db: Db,
  userId: string,
  rows: readonly T[],
): Promise<Array<T & { monoMatchLikely?: true }>> {
  if (rows.length === 0) return [...rows];
  const flags = await findMonoMatchedRows(db, userId, rows);
  return rows.map((row, i) =>
    flags[i] ? { ...row, monoMatchLikely: true } : row,
  );
}
