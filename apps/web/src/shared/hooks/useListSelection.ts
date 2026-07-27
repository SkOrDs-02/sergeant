import { useCallback, useMemo, useState } from "react";

/**
 * R2-UX-12 · Generic multi-select state for any list surface.
 *
 * Extracted from Finyk's `useTransactionSelection` so other modules
 * (meals, workout history, habits) can adopt the same batch-selection
 * interaction without re-implementing the `selectMode` + `Set<Id>`
 * bookkeeping and the identity-stable callbacks that memoized rows rely on.
 *
 * This hook is intentionally *domain-free*: it owns only the selection
 * state machine. Side effects (batch delete, undo toasts, etc.) stay in the
 * per-module hook that composes this one, because those are domain-specific.
 *
 * All returned callbacks are identity-stable across renders (empty dep
 * arrays + functional `setState`), so passing them to `React.memo`'d rows
 * does not defeat memoization.
 */
export interface UseListSelectionResult<Id> {
  /** Whether the list is in multi-select mode. */
  selectMode: boolean;
  /** Enter/exit select mode. Exiting also clears the selection. */
  setSelectMode: (v: boolean) => void;
  /** The currently selected ids. */
  selectedIds: Set<Id>;
  /** Number of selected ids (convenience for toolbars/counters). */
  selectedCount: number;
  /** Toggle a single id in/out of the selection. */
  toggleSelect: (id: Id) => void;
  /** Whether a given id is currently selected. */
  isSelected: (id: Id) => boolean;
  /** Select every id in `ids` (adds to the current selection). */
  selectAll: (ids: readonly Id[]) => void;
  /** Clear the selection but stay in select mode. */
  clearSelection: () => void;
  /** Exit select mode and clear the selection. */
  exitSelectMode: () => void;
}

export function useListSelection<Id = string>(): UseListSelectionResult<Id> {
  const [selectMode, setSelectModeState] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<Id>>(() => new Set());

  const toggleSelect = useCallback((id: Id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const isSelected = useCallback(
    (id: Id) => selectedIds.has(id),
    [selectedIds],
  );

  const selectAll = useCallback((ids: readonly Id[]) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const id of ids) next.add(id);
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const exitSelectMode = useCallback(() => {
    setSelectModeState(false);
    setSelectedIds(new Set());
  }, []);

  // Wrap `setSelectMode` so turning it OFF also clears the selection — the
  // single most common footgun when adopting select-mode elsewhere.
  const setSelectMode = useCallback((v: boolean) => {
    setSelectModeState(v);
    if (!v) setSelectedIds(new Set());
  }, []);

  const selectedCount = selectedIds.size;

  return useMemo(
    () => ({
      selectMode,
      setSelectMode,
      selectedIds,
      selectedCount,
      toggleSelect,
      isSelected,
      selectAll,
      clearSelection,
      exitSelectMode,
    }),
    [
      selectMode,
      setSelectMode,
      selectedIds,
      selectedCount,
      toggleSelect,
      isSelected,
      selectAll,
      clearSelection,
      exitSelectMode,
    ],
  );
}
