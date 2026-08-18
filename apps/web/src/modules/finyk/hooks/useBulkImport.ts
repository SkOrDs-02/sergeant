/**
 * Last validated: 2026-08-17
 * Status: Active
 *
 * Мутації "Масового ведення" (спека § Фаза 2 — скрін банкінгу / CSV-виписка
 * / commit+undo). Batch-чеки (кілька фото чеків) НЕ тут — той шлях це N ×
 * v1 `lookupReceipt`/`analyzeReceipt`/`saveReceipt`, див.
 * `useBulkReceiptsImport.ts`.
 *
 * **Локальна видимість комітнутих рядків.** `commitImport` створює
 * `finyk_manual_expenses` рядки ПРЯМИМ SQL INSERT, в обхід `sync_op_log`
 * (`apps/server/src/modules/finyk/import/commit.ts::insertManualExpenseRow`
 * — той самий патерн, що чекова manual-expense fallback, див.
 * `useReceiptSave.ts` докстрінг для повного розбору "чому pull це не
 * докочує"). Але `ImportCommitResponse` НЕ повертає `createdRowIds` —
 * лише агреговані лічильники (`created`/`skipped`); ids повертає ОКРЕМИЙ
 * `GET /api/finyk/import/batches/:id`. Тому write-through тут — ДВА
 * мережеві кроки: (1) commit, (2) якщо нічого не пропущено — довантажити
 * `getImportBatch` за `createdRowIds` і зіставити їх 1:1 з поданими
 * рядками.
 *
 * **Undo дзеркалить write-through назад.** `useImportCommit` повертає
 * `locallyWrittenIds` разом з рештою `ImportCommitResponse` — саме ті id,
 * які щойно пішли в `storage.addManualExpense`. `useImportBatchUndo`
 * приймає їх поруч з `batchId`: спершу видаляє батч на сервері, тоді (лише
 * при успіху) прибирає ті самі id з `storage` через `removeManualExpense`.
 * Без цього кроку "Скасувати імпорт" лишав би на пристрої фантомні рядки —
 * сервер про них уже забув, а локальний стан ніхто не сповістив (той самий
 * `sync_op_log`-bypass, що зробив write-through потрібним НАСАМПЕРЕД).
 *
 * **Чому 1:1 зіставлення безпечне ЛИШЕ коли `skipped.monoMatched === 0 &&
 * skipped.duplicate === 0`.** Сервер (`commit.ts`) обробляє рядки
 * ПОСЛІДОВНО в порядку `body.rows` і додає id у `createdRowIds` ЛИШЕ для
 * рядків, які реально вставились — mono-matched і duplicate рядки
 * пропускаються МОВЧКИ (без "дірки"-плейсхолдера в масиві). Тобто
 * `createdRowIds[i]` відповідає `rows[i]` РІВНО тоді, коли жоден рядок
 * НЕ пропущено (`created === rows.length`) — інакше позиції зсуваються, і
 * без серверного per-row результату клієнт не може чесно відновити
 * відповідність (`rowKey.ts`-хеш реалізовувати клієнтом — крихко: залежить
 * від точного формату userId/normalize-функції сервера, легко розійдеться
 * непомітно). У протилежному випадку локальний write-through
 * ПРОПУСКАЄТЬСЯ — рядки лишаються видимими лише в серверному підсумку
 * (`created`/`skipped`), локально з'являться після майбутньої повної
 * історії/синку (задокументоване обмеження v1, як і в `useReceiptSave.ts`).
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

async function writeThroughCommittedRows(
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
    if (hasLocalManualExpense(storage, id)) return;
    storage.addManualExpense({
      id,
      date: row.date,
      description: row.description.trim() || FALLBACK_DESCRIPTION,
      amount: row.amountKopiykas / 100,
      category: row.category,
      kind: row.direction,
    });
    writtenIds.push(id);
  });
  return writtenIds;
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
