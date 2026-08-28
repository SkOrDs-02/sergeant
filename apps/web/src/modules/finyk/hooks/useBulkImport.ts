/**
 * Last validated: 2026-08-28
 * Status: Active
 *
 * Мутації "Масового ведення" (спека § Фаза 2 — скрін банкінгу / CSV-виписка
 * / commit+undo). Batch-чеки (кілька фото чеків) НЕ тут — той шлях це N ×
 * v1 `lookupReceipt`/`analyzeReceipt`/`saveReceipt`, див.
 * `useBulkReceiptsImport.ts`.
 *
 * **Локальна видимість комітнутих рядків.** `commitImport` створює
 * `finyk_manual_expenses` рядки ПРЯМИМ SQL INSERT (той самий патерн, що
 * чекова manual-expense fallback, див. `useReceiptSave.ts`), тому
 * побачити їх на пристрої можна двома шляхами, і тут задіяні обидва:
 *
 *   1. **Серверний `sync_op_log`-оп** (фікс 2026-08-28,
 *      `apps/server/src/modules/finyk/import/syncOps.ts`) — рядок їде
 *      штатним pull-ом на ВСІ пристрої, з фактичним серверним blob-ом.
 *      Це стосується і рядків зі статусом `duplicate`, тобто повторний
 *      імпорт того самого файлу ВИТЯГУЄ рядки, які застрягли на сервері
 *      до фіксу. Pull ходить раз на ~60 с, тож після коміту просимо один
 *      позачерговий цикл (`nudgeSyncPull`).
 *   2. **Локальний write-through** створених рядків — щоб «Операції»
 *      оновились миттєво, не чекаючи мережевого циклу №1.
 *
 * **Per-row статуси замість «все або нічого» (той самий фікс).** Раніше
 * write-through вимагав `skipped.monoMatched === 0 && skipped.duplicate
 * === 0`: сервер повертав лише лічильники, а `createdRowIds` (з окремого
 * `GET .../batches/:id`) не мав «дірок» під пропущені рядки, тож зіставити
 * id з поданими рядками можна було ЛИШЕ коли пропущених немає. Наслідок:
 * один-єдиний дубль чи mono-матч у батчі робив невидимими локально ВСІ
 * створені рядки цього імпорту. Тепер `ImportCommitResponse.rows` несе
 * результат КОЖНОГО рядка 1:1 з запитом (`created` / `duplicate` /
 * `tombstoned` / `mono_matched`), і зіставлення чесне за конструкцією.
 * Порожній `rows` = сервер ще старий (web і server деплояться окремо) —
 * тоді працює легасі-шлях із `getImportBatch`.
 *
 * **Undo дзеркалить write-through назад.** `useImportCommit` повертає
 * `locallyWrittenIds` разом з рештою `ImportCommitResponse` — саме ті id,
 * які щойно пішли в `storage.addManualExpense`. `useImportBatchUndo`
 * приймає їх поруч з `batchId`: спершу видаляє батч на сервері, тоді (лише
 * при успіху) прибирає ті самі id з `storage` через `removeManualExpense`.
 * Без цього кроку "Скасувати імпорт" лишав би на пристрої фантомні рядки.
 * У `locallyWrittenIds` ідуть ЛИШЕ `created`-рядки: `duplicate`-рядки
 * сервер при undo не тонить (їх немає в `batch.createdRowIds`), тож
 * прибирати їх локально означало б знову сховати те, що на сервері живе.
 */
import { useMutation } from "@tanstack/react-query";
import { apiClient } from "@shared/api";
import type {
  ImportCommitRequest,
  ImportCommitResponse,
  ImportScreenshotAnalyzeRequest,
  ImportStatementPreviewRequest,
} from "@sergeant/api-client";
import {
  hasLocalManualExpense,
  type ManualExpenseWriteThroughStorage,
} from "./manualExpenseWriteThrough";

const FALLBACK_DESCRIPTION = "Без опису";

/** `ImportCommitResponse` + which ids `useImportCommit` actually wrote
 * through locally — empty when write-through was skipped (any row was
 * skipped server-side) or nothing was created. `useImportBatchUndo` needs
 * this list to reverse the local write on undo (§ докстрінг вище). */
export interface ImportCommitResult extends ImportCommitResponse {
  locallyWrittenIds: readonly string[];
}

export function useImportScreenshotAnalyze() {
  return useMutation({
    mutationFn: (payload: ImportScreenshotAnalyzeRequest) =>
      apiClient.finyk.analyzeImportScreenshot(payload),
  });
}

export function useImportStatementPreview() {
  return useMutation({
    mutationFn: (payload: ImportStatementPreviewRequest) =>
      apiClient.finyk.previewImportStatement(payload),
  });
}

export interface UseImportCommitOptions {
  storage: ManualExpenseWriteThroughStorage;
}

/** Пише один рядок локально, якщо його там ще немає. Повертає `true`,
 * коли запис реально відбувся (для `locallyWrittenIds` / undo). */
function writeThroughRow(
  storage: ManualExpenseWriteThroughStorage,
  id: string,
  row: ImportCommitRequest["rows"][number],
): boolean {
  if (hasLocalManualExpense(storage, id)) return false;
  storage.addManualExpense({
    id,
    date: row.date,
    description: row.description.trim() || FALLBACK_DESCRIPTION,
    amount: row.amountKopiykas / 100,
    category: row.category,
    kind: row.direction,
  });
  return true;
}

