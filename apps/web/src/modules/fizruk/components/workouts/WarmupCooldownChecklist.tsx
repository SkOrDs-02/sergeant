interface ChecklistItem {
  id: string;
  label: string;
  done: boolean;
}

interface ChecklistColor {
  border: string;
  text: string;
}

interface WarmupCooldownChecklistProps {
  title: string;
  items: ChecklistItem[] | null | undefined;
  onToggle: (id: string) => void;
  onInit: () => void;
  color: ChecklistColor;
}

/**
 * Collapsible checklist for the warm-up / cool-down sections of a workout.
 *
 * When `items` is null/undefined, renders a "[Title] · Додати" prompt that
 * calls `onInit` to seed defaults (`makeDefaultWarmup` / `makeDefaultCooldown`).
 * When items exist, the `<details>` defaults to open while there are
 * unchecked items and collapses automatically once the user finishes the
 * full list — the count badge changes color to `text-success` to signal
 * completion.
 */
export function WarmupCooldownChecklist({
  title,
  items,
  onToggle,
  onInit,
  color,
}: WarmupCooldownChecklistProps) {
  if (!items) {
    return (
      <div
        className={`rounded-xl border border-dashed ${color.border} px-3 py-2.5 flex items-center justify-between gap-2`}
      >
        <span className={`text-xs font-semibold ${color.text}`}>{title}</span>
        <button
          type="button"
          className={`text-xs px-3 py-1.5 rounded-xl border ${color.border} ${color.text} hover:opacity-80 transition-opacity`}
          onClick={onInit}
        >
          Додати
        </button>
      </div>
    );
  }

  const doneCount = (items || []).filter((x: ChecklistItem) => x.done).length;
  const total = (items || []).length;

  return (
    <details
      className={`rounded-xl border ${color.border} bg-panelHi/50 px-3 py-2`}
      open={doneCount < total}
    >
      <summary
        className={`text-xs font-semibold ${color.text} cursor-pointer select-none flex items-center justify-between`}
      >
        <span>{title}</span>
        <span
          className={`ml-2 text-2xs font-bold tabular-nums ${doneCount === total ? "text-success" : color.text}`}
        >
          {doneCount}/{total}
        </span>
      </summary>
      <ul className="mt-2 space-y-1.5">
        {(items || []).map((item: ChecklistItem) => (
          <li key={item.id} className="flex items-center gap-2">
            <button
              type="button"
              className={`w-5 h-5 rounded-xl border flex items-center justify-center shrink-0 transition-colors ${item.done ? "bg-success-strong border-success-strong text-white" : "border-line bg-bg"}`}
              onClick={() => onToggle(item.id)}
              aria-label={
                item.done
                  ? "Позначити як незавершене"
                  : "Позначити як завершене"
              }
            >
              {item.done && (
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                  <path
                    d="M2 5l2.5 2.5L8 3"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              )}
            </button>
            <span
              className={`text-xs ${item.done ? "line-through text-subtle" : "text-text"}`}
            >
              {item.label}
            </span>
          </li>
        ))}
      </ul>
    </details>
  );
}
