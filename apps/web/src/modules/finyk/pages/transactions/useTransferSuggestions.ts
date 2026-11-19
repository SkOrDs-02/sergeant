/**
 * Last validated: 2026-11-19
 * Status: Active
 *
 * Черга пропозицій «схоже на внутрішній переказ» на екрані операцій і
 * відповіді на них.
 *
 * **Питаємо всі одразу й не повторюємось (фідбек власника 2026-11-19).**
 * Раніше екран показував одну пропозицію за раз (`[0]`), а відмова
 * памʼятала лише ПАРУ. Звідси дві скарги: «знаходить нові, які не питало
 * раніше» (після відповіді спливала наступна з черги) і «перепитує ті ж самі
 * операції» (відхилена нога ставала найкращим збігом для нової операції з
 * тією ж сумою, і питання поверталось з іншим партнером). Тепер:
 *   - хук віддає ВЕСЬ список, картка показує всі пропозиції разом;
 *   - «Не переказ» памʼятає обидві ОПЕРАЦІЇ (`reviewedTxIds`), а не лише
 *     пару; ключ пари теж пишеться — для сумісності зі старими відмовами;
 *   - «Не зараз» відкладає на добу всі показані пропозиції разом;
 *   - підтверджена пара позначає обидві ноги переказом, і матчер більше не
 *     дає їм нового партнера (`transferMatching.ts`, закриті пари).
 *
 * Відмови й відкладення живуть на пристрої (`storageKeys.ts`); підтвердження
 * — це категорія операції, тож воно синхронізується разом із нею.
 *
 * AI-CONTEXT: «після оновлень наново перепитує» (той самий фідбек) — це
 * гонка з bootstrap-ом сховища. `webKVStore` тримає ці ключі в SQLite
 * `kv_store`, а до кінця асинхронного bootstrap читає сирий `localStorage`,
 * де їх немає (`core/db/storageReady.ts`). На жорсткому перезавантаженні,
 * зокрема після оновлення PWA, екран монтувався раніше, зчитував порожні
 * відмови один раз в ініціалізаторі `useState` і показував уже відхилені
 * пари знову; після SPA-переходу їх не було, бо сховище вже прогріте
 * (відтворено в Chromium 2026-11-19). Тому відповіді перечитуються, щойно
 * `useStorageReady` стає `true`, а до того пропозицій немає взагалі.
 */
import { useCallback, useMemo, useState } from "react";
import { useKyivDayNow } from "@shared/hooks/useKyivDayNow";
import { useStorageReady } from "../../../../core/db/storageReady";
import { safeReadLS, safeWriteLS } from "@shared/lib/storage/storage";
import { getKyivDayKey } from "@shared/lib/time/kyivTime";
import {
  filterTransferSuggestions,
  findInternalTransferSuggestions,
  transferSuggestionPairKey,
  type InternalTransferSuggestion,
} from "@sergeant/finyk-domain/domain/transferMatching";
import {
  FINYK_TRANSFER_SUGGESTION_REJECTED_KEY,
  FINYK_TRANSFER_SUGGESTION_REJECTED_TX_KEY,
  FINYK_TRANSFER_SUGGESTION_SNOOZED_KEY,
} from "@sergeant/finyk-domain/storage-keys";
import { INTERNAL_TRANSFER_ID } from "@sergeant/finyk-domain/constants";
import type {
  Transaction,
  TxCategoriesMap,
} from "@sergeant/finyk-domain/domain/types";

export interface UseTransferSuggestionsArgs {
  /** `false`, поки SQLite-кеш не прогрітий: підтверджені ще без категорії. */
  storageReady: boolean;
  activeTx: readonly Transaction[];
  hiddenTxIds: readonly string[];
  txCategories: TxCategoriesMap;
  jars?: ReadonlyArray<{ monoJarId?: string | undefined }> | undefined;
  overrideCategory: (id: string, catId: string | null) => void;
}

export interface UseTransferSuggestionsResult {
  suggestions: InternalTransferSuggestion[];
  confirm: (suggestion: InternalTransferSuggestion) => void;
  reject: (suggestion: InternalTransferSuggestion) => void;
  /** «Не зараз» для однієї пропозиції — до наступної київської доби. */
  snooze: (suggestion: InternalTransferSuggestion) => void;
  /** Підтверджує всі показані пропозиції одним тапом. */
  confirmAll: () => void;
  /** «Не зараз» для всіх показаних — до наступної київської доби. */
  snoozeAll: () => void;
}

interface TransferDecisions {
  rejectedPairs: Set<string>;
  rejectedTxIds: Set<string>;
  snoozedPairs: Record<string, string>;
}

function readStringSet(key: string): Set<string> {
  return new Set(safeReadLS<string[]>(key, []) ?? []);
}

