/**
 * Last validated: 2026-09-29
 * Status: Active
 *
 * Автоімпорт чеків Сільпо в комору - спека
 * `docs/work/specs/silpo-pantry-auto-import.md` § Рішення дизайну.
 *
 * AI-CONTEXT: жодного нового шляху запису в комору й жодного нового
 * серверного job-а. Хук спостерігає за `useSilpoReceipts` (той самий
 * TTL-кеш read-хук, що й ручний потік/картка Сільпо в Налаштуваннях - «без
 * форсування» означає, що цей хук НЕ викликає `POST /api/silpo/sync` сам,
 * а лише реагує на дані, які принесла вже наявна підписка) і при кожному
 * оновленні списку обробляє чеки, яких ще не бачив цей прохід: бронює
 * groceries-позиції (`pantry-claim`, `mode: "auto"`), пише в комору через
 * `upsertItemForAutoImport` з ТІЄЇ Ж інстанції `useNutritionPantries`, що
 * змонтована в `NutritionApp` (ризик «два екземпляри стану комори» - спека
 * § Ризики), і показує один тост «Повернути» на прохід.
 */
import { useEffect, useRef, useState } from "react";
import { mapReceiptItemToCategory } from "@sergeant/finyk-domain/domain";
import { buildPantryIndex } from "@sergeant/nutrition-domain";
import { silpoApi } from "@shared/api";
import { useToast } from "@shared/hooks/useToast";
import { showUndoToast } from "@shared/lib/ui/undoToast";
import { useSilpoSyncState } from "@finyk/hooks/useSilpoSyncState";
import {
  useSilpoReceipts,
  usePantryClaim,
  usePantryRelease,
} from "@finyk/hooks/useSilpoReceipts";
import {
  buildSilpoAutoImportToastMessage,
  buildSilpoReplenishRows,
  rowsToPantryItems,
} from "../lib/silpoReplenish";
import type { PantryReplenishLine } from "./useNutritionPantries";
import type { PantryItem } from "../lib/pantryTextParser";

const RECEIPTS_LIMIT = 10;
const PAGE_LIMIT = 50;

type ReceiptSummary = Awaited<
  ReturnType<typeof silpoApi.receipts>
>["data"][number];

/**
 * Усі чеки, куплені не раніше `since`. Сервер віддає сторінки від новіших до
 * старіших, тож перший старший чек означає кінець: без цього після кількох
 * днів без відкриття Харчування чеки поза першою сторінкою губились назавжди.
 */
async function fetchReceiptsSince(since: number): Promise<ReceiptSummary[]> {
  const out: ReceiptSummary[] = [];
  let cursor: string | undefined;
  for (;;) {
    const page = await silpoApi.receipts({
      limit: PAGE_LIMIT,
      ...(cursor ? { cursor } : {}),
    });
    for (const r of page.data) {
      if (Date.parse(r.purchasedAt) < since) return out;
      out.push(r);
    }
    if (!page.nextCursor) return out;
    cursor = page.nextCursor;
  }
}

export interface UseSilpoPantryAutoImportParams {
  pantryItems: readonly Pick<PantryItem, "name">[];
  upsertItemForAutoImport: (items: PantryItem[]) => PantryReplenishLine[];
  revertReplenish: (lines: PantryReplenishLine[]) => void;
}

/** Один прохід автоімпорту, зведений для одного тоста «Повернути». */
interface AutoImportedReceipt {
  receiptId: string;
  claimedItemIds: number[];
  lines: PantryReplenishLine[];
}

