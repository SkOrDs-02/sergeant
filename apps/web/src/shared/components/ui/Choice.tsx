import { useRef, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "@shared/lib/ui/cn";

/**
 * Sergeant Design System - ChoiceGroup (мова станів v3.1).
 *
 * Один прийом для «обрано» в усіх виборах форм: обране = заливка чорнилом
 * (`bg-text text-bg`, у темній токени перевертаються самі), необране =
 * панель із текстом чорнилом. Без обводу, тіні й hue модуля. Стан передає
 * `aria-checked`, а не текст «Обрано».
 *
 * - `tiles` - плитки в ряд або сітку (до 6 опцій, короткі підписи).
 *   Сітку задає `className` групи, наприклад `grid grid-cols-3`.
 * - `rows` - список рядків на hairline, обраний рядок заливається на всю
 *   ширину (багато опцій або довгі підписи).
 *
 * Семантика `radiogroup` + `radio`: одна зупинка Tab на групу, стрілки
 * переводять фокус і вибір по колу, Home / End на край, вимкнені пропускаються.
 * Вкладки й фільтри одного списку лишаються за `Segmented`.
 */

export type ChoiceVariant = "tiles" | "rows";
export type ChoiceSize = "md" | "sm";

export interface ChoiceItem<V extends string = string> {
  value: V;
  label: ReactNode;
  /** Другий рядок у `rows`: 14 другим сірим. */
  description?: ReactNode | undefined;
  ariaLabel?: string | undefined;
  disabled?: boolean | undefined;
}

export interface ChoiceGroupProps<V extends string = string> {
  items: ReadonlyArray<ChoiceItem<V>>;
  /** `null`, поки нічого не обрано: тоді Tab веде на першу доступну опцію. */
  value: V | null;
  onChange: (value: V) => void;
  variant?: ChoiceVariant | undefined;
  /** `sm` - дрібні плитки (швидкі суми, шкали): радіус 6. */
  size?: ChoiceSize | undefined;
  ariaLabel?: string | undefined;
  ariaLabelledBy?: string | undefined;
  disabled?: boolean | undefined;
  className?: string | undefined;
}

const NEXT_KEYS = new Set(["ArrowRight", "ArrowDown"]);
const PREV_KEYS = new Set(["ArrowLeft", "ArrowUp"]);

export function ChoiceGroup<V extends string = string>({
  items,
  value,
  onChange,
  variant = "tiles",
  size = "md",
  ariaLabel,
  ariaLabelledBy,
  disabled = false,
  className,
}: ChoiceGroupProps<V>) {
  const groupRef = useRef<HTMLDivElement>(null);
  const enabled = (item: ChoiceItem<V>) => !disabled && !item.disabled;
  const checkedIndex = items.findIndex(
    (item) => item.value === value && enabled(item),
  );
  const tabIndexOwner =
    checkedIndex >= 0 ? checkedIndex : items.findIndex(enabled);

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const { key } = event;
    const step = NEXT_KEYS.has(key) ? 1 : PREV_KEYS.has(key) ? -1 : 0;
    if (!step && key !== "Home" && key !== "End") return;
    const order = items
      .map((item, index) => (enabled(item) ? index : -1))
      .filter((index) => index >= 0);
    if (order.length === 0) return;
    event.preventDefault();
    const from = order.indexOf(Number(event.currentTarget.dataset["index"]));
    const to =
      key === "Home"
        ? order[0]
        : key === "End"
          ? order[order.length - 1]
          : order[(from + step + order.length) % order.length];
    if (to === undefined) return;
    const target = groupRef.current?.querySelector<HTMLButtonElement>(
      `[data-index="${to}"]`,
    );
    target?.focus();
    const item = items[to];
    if (item && item.value !== value) onChange(item.value);
  };

  const rows = variant === "rows";

  return (
    <div
      ref={groupRef}
      role="radiogroup"
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledBy}
      aria-disabled={disabled || undefined}
      className={cn(
        rows ? "flex flex-col divide-y divide-line" : "flex flex-wrap gap-2",
        className,
      )}
    >
      {items.map((item, index) => {
        const checked = index === checkedIndex;
        return (
          <button
            key={item.value}
            type="button"
            role="radio"
            aria-checked={checked}
            aria-label={item.ariaLabel}
            disabled={!enabled(item)}
            data-index={index}
            tabIndex={index === tabIndexOwner ? 0 : -1}
            onKeyDown={handleKeyDown}
            onClick={() => {
              if (!checked) onChange(item.value);
            }}
            className={cn(
              "min-h-[44px] touch-manipulation focus-ring",
              "motion-safe:transition-colors motion-safe:duration-fast",
              "disabled:cursor-not-allowed disabled:opacity-50",
              checked ? "bg-text text-bg" : "text-text",
              rows
                ? cn(
                    "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-style-label-lg",
                    !checked && "hover:bg-panel",
                  )
                : cn(
                    "inline-flex items-center justify-center px-3 text-center text-style-label font-semibold",
                    size === "sm" ? "rounded-segment" : "rounded-lg",
                    !checked && "bg-panel hover:bg-panelHi",
                  ),
            )}
          >
            {rows ? (
              <span className="min-w-0 flex-1">
                <span className="block">{item.label}</span>
                {item.description ? (
                  <span
                    className={cn(
                      "mt-0.5 block text-style-label",
                      checked ? "text-bg" : "text-muted",
                    )}
                  >
                    {item.description}
                  </span>
                ) : null}
              </span>
            ) : (
              item.label
            )}
          </button>
        );
      })}
    </div>
  );
}
