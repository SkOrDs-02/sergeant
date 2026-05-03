/**
 * Toolbar that lets the user enter "select 2-3 items" mode and turn the
 * selection into a superset or a circuit. Lives at the top of the
 * `ActiveWorkoutPanel` items list. Hidden while the workout is finished
 * or has fewer than two items.
 *
 * Group flavour mirrors `WorkoutGroup.type`.
 */
type WorkoutGroupType = "circuit" | "superset";

export interface WorkoutGroupingControlsProps {
  /** Number of items currently checked. */
  selectedCount: number;
  /** Whether we are currently in "select items" mode. */
  selectMode: boolean;
  onEnterSelectMode: () => void;
  onCancelSelectMode: () => void;
  onCreateGroup: (type: WorkoutGroupType) => void;
}

export function WorkoutGroupingControls({
  selectedCount,
  selectMode,
  onEnterSelectMode,
  onCancelSelectMode,
  onCreateGroup,
}: WorkoutGroupingControlsProps) {
  const tooFew = selectedCount < 2;
  const tooMany = selectedCount > 3;
  const disabled = tooFew || tooMany;

  return (
    <div className="flex items-center gap-2">
      {!selectMode ? (
        <button
          type="button"
          className="text-xs px-3 py-1.5 rounded-xl border border-line text-subtle hover:text-text hover:bg-panelHi transition-colors"
          onClick={onEnterSelectMode}
        >
          ⊕ Об{"'"}єднати в суперсет
        </button>
      ) : (
        <>
          <button
            type="button"
            className="text-xs px-3 py-1.5 rounded-xl border border-success/40 text-success bg-success/10 hover:bg-success/20 transition-colors disabled:opacity-40"
            disabled={disabled}
            onClick={() => onCreateGroup("superset")}
            title="Обери 2-3 вправи"
          >
            Суперсет ({selectedCount}/3)
          </button>
          <button
            type="button"
            className="text-xs px-3 py-1.5 rounded-xl border border-fizruk/40 text-fizruk bg-fizruk/10 hover:bg-fizruk/20 transition-colors disabled:opacity-40"
            disabled={disabled}
            onClick={() => onCreateGroup("circuit")}
            title="Обери 2-3 вправи"
          >
            Коло ({selectedCount}/3)
          </button>
          <button
            type="button"
            className="text-xs px-3 py-1.5 rounded-xl border border-line text-subtle hover:text-text transition-colors"
            onClick={onCancelSelectMode}
          >
            Скасувати
          </button>
        </>
      )}
    </div>
  );
}
