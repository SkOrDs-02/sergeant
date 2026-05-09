/**
 * Assets store for Finyk (mobile).
 *
 * Mirrors the shape used on web by the root `Finyk` container —
 * `manualAssets` (`finyk_assets`), `manualDebts` (`finyk_debts`),
 * `receivables` (`finyk_recv`), `hiddenAccounts` (`finyk_hidden`).
 *
 * Stage 8 PR #057k-tombstone: MMKV writes removed. Init reads MMKV
 * as a synchronous first-paint fallback; the SQLite overlay snaps in
 * once warm. Mutations flow solely through the dual-write pipeline.
 */

import { useCallback, useEffect, useState } from "react";

import { FINYK_BACKUP_STORAGE_KEYS } from "@sergeant/finyk-domain";
import type {
  AssetsDebt,
  AssetsReceivable,
  ManualAsset,
  MonoAccount,
  Transaction,
} from "@sergeant/finyk-domain/domain";

import { safeReadLS } from "@/lib/storage";
import { triggerFinykDualWrite } from "./dualWrite";
import {
  blobsFromArray,
  idsFromArray,
  stateWithSlice,
} from "./dualWrite/extract";
import { getCachedFinykSqliteState } from "./sqliteReader";
import { useFinykSqliteReadTick } from "./sqliteReadGate";

const KEY_ASSETS = FINYK_BACKUP_STORAGE_KEYS.manualAssets;
const KEY_DEBTS = FINYK_BACKUP_STORAGE_KEYS.manualDebts;
const KEY_RECV = FINYK_BACKUP_STORAGE_KEYS.receivables;
const KEY_HIDDEN = FINYK_BACKUP_STORAGE_KEYS.hiddenAccounts;

function read<T>(key: string, fallback: T): T {
  const v = safeReadLS<T>(key, fallback);
  return v == null ? fallback : v;
}

/**
 * Snapshot of every slice the Assets page reads. Accepted as a seed by
 * {@link useFinykAssetsStore} so tests can render the page deterministically.
 */
export interface FinykAssetsSeed {
  manualAssets?: ManualAsset[];
  manualDebts?: AssetsDebt[];
  receivables?: AssetsReceivable[];
  hiddenAccounts?: string[];
  accounts?: MonoAccount[];
  transactions?: Transaction[];
}

export interface UseFinykAssetsStoreReturn {
  /** Mono accounts — still seeded-only until the live Monobank client lands on mobile. */
  accounts: MonoAccount[];
  /** Transactions used by debt / receivable remainder selectors. */
  transactions: Transaction[];
  hiddenAccounts: string[];
  manualAssets: ManualAsset[];
  manualDebts: AssetsDebt[];
  receivables: AssetsReceivable[];
  setManualAssets: (next: ManualAsset[]) => void;
  setManualDebts: (next: AssetsDebt[]) => void;
  setReceivables: (next: AssetsReceivable[]) => void;
  setHiddenAccounts: (next: string[]) => void;
}

/**
 * Read-through MMKV hook for the four slices the Assets page owns.
 * `seed` lets tests pre-populate state without reaching into the MMKV
 * shim; passed values are written through on first mount so the rest of
 * the hook reads them via the same code path as production.
 */
export function useFinykAssetsStore(
  seed?: FinykAssetsSeed,
): UseFinykAssetsStoreReturn {
  const [manualAssets, setAssetsState] = useState<ManualAsset[]>(
    () => seed?.manualAssets ?? read<ManualAsset[]>(KEY_ASSETS, []),
  );
  const [manualDebts, setDebtsState] = useState<AssetsDebt[]>(
    () => seed?.manualDebts ?? read<AssetsDebt[]>(KEY_DEBTS, []),
  );
  const [receivables, setRecvState] = useState<AssetsReceivable[]>(
    () => seed?.receivables ?? read<AssetsReceivable[]>(KEY_RECV, []),
  );
  const [hiddenAccounts, setHiddenState] = useState<string[]>(
    () => seed?.hiddenAccounts ?? read<string[]>(KEY_HIDDEN, []),
  );

  // Stage 8 PR #057k-tombstone — overlay each persisted slice from
  // the local SQLite cache once it's warm. MMKV reads above stay as
  // a synchronous first-paint fallback; MMKV writes are gone.
  const sqliteCacheTick = useFinykSqliteReadTick();
  useEffect(() => {
    const cache = getCachedFinykSqliteState();
    if (cache.refreshedAt === null) return;
    setAssetsState(cache.manualAssets);
    // The Assets page consumes its own debt/receivable shapes
    // (`AssetsDebt`/`AssetsReceivable`) which extend the domain
    // primitives in `finyk-domain`; the SQLite cache stores the
    // canonical domain `Debt`/`Receivable` blob. The runtime shape is
    // identical (same JSON columns), so a structural cast is safe.
    setDebtsState(cache.manualDebts as AssetsDebt[]);
    setRecvState(cache.receivables as AssetsReceivable[]);
    setHiddenState(cache.hiddenAccounts);
  }, [sqliteCacheTick]);

  const setManualAssets = useCallback(
    (next: ManualAsset[]) => {
      const prev = manualAssets;
      setAssetsState(next);
      triggerFinykDualWrite(
        stateWithSlice("assets", blobsFromArray(prev)),
        stateWithSlice("assets", blobsFromArray(next)),
      );
    },
    [manualAssets],
  );
  const setManualDebts = useCallback(
    (next: AssetsDebt[]) => {
      const prev = manualDebts;
      setDebtsState(next);
      triggerFinykDualWrite(
        stateWithSlice("debts", blobsFromArray(prev)),
        stateWithSlice("debts", blobsFromArray(next)),
      );
    },
    [manualDebts],
  );
  const setReceivables = useCallback(
    (next: AssetsReceivable[]) => {
      const prev = receivables;
      setRecvState(next);
      triggerFinykDualWrite(
        stateWithSlice("receivables", blobsFromArray(prev)),
        stateWithSlice("receivables", blobsFromArray(next)),
      );
    },
    [receivables],
  );
  const setHiddenAccounts = useCallback(
    (next: string[]) => {
      const prev = hiddenAccounts;
      setHiddenState(next);
      triggerFinykDualWrite(
        stateWithSlice("hiddenAccounts", idsFromArray(prev)),
        stateWithSlice("hiddenAccounts", idsFromArray(next)),
      );
    },
    [hiddenAccounts],
  );

  // Mono accounts + transactions are not persisted here — they come
  // from the network layer (to be wired in a follow-up PR). For now we
  // accept them via the `seed` only so the render can already reflect
  // real data in tests / storybooks.
  const accounts = seed?.accounts ?? [];
  const transactions = seed?.transactions ?? [];

  return {
    accounts,
    transactions,
    hiddenAccounts,
    manualAssets,
    manualDebts,
    receivables,
    setManualAssets,
    setManualDebts,
    setReceivables,
    setHiddenAccounts,
  };
}