function readDecisions(): TransferDecisions {
  return {
    rejectedPairs: readStringSet(FINYK_TRANSFER_SUGGESTION_REJECTED_KEY),
    rejectedTxIds: readStringSet(FINYK_TRANSFER_SUGGESTION_REJECTED_TX_KEY),
    snoozedPairs:
      safeReadLS<Record<string, string>>(
        FINYK_TRANSFER_SUGGESTION_SNOOZED_KEY,
        {},
      ) ?? {},
  };
}

export function useTransferSuggestions({
  storageReady,
  activeTx,
  hiddenTxIds,
  txCategories,
  jars,
  overrideCategory,
}: UseTransferSuggestionsArgs): UseTransferSuggestionsResult {
  const kvReady = useStorageReady();
  const [decisions, setDecisions] = useState<TransferDecisions>(readDecisions);
  // Прочитане до bootstrap-у — порожній `localStorage`, не справжні
  // відповіді: щойно сховище прогрілось, читаємо їх заново (див. шапку).
  const [readWithKv, setReadWithKv] = useState(kvReady);
  if (kvReady && !readWithKv) {
    setReadWithKv(true);
    setDecisions(readDecisions());
  }

  // `jars` приходить новим масивом на кожен рендер FinykApp, тож у залежності
  // memo йде стабільний рядок id, а не сам масив.
  const jarIdsKey = (jars ?? []).flatMap((j) => j.monoJarId ?? []).join("|");
  const jarAccountIds = useMemo(
    () => new Set(jarIdsKey ? jarIdsKey.split("|") : []),
    [jarIdsKey],
  );

  const kyivNow = useKyivDayNow();
  const suggestions = useMemo(() => {
    void kyivNow;
    // До прогріву вже підтверджені перекази ще без категорії, а відмови ще
    // не прочитані — обидва стани повернули б у чергу вже вирішені пари.
    if (!storageReady || !readWithKv) return [];
    const hidden = new Set(hiddenTxIds);
    const raw = findInternalTransferSuggestions(
      activeTx.filter((tx) => !hidden.has(tx.id)),
      { txCategories, jarAccountIds },
    );
    return filterTransferSuggestions(raw, {
      rejectedPairKeys: decisions.rejectedPairs,
      reviewedTxIds: decisions.rejectedTxIds,
      snoozedPairKeys: decisions.snoozedPairs,
      todayKey: getKyivDayKey(),
    });
  }, [
    storageReady,
    readWithKv,
    activeTx,
    hiddenTxIds,
    txCategories,
    jarAccountIds,
    decisions,
    kyivNow,
  ]);

  const confirm = useCallback(
    (suggestion: InternalTransferSuggestion) => {
      overrideCategory(suggestion.outgoing.id, INTERNAL_TRANSFER_ID);
      overrideCategory(suggestion.incoming.id, INTERNAL_TRANSFER_ID);
    },
    [overrideCategory],
  );

  const reject = useCallback((suggestion: InternalTransferSuggestion) => {
    setDecisions((current) => {
      const rejectedPairs = new Set(current.rejectedPairs);
      rejectedPairs.add(transferSuggestionPairKey(suggestion));
      const rejectedTxIds = new Set(current.rejectedTxIds);
      rejectedTxIds.add(suggestion.outgoing.id);
      rejectedTxIds.add(suggestion.incoming.id);
      // Ключ пари — для сумісності зі старими відмовами; памʼять про
      // операції — щоб жодна з них не повернулась з іншим партнером.
      safeWriteLS(
        FINYK_TRANSFER_SUGGESTION_REJECTED_KEY,
        Array.from(rejectedPairs),
      );
      safeWriteLS(
        FINYK_TRANSFER_SUGGESTION_REJECTED_TX_KEY,
        Array.from(rejectedTxIds),
      );
      return { ...current, rejectedPairs, rejectedTxIds };
    });
  }, []);

  const confirmAll = useCallback(() => {
    // `overrideCategory` пише функціональним оновленням, тож серія викликів
    // в одному тіку не затирає попередні.
    for (const suggestion of suggestions) confirm(suggestion);
  }, [suggestions, confirm]);

  const snoozePairs = useCallback(
    (pairs: readonly InternalTransferSuggestion[]) => {
      if (pairs.length === 0) return;
      const today = getKyivDayKey();
      setDecisions((current) => {
        const snoozedPairs = { ...current.snoozedPairs };
        for (const suggestion of pairs) {
          snoozedPairs[transferSuggestionPairKey(suggestion)] = today;
        }
        safeWriteLS(FINYK_TRANSFER_SUGGESTION_SNOOZED_KEY, snoozedPairs);
        return { ...current, snoozedPairs };
      });
    },
    [],
  );

  const snooze = useCallback(
    (suggestion: InternalTransferSuggestion) => snoozePairs([suggestion]),
    [snoozePairs],
  );

  const snoozeAll = useCallback(
    () => snoozePairs(suggestions),
    [snoozePairs, suggestions],
  );

  return { suggestions, confirm, reject, snooze, confirmAll, snoozeAll };
}
