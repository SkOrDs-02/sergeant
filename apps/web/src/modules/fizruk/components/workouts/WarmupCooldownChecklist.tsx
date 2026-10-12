/**
 * Last validated: 2026-09-03
 * Status: Active
 */
interface ChecklistItem {
  id: string;
  label: string;
  done: boolean;
}

interface WarmupCooldownChecklistProps {
  title: string;
  items: ChecklistItem[] | null | undefined;
  onToggle: (id: string) => void;
  onInit: () => void;
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
 *
 * Колір один і нейтральний, той самий, що в `WorkoutTimeEditor` і рядку
 * нотаток: помаранчева й блакитна пунктирні рамки читались як два різні
 * віджети й додавали шуму панелі (звіт 2026-09-03).
 */
export function WarmupCooldownChecklist({
  title,
  items,
  onToggle,
  onInit,
}: WarmupCooldownChecklistProps) {
  if (!items) {
    return (
      <div className="rounded-xl border border-line bg-panelHi px-3 py-2 flex items-center justify-between gap-2 min-h-[44px]">
        <span className="text-style-caption text-subtle">{title}</span>
        <button
          type="button"
          className="focus-ring min-h-[44px] -my-2 px-2 rounded-lg text-style-caption font-semibold text-text hover:opacity-80 transition-opacity"
          onClick={onInit}
        >
          Додати
        </button>
      </div>
    );
  }

  const doneCount = items.filter((x) => x.done).length;
  const total = items.length;

  return (
    <details
      className="rounded-xl border border-line bg-panelHi px-3 py-2"
      open={doneCount < total}
    >
      <summary className="text-style-caption text-subtle cursor-pointer select-none flex items-center justify-between min-h-[28px]">
        <span>{title}</span>
        <span
          className={`ml-2 text-style-caption font-bold tabular-nums ${doneCount === total ? "text-text" : "text-text"}`}
        >
          {doneCount}/{total}
        </span>
      </summary>
      <ul className="mt-2 space-y-1.5">
        {items.map((item) => (
          <li key={item.id} className="flex items-center gap-2">
            <button
              type="button"
              className="focus-ring flex h-11 w-11 shrink-0 items-center justify-center rounded-lg"
              aria-pressed={item.done}
              onClick={() => onToggle(item.id)}
              aria-label={
                item.done
                  ? `${item.label}: позначити як незавершене`
                  : `${item.label}: позначити як завершене`
              }
            >
              <span
                aria-hidden
                className={`flex h-[22px] w-[22px] items-center justify-center rounded-[3px] border ${item.done ? "border-text bg-text text-bg" : "border-line bg-bg"}`}
              >
                {item.done ? "✓" : null}
              </span>
            </button>
            <span
              className={`text-style-caption ${item.done ? "line-through text-subtle" : "text-text"}`}
            >
              {item.label}
            </span>
          </li>
        ))}
      </ul>
    </details>
  );
}
