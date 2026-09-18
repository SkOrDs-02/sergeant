/**
 * Last validated: 2026-08-17
 * Status: Active
 *
 * `POST /api/finyk/receipts` (save) — clientScanId-контракт + локальна
 * видимість server-created manual-expense fallback-ів (звіт web-agent-а
 * PR #818 § 6).
 *
 * **clientScanId.** Лише для vision-чеків (`draft.fiscalNum === null`,
 * спека § Дедуп): один `crypto.randomUUID()` на СПРОБУ збереження,
 * стабільний між retry ТІЄЇ САМОЇ спроби (мережевий таймаут / подвійний
 * тап), новий — для нового скану. Реалізовано через identity-порівняння
 * `draft`-обʼєкта: той самий draft (та сама React-стейт-референція, поки
 * користувач нічого не редагував) → той самий `clientScanId`; НОВИЙ draft
 * (свіжий скан, або відредагований review-екран — `setState` завжди дає
 * нову референцію) → новий `clientScanId`. QR/ДПС-чеки (`fiscalNum`
 * присутній) мають серверний ключ ідемпотентності `(user_id, fiscal_num)`
 * — `clientScanId` там не потрібен.
 *
 * **Локальна видимість (manual-fallback).** `saveReceiptHandler` (сервер)
 * створює manual-expense fallback ПРЯМИМ SQL INSERT у
 * `finyk_manual_expenses`, В ОБХІД `sync_op_log` (`apps/server/src/modules
 * /finyk/receipts/save.ts::insertManualExpenseForReceipt` — немає виклику
 * `syncV2Push`/жодного запису в op-log). Клієнтський pull
 * (`GET /api/sync/v2/pull`) читає ВИКЛЮЧНО `sync_op_log`
 * (`apps/server/src/modules/sync/syncV2.ts::syncV2Pull`) — тож цей рядок
 * НІКОЛИ не докотиться через звичайний sync. Єдиний спосіб побачити його
 * локально — записати те саме одразу з відповіді save(): клієнт знає
 * ПОВНИЙ blob (`id` = `link.txRef`, `date` = Kyiv-день `purchasedAt`,
 * `description` = магазин, `amount` = `totalKopiykas/100` у гривнях,
 * `category` = та, що відправили) — байт-у-байт те саме, що сервер щойно
 * вставив. Пишемо через `storage.addManualExpense` — ТОЙ САМИЙ dual-write
 * шлях, яким іде звичайне ручне додавання, тож push цього рядка ПІЗНІШЕ
 * або зіллється (LWW, `applyFinykPerRowBlob`: `updated_at >= clientTs` →
 * `lww_conflict`, рядок лишається як є) або нешкідливо перепише
 * ідентичним вмістом — жодного дубля не зʼявляється.
 *
 * Guard від локального дубля: перш ніж писати, перевіряємо
 * `storage.manualExpenses` на вже наявний `id === link.txRef` — без цього
 * повторний `alreadyExists:true` (той самий чек пересканували) додав би
 * ДРУГИЙ локальний рядок з тим самим id (`addManualExpense` сам не
 * дедуплікує — просто `[entry, ...prev]`), подвоюючи суму в UI, хоч на
 * сервері дубля нема.
 *
 * Mono-лінк (`link.txKind === "mono"`) НЕ потребує write-through — та
 * транзакція вже видима через mono-webhook/mirror sync; записуємо лише
 * лінк для розгортки (`onReceiptLinked`).
 */
import { useRef } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiClient } from "@shared/api";
import { getKyivDayKey } from "@shared/lib/time/kyivTime";
import type {
  ReceiptDraft,
  ReceiptSaveRequest,
  ReceiptSaveResponse,
} from "@sergeant/api-client";
import {
  hasLocalManualExpense,
  type ManualExpenseWriteThroughStorage,
} from "./manualExpenseWriteThrough";

// Re-exported under the pre-existing name so nothing else in this same
// PR-slice needs to change its import — `ManualExpenseWriteThroughStorage`
// is the canonical name (shared with `useBulkImport.ts`).
export type ReceiptSaveStorageSlice = ManualExpenseWriteThroughStorage;

export interface UseReceiptSaveOptions {
  storage: ReceiptSaveStorageSlice;
  /** Fired for EVERY successful save (mono or manual link) — feeds the
   * drill-down indicator (`useFinykReceiptLinks`). */
  onReceiptLinked: (txRef: string, receiptId: number) => void;
}

export interface UseReceiptSaveResult {
  saveReceipt: (
    draft: ReceiptDraft,
    category: string,
  ) => Promise<ReceiptSaveResponse>;
  isSaving: boolean;
  error: unknown;
  reset: () => void;
}

export function useReceiptSave({
  storage,
  onReceiptLinked,
}: UseReceiptSaveOptions): UseReceiptSaveResult {
  // Identity-tracking refs — see the module docstring for the "same
  // attempt vs new attempt" contract.
  const lastDraftRef = useRef<ReceiptDraft | null>(null);
  const clientScanIdRef = useRef<string | null>(null);

  const mutation = useMutation<
    ReceiptSaveResponse,
    unknown,
    { draft: ReceiptDraft; category: string }
  >({
    mutationFn: async ({ draft, category }) => {
      let clientScanId: string | undefined;
      if (draft.fiscalNum === null) {
        if (lastDraftRef.current !== draft || !clientScanIdRef.current) {
          clientScanIdRef.current = crypto.randomUUID();
        }
        lastDraftRef.current = draft;
        clientScanId = clientScanIdRef.current;
      }

      const body: ReceiptSaveRequest = {
        ...draft,
        category,
        ...(clientScanId ? { clientScanId } : {}),
      };
      return apiClient.finyk.saveReceipt(body);
    },
    onSuccess: ({ receipt }, { category }) => {
      const link = receipt.link;
      if (!link) return;

      onReceiptLinked(link.txRef, receipt.id);

      if (link.txKind !== "manual") return;
      if (hasLocalManualExpense(storage, link.txRef)) return;

      storage.addManualExpense({
        id: link.txRef,
        date: getKyivDayKey(new Date(receipt.purchasedAt)),
        description: receipt.store,
        amount: receipt.totalKopiykas / 100,
        category,
        kind: "expense",
      });
    },
  });

  return {
    saveReceipt: (draft, category) => mutation.mutateAsync({ draft, category }),
    isSaving: mutation.isPending,
    error: mutation.error,
    reset: mutation.reset,
  };
}