export function useSilpoPantryAutoImport({
  pantryItems,
  upsertItemForAutoImport,
  revertReplenish,
}: UseSilpoPantryAutoImportParams): void {
  const toast = useToast();
  const { status, data: syncState } = useSilpoSyncState();
  const enabled =
    status === "connected" && syncState?.pantryAutoImportSince != null;
  const receiptsQuery = useSilpoReceipts(
    { limit: RECEIPTS_LIMIT },
    { enabled },
  );
  const claim = usePantryClaim();
  const release = usePantryRelease();

  // Захист від повторного входу: одночасно працює один прохід (ref-замок).
  const runningRef = useRef(false);
  // Список чеків оновився, поки прохід ще йшов: ефект тоді виходить одразу,
  // тож після проходу треба перезапуститись самим, інакше новий чек чекав би
  // наступного refetch.
  const rerunRef = useRef(false);
  const [rerunTick, setRerunTick] = useState(0);
  // Чеки, з якими вже все ясно: імпортовані або такі, де сервер нічого не
  // забронював. Чек із тимчасовою помилкою сюди НЕ потрапляє і пробується
  // знову на наступному оновленні списку.
  const processedRef = useRef<Set<string>>(new Set());
  const pantryItemsRef = useRef(pantryItems);
  const upsertRef = useRef(upsertItemForAutoImport);
  const revertRef = useRef(revertReplenish);
  // Рефи оновлюються ПІСЛЯ коміту, не в тілі рендера (react-hooks/refs) -
  // ефект нижче все одно читає їх лише всередині асинхронного проходу, тож
  // затримка на один реренедер нешкідлива.
  useEffect(() => {
    pantryItemsRef.current = pantryItems;
    upsertRef.current = upsertItemForAutoImport;
    revertRef.current = revertReplenish;
  });

  useEffect(() => {
    if (!enabled) return;
    if (runningRef.current) {
      rerunRef.current = true;
      return;
    }
    // Сервер і сам не забронює чек, старший за увімкнення тумблера; перша
    // сторінка списку тут лише сигнал, що з'явилось щось нове.
    const since = Date.parse(syncState?.pantryAutoImportSince ?? "");
    if (
      !receiptsQuery.receipts.some((r) => Date.parse(r.purchasedAt) >= since)
    ) {
      return;
    }

    runningRef.current = true;
    void (async () => {
      const imported: AutoImportedReceipt[] = [];
      try {
        const candidates = (
          await fetchReceiptsSince(since).catch(() => [])
        ).filter(
          (r) =>
            !r.pantryAutoDeclined && !processedRef.current.has(r.receiptId),
        );
        for (const receipt of candidates) {
          const detail = await silpoApi
            .receiptDetail(receipt.receiptId)
            .catch(() => null);
          if (!detail) continue;
          const groceryItems = detail.items.filter(
            (item) =>
              item.pantryClaimedAt == null &&
              mapReceiptItemToCategory(item) === "groceries",
          );
          if (groceryItems.length === 0) {
            processedRef.current.add(receipt.receiptId);
            continue;
          }

          const claimedItemIds = await claim
            .claim(
              receipt.receiptId,
              groceryItems.map((i) => i.id),
              "auto",
            )
            .catch(() => null);
          if (claimedItemIds == null) continue;
          if (claimedItemIds.length === 0) {
            processedRef.current.add(receipt.receiptId);
            continue;
          }

          const claimedItems = groceryItems.filter((i) =>
            claimedItemIds.includes(i.id),
          );
          const pantryIndex = buildPantryIndex(pantryItemsRef.current);
          const rows = buildSilpoReplenishRows({
            items: claimedItems,
            pantryIndex,
            checkedState: {},
            keepFullState: {},
          });
          const toAdd = rowsToPantryItems(rows, receipt.purchasedAt);

          try {
            const lines = upsertRef.current(toAdd);
            imported.push({
              receiptId: receipt.receiptId,
              claimedItemIds,
              lines,
            });
            processedRef.current.add(receipt.receiptId);
          } catch {
            // Порядок кроків (спека § «Позначка живе на сервері…»): якщо
            // `upsertItem` кинув помилку, знімаємо бронювання без
            // відхилення чека - позиції лишаються звичайним «ще не в
            // коморі» для ручного повтору.
            await release
              .release(receipt.receiptId, claimedItemIds, false)
              .catch(() => undefined);
          }
        }
      } finally {
        runningRef.current = false;
        if (rerunRef.current) {
          rerunRef.current = false;
          setRerunTick((t) => t + 1);
        }
      }

      const addedCount = imported.reduce((n, r) => n + r.lines.length, 0);
      if (addedCount === 0) return;

      showUndoToast(toast, {
        msg: buildSilpoAutoImportToastMessage(addedCount, imported.length),
        onUndo: () => {
          // Один виклик на всі чеки: відкат рахує від знімка комори, і
          // окремі виклики на той самий продукт перезаписували б один одного.
          revertRef.current(imported.flatMap((r) => r.lines));
          for (const r of imported) {
            void release
              .release(r.receiptId, r.claimedItemIds, true)
              .catch(() => undefined);
          }
        },
      });
    })();
    // `pantryItems`/`upsertItemForAutoImport`/`revertReplenish` читаються
    // через рефи (оновлюються ефектом вище) - цей ефект перезапускається
    // лише на РЕАЛЬНУ зміну списку чеків чи тумблера, не на кожен рендер
    // `NutritionApp`.
  }, [
    enabled,
    syncState?.pantryAutoImportSince,
    receiptsQuery.receipts,
    rerunTick,
    claim,
    release,
    toast,
  ]);
}