/**
 * Легасі-шлях для сервера, який ще не віддає `response.rows` (web і
 * server деплояться окремо). Обмеження те саме, що й було: id з
 * `createdRowIds` зіставні з поданими рядками ЛИШЕ коли не пропущено
 * жодного — інакше позиції зсуваються.
 */
async function writeThroughViaBatchFetch(
  storage: ManualExpenseWriteThroughStorage,
  batchId: number,
  rows: ImportCommitRequest["rows"],
  response: ImportCommitResponse,
): Promise<string[]> {
  const noSkips =
    response.skipped.monoMatched === 0 &&
    response.skipped.duplicate === 0 &&
    response.created === rows.length;
  if (!noSkips || response.created === 0) return [];

  // Best-effort: a failed follow-up fetch must not fail the commit itself
  // — the rows are safely on the server either way (§ докстрінг).
  const { batch } = await apiClient.finyk
    .getImportBatch(batchId)
    .catch(() => ({ batch: null }));
  if (!batch) return [];

  const writtenIds: string[] = [];
  batch.createdRowIds.forEach((id, i) => {
    const row = rows[i];
    if (!row) return;
    if (writeThroughRow(storage, id, row)) writtenIds.push(id);
  });
  return writtenIds;
}

async function writeThroughCommittedRows(
  storage: ManualExpenseWriteThroughStorage,
  batchId: number,
  rows: ImportCommitRequest["rows"],
  response: ImportCommitResponse,
): Promise<string[]> {
  // Довжина, а не просто «непорожній»: 1:1-зіставлення з `rows` запиту —
  // це і є контракт поля, і розбіжність означає, що щось пішло не так,
  // а не «частково довіряй». `?? []` — на випадок тіла, яке не пройшло
  // через zod-дефолт схеми (сервер старої версії за проксі, стаб у тесті).
  const rowResults = response.rows ?? [];
  if (rowResults.length !== rows.length) {
    return writeThroughViaBatchFetch(storage, batchId, rows, response);
  }

  const writtenIds: string[] = [];
  rowResults.forEach((result, i) => {
    // Лише `created`. `duplicate` приїде pull-ом з ФАКТИЧНИМ серверним
    // blob-ом: id хешує дату/суму/напрям/опис, але НЕ категорію, тож
    // локальний запис із поточного драфту міг би розійтися з тим, що на
    // сервері вже лежить. `tombstoned` не воскрешаємо, `mono_matched`
    // уже видно як mono-транзакцію.
    if (result.status !== "created") return;
    const row = rows[i];
    if (!row) return;
    if (writeThroughRow(storage, result.id, row)) writtenIds.push(result.id);
  });
  return writtenIds;
}

/**
 * Позачерговий pull. Серверні опи (створені рядки + ті, що вже лежали на
 * сервері) приїжджають штатним циклом раз на ~60 с — чекати хвилину
 * після «Імпортувати» неприйнятно, тож просимо один цикл одразу.
 *
 * Best-effort і навмисно тихий: рядки вже безпечно на сервері, а
 * наступний штатний pull докотить їх у будь-якому разі. Динамічний
 * імпорт — щоб sync-двигун не заїхав у eager-граф finyk.
 */
async function nudgeSyncPull(): Promise<void> {
  try {
    const { bootSyncEngineReader } =
      await import("../../../core/syncEngine/singleton");
    const reader = await bootSyncEngineReader();
    await reader?.pullOnce();
  } catch {
    /* наступний штатний pull докотить рядки сам */
  }
}

export function useImportCommit({ storage }: UseImportCommitOptions) {
  return useMutation<ImportCommitResult, unknown, ImportCommitRequest>({
    mutationFn: async (params) => {
      const response = await apiClient.finyk.commitImport(params);
      const locallyWrittenIds = await writeThroughCommittedRows(
        storage,
        response.batchId,
        params.rows,
        response,
      );
      // Рядки, яких write-through свідомо не торкнувся (уже лежали на
      // сервері), видимі лише через pull — просимо його зараз, а не за
      // хвилину. Не `await`: імпорт завершено, і мережевий цикл не має
      // тримати кнопку в стані «зберігаю».
      if ((response.rows ?? []).some((r) => r.status === "duplicate")) {
        void nudgeSyncPull();
      }
      return { ...response, locallyWrittenIds };
    },
  });
}

export interface UseImportBatchUndoOptions {
  storage: ManualExpenseWriteThroughStorage;
}

export interface ImportBatchUndoParams {
  batchId: number;
  /** `ImportCommitResult.locallyWrittenIds` from the matching commit —
   * reversed locally only after the server-side delete succeeds. */
  localIds: readonly string[];
}

export function useImportBatchUndo({ storage }: UseImportBatchUndoOptions) {
  return useMutation({
    mutationFn: async ({ batchId, localIds }: ImportBatchUndoParams) => {
      const response = await apiClient.finyk.deleteImportBatch(batchId);
      for (const id of localIds) storage.removeManualExpense(id);
      return response;
    },
  });
}
