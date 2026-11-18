/**
 * Last validated: 2026-11-18
 * Status: Active
 *
 * Черга пропозицій «схоже на внутрішній переказ» для «Операцій». Винесено з
 * `Transactions.tsx` без зміни поведінки (2026-11-18), щоб сторінка лишалась
 * під Hard Rule #18 після додавання пошуку (Ф-2 а).
 */
import { useCallback, useMemo, useState } from "react";
import { useKyivDayNow } from "@shared/hooks/useKyivDayNow";
import { safeReadLS, safeWriteLS } from "@shared/lib/storage/storage";
import { getKyivDayKey } from "@shared/lib/time/kyivTime";
import {
  filterTransferSuggestions,
  findInternalTransferSuggestions,
  transferSuggestionPairKey,
} from "@sergeant/finyk-domain/domain/transferMatching";
import {
  FINYK_TRANSFER_SUGGESTION_REJECTED_KEY,
  FINYK_TRANSFER_SUGGESTION_SNOOZED_KEY,
} from "@sergeant/finyk-domain/storage-keys";
import type {
  Transaction,
  TxCategoriesMap,
} from "@sergeant/finyk-domain/domain/types";

export interface UseTransferSuggestionsParams {
  storageReady: boolean;
  activeTx: Transaction[];
  hiddenTxIds: string[];
  txCategories: TxCategoriesMap;
  jars: ReadonlyArray<{ monoJarId?: string | undefined }> | undefined;
}

export function useTransferSuggestions({
  storageReady,
  activeTx,
  hiddenTxIds,
  txCategories,
  jars,
}: UseTransferSuggestionsParams) {
  // Both actions below persist device-locally (no cross-device sync — see
  // `FINYK_TRANSFER_SUGGESTION_REJECTED_KEY` / `_SNOOZED_KEY` docs), so a
  // rejected/snoozed pair survives reload instead of only lasting for the
  // current page mount.
  const [rejectedTransferPairs, setRejectedTransferPairs] = useState<
    Set<string>
  >(
    () =>
      new Set(
        safeReadLS<string[]>(FINYK_TRANSFER_SUGGESTION_REJECTED_KEY, []) ?? [],
      ),
  );
  const [snoozedTransferPairs, setSnoozedTransferPairs] = useState<
    Record<string, string>
  >(
    () =>
      safeReadLS<Record<string, string>>(
        FINYK_TRANSFER_SUGGESTION_SNOOZED_KEY,
        {},
      ) ?? {},
  );

  // `jars` приходить новим масивом на кожен рендер FinykApp, тож у залежності
  // memo йде стабільний рядок id, а не сам масив.
  const jarIdsKey = (jars ?? []).flatMap((j) => j.monoJarId ?? []).join("|");
  const jarAccountIds = useMemo(
    () => new Set(jarIdsKey ? jarIdsKey.split("|") : []),
    [jarIdsKey],
  );

  const kyivNow = useKyivDayNow();
  const transferSuggestions = useMemo(() => {
    void kyivNow;
    // До прогріву вже підтверджені перекази ще без категорії й поверталися
    // б у чергу пропозицій цілою пачкою.
    if (!storageReady) return [];
    const hidden = new Set(hiddenTxIds);
    const raw = findInternalTransferSuggestions(
      activeTx.filter((tx) => !hidden.has(tx.id)),
      { txCategories, jarAccountIds },
    );
    return filterTransferSuggestions(raw, {
      rejectedPairKeys: rejectedTransferPairs,
      snoozedPairKeys: snoozedTransferPairs,
      todayKey: getKyivDayKey(),
    });
  }, [
    storageReady,
    activeTx,
    hiddenTxIds,
    txCategories,
    jarAccountIds,
    rejectedTransferPairs,
    snoozedTransferPairs,
    kyivNow,
  ]);
  const visibleTransferSuggestion = transferSuggestions[0] ?? null;
  const visibleTransferKey = visibleTransferSuggestion
    ? transferSuggestionPairKey(visibleTransferSuggestion)
    : null;

  const rejectTransferSuggestion = useCallback((key: string) => {
    setRejectedTransferPairs((current) => {
      if (current.has(key)) return current;
      const next = new Set(current);
      next.add(key);
      safeWriteLS(FINYK_TRANSFER_SUGGESTION_REJECTED_KEY, Array.from(next));
      return next;
    });
  }, []);

  const snoozeTransferSuggestion = useCallback((key: string) => {
    setSnoozedTransferPairs((current) => {
      const next = { ...current, [key]: getKyivDayKey() };
      safeWriteLS(FINYK_TRANSFER_SUGGESTION_SNOOZED_KEY, next);
      return next;
    });
  }, []);

  return {
    visibleTransferSuggestion,
    visibleTransferKey,
    rejectTransferSuggestion,
    snoozeTransferSuggestion,
  };
}
