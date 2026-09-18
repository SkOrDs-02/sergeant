import { useSyncExternalStore } from "react";
import {
  type FinykManualExpenseConflict,
  getFinykManualExpenseConflictsSnapshot,
  subscribeFinykManualExpenseConflicts,
} from "./store";

/**
 * React hook that subscribes a component to the finyk manual-expense
 * conflict store. Reads through `useSyncExternalStore` so concurrent
 * React doesn't tear when a conflict is recorded mid-render.
 *
 * The returned array reference is stable as long as the underlying
 * conflicts list is unchanged (store mutations always swap in a fresh
 * array), so it's safe to pass directly into memo-dependencies without
 * `useMemo`-ing again.
 */
export function useFinykManualExpenseConflicts(): ReadonlyArray<FinykManualExpenseConflict> {
  const snapshot = useSyncExternalStore(
    subscribeFinykManualExpenseConflicts,
    getFinykManualExpenseConflictsSnapshot,
    // SSR snapshot — same reference as initial client snapshot since
    // module-level state starts empty. Prevents hydration warnings if
    // the banner ever renders на сервері.
    getFinykManualExpenseConflictsSnapshot,
  );
  return snapshot.conflicts;
}
