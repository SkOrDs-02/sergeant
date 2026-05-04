/**
 * MMKV-backed Assets store for Finyk (mobile).
 *
 * Mirrors the shape used on web by the root `Finyk` container —
 * `manualAssets` (`finyk_assets`), `manualDebts` (`finyk_debts`),
 * `receivables` (`finyk_recv`), `hiddenAccounts` (`finyk_hidden`). All
 * four are persisted independently under the canonical keys declared
 * in `@sergeant/finyk-domain/storage-keys` so the mobile port can
 * consume a JSON backup exported from the web build unchanged.
 *
 * This hook is deliberately local to `modules/finyk/lib/` — the top
 * Finyk store is scheduled for a later PR (#453's siblings). We only
 * need the four slices the Assets page owns here, plus a seam for
 * tests to inject a pre-populated state.
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

import { _getMMKVInstance, safeReadLS, safeWriteLS } from "@/lib/storage";
import { enqueueChange } from "@/sync/enqueue";
import { isFinykDualWriteRegistered, triggerFinykDualWrite } from "./dualWrite";
import {
  blobsFromArray,
  idsFromArray,
  stateWithSlice,
} from "./dualWrite/extract";
import { getCachedFinykSqliteState } from "./sqliteReader";
import { useFinykSqliteReadGate } from "./sqliteReadGate";

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

  // On first mount, flush any seed values through MMKV so both consumers
  // of this hook (and the change-listener below) see the same state.
  useEffect(() => {
    if (!seed) return;
    if (seed.manualAssets) safeWriteLS(KEY_ASSETS, seed.manualAssets);
    if (seed.manualDebts) safeWriteLS(KEY_DEBTS, seed.manualDebts);
    if (seed.receivables) safeWriteLS(KEY_RECV, seed.receivables);
    if (seed.hiddenAccounts) safeWriteLS(KEY_HIDDEN, seed.hiddenAccounts);
    // Intentionally only runs once — `seed` is expected to be stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Pick up writes from other consumers of these keys.
  useEffect(() => {
    const mmkv = _getMMKVInstance();
    const sub = mmkv.addOnValueChangedListener((changedKey) => {
      switch (changedKey) {
        case KEY_ASSETS:
          setAssetsState(read<ManualAsset[]>(KEY_ASSETS, []));
          break;
        case KEY_DEBTS:
          setDebtsState(read<AssetsDebt[]>(KEY_DEBTS, []));
          break;
        case KEY_RECV:
          setRecvState(read<AssetsReceivable[]>(KEY_RECV, []));
          break;
        case KEY_HIDDEN:
          setHiddenState(read<string[]>(KEY_HIDDEN, []));
          break;
        default:
          break;
      }
    });
    return () => sub.remove();
  }, []);

  // Stage 4 PR #037 — overlay each persisted slice from the local
  // SQLite cache once it's warm and the read flag is on. MMKV
  // first-paint reads above stay as a fallback.
  const { enabled: sqliteReadEnabled, tick: sqliteCacheTick } =
    useFinykSqliteReadGate();
  useEffect(() => {
    if (!sqliteReadEnabled) return;
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
  }, [sqliteReadEnabled, sqliteCacheTick]);

  const setManualAssets = useCallback(
    (next: ManualAsset[]) => {
      const prev = manualAssets;
      setAssetsState(next);
      safeWriteLS(KEY_ASSETS, next);
      enqueueChange(KEY_ASSETS);
      if (isFinykDualWriteRegistered()) {
        triggerFinykDualWrite(
          stateWithSlice("assets", blobsFromArray(prev)),
          stateWithSlice("assets", blobsFromArray(next)),
        );
      }
    },
    [manualAssets],
  );
  const setManualDebts = useCallback(
    (next: AssetsDebt[]) => {
      const prev = manualDebts;
      setDebtsState(next);
      safeWriteLS(KEY_DEBTS, next);
      enqueueChange(KEY_DEBTS);
      if (isFinykDualWriteRegistered()) {
        triggerFinykDualWrite(
          stateWithSlice("debts", blobsFromArray(prev)),
          stateWithSlice("debts", blobsFromArray(next)),
        );
      }
    },
    [manualDebts],
  );
  const setReceivables = useCallback(
    (next: AssetsReceivable[]) => {
      const prev = receivables;
      setRecvState(next);
      safeWriteLS(KEY_RECV, next);
      enqueueChange(KEY_RECV);
      if (isFinykDualWriteRegistered()) {
        triggerFinykDualWrite(
          stateWithSlice("receivables", blobsFromArray(prev)),
          stateWithSlice("receivables", blobsFromArray(next)),
        );
      }
    },
    [receivables],
  );
  const setHiddenAccounts = useCallback(
    (next: string[]) => {
      const prev = hiddenAccounts;
      setHiddenState(next);
      safeWriteLS(KEY_HIDDEN, next);
      enqueueChange(KEY_HIDDEN);
      if (isFinykDualWriteRegistered()) {
        triggerFinykDualWrite(
          stateWithSlice("hiddenAccounts", idsFromArray(prev)),
          stateWithSlice("hiddenAccounts", idsFromArray(next)),
        );
      }
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
