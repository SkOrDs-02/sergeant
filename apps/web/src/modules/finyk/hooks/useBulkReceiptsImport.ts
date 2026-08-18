/**
 * Last validated: 2026-08-17
 * Status: Active
 *
 * "Чеки пачкою" (спека § Фаза 2а): N × v1-флоу, БЕЗ нової чекової механіки
 * і БЕЗ `import_batches`/`commitImport` (та поверхня — лише
 * bank_screenshot/bank_statement; batch-чеки лишаються на v1 `receipts.*`
 * — кожен чек уже ідемпотентний сам по собі через `(user_id, fiscal_num)`
 * або `clientScanId`, окремий журнал йому не потрібен).
 *
 * Обробка ПОСЛІДОВНА (не паралельна ≤2, як реком. спека) — спрощення
 * заради обсягу PR-у; безпечний підмножина рекомендації (1 ≤ 2), і кожен
 * файл усе одно чекає мережевого round-trip, тож послідовність не змінює
 * порядок величини часу для типового батчу (≤10 файлів, спека § Відкриті
 * питання Фази 2 п.1).
 *
 * Позиції чека в batch-режимі НЕ редагуються по одному пункту (лише
 * магазин/сума/категорія на компактному рядку, `BulkReceiptsProgress`) —
 * докладне редагування позицій лишається на одиночному v1-флоу
 * (`ReceiptScanSheet`). Задокументоване спрощення обсягу.
 */
import { useCallback, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiClient } from "@shared/api";
import type { ReceiptDraft, ReceiptLookupRequest } from "@sergeant/api-client";
import { formatReceiptError } from "../lib/receiptErrors";
import { readReceiptImageFile } from "../lib/receiptImage";
import { parseDpsReceiptQrUrl } from "../lib/receiptQr";
import { decodeQrFromImageFile } from "./useReceiptQrScanner";
import { DEFAULT_CATEGORY } from "../components/manualExpenseCategories";
import { useReceiptSave, type ReceiptSaveStorageSlice } from "./useReceiptSave";

/** Спека § Відкриті питання Фази 2, п.1 — рекомендація founder-а. */
export const BATCH_RECEIPTS_MAX_FILES = 10;

export type BatchReceiptStatus =
  | "pending"
  | "fetching"
  | "drafted"
  | "fetch-error"
  | "saving"
  | "saved"
  | "already-exists"
  | "save-error";

export interface BatchReceiptItem {
  id: string;
  fileName: string;
  status: BatchReceiptStatus;
  draft: ReceiptDraft | null;
  category: string;
  included: boolean;
  error: string | null;
}

export interface UseBulkReceiptsImportOptions {
  storage: ReceiptSaveStorageSlice;
  onReceiptLinked: (txRef: string, receiptId: number) => void;
}

async function fetchDraftForFile(
  file: File,
  lookup: (req: ReceiptLookupRequest) => Promise<{ draft: ReceiptDraft }>,
  analyze: (payload: {
    image_base64: string;
    mime_type: string;
  }) => Promise<{ draft: ReceiptDraft }>,
): Promise<ReceiptDraft> {
  const qrText = await decodeQrFromImageFile(file).catch(() => null);
  const lookupReq = qrText ? parseDpsReceiptQrUrl(qrText) : null;
  if (lookupReq) {
    try {
      const { draft } = await lookup(lookupReq);
      return draft;
    } catch {
      // ДПС не відповіла навіть з QR у фото — пробуємо vision на тому
      // самому фото (той самий "не питай юзера вдруге" принцип, що
      // одиночний флоу `ReceiptScanSheet`).
    }
  }
  const imageResult = await readReceiptImageFile(file);
  if (!imageResult.ok) throw new Error(imageResult.error);
  const { draft } = await analyze(imageResult.payload);
  return draft;
}

export function useBulkReceiptsImport({
  storage,
  onReceiptLinked,
}: UseBulkReceiptsImportOptions) {
  const [items, setItems] = useState<BatchReceiptItem[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const lookupMutation = useMutation({
    mutationFn: (req: ReceiptLookupRequest) =>
      apiClient.finyk.lookupReceipt(req),
  });
  const analyzeMutation = useMutation({
    mutationFn: (payload: { image_base64: string; mime_type: string }) =>
      apiClient.finyk.analyzeReceipt(payload),
  });
  const { saveReceipt } = useReceiptSave({ storage, onReceiptLinked });

  const patchItem = useCallback(
    (id: string, patch: Partial<BatchReceiptItem>) => {
      setItems((prev) =>
        prev.map((x) => (x.id === id ? { ...x, ...patch } : x)),
      );
    },
    [],
  );

  const startFiles = useCallback(
    async (files: File[]) => {
      const capped = files.slice(0, BATCH_RECEIPTS_MAX_FILES);
      const initial: BatchReceiptItem[] = capped.map((file, i) => ({
        id: `${i}-${file.name}-${file.size}`,
        fileName: file.name,
        status: "pending",
        draft: null,
        category: DEFAULT_CATEGORY,
        included: true,
        error: null,
      }));
      setItems(initial);
      setIsProcessing(true);
      for (let i = 0; i < capped.length; i++) {
        const file = capped[i];
        const item = initial[i];
        if (!file || !item) continue;
        patchItem(item.id, { status: "fetching" });
        try {
          const draft = await fetchDraftForFile(
            file,
            (req) => lookupMutation.mutateAsync(req),
            (payload) => analyzeMutation.mutateAsync(payload),
          );
          patchItem(item.id, { status: "drafted", draft });
        } catch (err) {
          patchItem(item.id, {
            status: "fetch-error",
            included: false,
            error: formatReceiptError(err, "Не вдалось розпізнати чек."),
          });
        }
      }
      setIsProcessing(false);
    },
    [lookupMutation, analyzeMutation, patchItem],
  );

  const setItemCategory = useCallback(
    (id: string, category: string) => patchItem(id, { category }),
    [patchItem],
  );
  const toggleItemIncluded = useCallback(
    (id: string) =>
      setItems((prev) =>
        prev.map((x) => (x.id === id ? { ...x, included: !x.included } : x)),
      ),
    [],
  );

  // `items` is a dependency on purpose: `saveAll` is recreated every time
  // `items` changes (e.g. after `startFiles` finishes drafting), so the
  // closure the CALLER invokes always sees the latest snapshot. Reading
  // it back out of `setState` via a Promise (an earlier version of this
  // hook did that) deadlocks under `act()` — React only flushes the
  // scheduled update after the surrounding `act()` callback settles, and
  // that callback was itself awaiting this same promise.
  const saveAll = useCallback(async () => {
    setIsSaving(true);
    for (const item of items) {
      if (item.status !== "drafted" || !item.included || !item.draft) continue;
      patchItem(item.id, { status: "saving" });
      try {
        const result = await saveReceipt(
          item.draft,
          item.category || DEFAULT_CATEGORY,
        );
        patchItem(item.id, {
          status: result.alreadyExists ? "already-exists" : "saved",
        });
      } catch (err) {
        patchItem(item.id, {
          status: "save-error",
          error: formatReceiptError(err, "Не вдалось зберегти чек."),
        });
      }
    }
    setIsSaving(false);
  }, [items, patchItem, saveReceipt]);

  const reset = useCallback(() => {
    setItems([]);
    setIsProcessing(false);
    setIsSaving(false);
  }, []);

  return {
    items,
    isProcessing,
    isSaving,
    startFiles,
    setItemCategory,
    toggleItemIncluded,
    saveAll,
    reset,
  };
}
