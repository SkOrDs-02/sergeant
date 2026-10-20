import { useId, useRef, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "@shared/lib/ui/cn";
import { Icon } from "./Icon";

/**
 * Sergeant Design System - ChoiceGroup (мова станів v3.1).
 *
 * Один прийом для «обрано» в усіх виборах форм: обране = заливка чорнилом
 * (`bg-text text-bg`, у темній токени перевертаються самі), необране =
 * панель із текстом чорнилом; плитку тримає межа `border-control`. Без
 * тіні й hue модуля. Стан передає
 * `aria-checked`, а не текст «Обрано».
 *
 * - `tiles` - плитки в ряд або сітку (до 6 опцій, короткі підписи).
 *   Сітку задає `className` групи, наприклад `grid grid-cols-3`.
 * - `rows` - список рядків на hairline, обраний рядок заливається на всю
 *   ширину (багато опцій або довгі підписи).
 *
 * Одиничний вибір: семантика `radiogroup` + `radio`, одна зупинка Tab на
 * групу, стрілки переводять фокус і вибір по колу, Home / End на край,
 * вимкнені пропускаються.
 *
 * `multiple` (рішення власника 2026-10-20): семантика `group` + `checkbox`,
 * кожна опція - своя зупинка Tab, Space перемикає. Плитка заливається
 * чорнилом, як і в одиничному; рядок (`rows`) - це `ChoiceCheckbox`, де
 * чорнилом заливається позначка, а не весь рядок: у списках на кшталт
 * кошика позначено все одразу.
 *
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

interface ChoiceGroupBaseProps<V extends string> {
  items: ReadonlyArray<ChoiceItem<V>>;
  variant?: ChoiceVariant | undefined;
  /** `sm` - дрібні плитки (швидкі суми, шкали): радіус 6. */
  size?: ChoiceSize | undefined;
  ariaLabel?: string | undefined;
  ariaLabelledBy?: string | undefined;
  disabled?: boolean | undefined;
  className?: string | undefined;
}

export interface ChoiceGroupSingleProps<
  V extends string = string,
> extends ChoiceGroupBaseProps<V> {
  multiple?: false | undefined;
  /** `null`, поки нічого не обрано: тоді Tab веде на першу доступну опцію. */
  value: V | null;
  onChange: (value: V) => void;
}

export interface ChoiceGroupMultipleProps<
  V extends string = string,
> extends ChoiceGroupBaseProps<V> {
  multiple: true;
  value: ReadonlyArray<V>;
  onChange: (value: V[]) => void;
}

export type ChoiceGroupProps<V extends string = string> =
  ChoiceGroupSingleProps<V> | ChoiceGroupMultipleProps<V>;

const NEXT_KEYS = new Set(["ArrowRight", "ArrowDown"]);
const PREV_KEYS = new Set(["ArrowLeft", "ArrowUp"]);

const OPTION_BASE = cn(
  "min-h-[44px] touch-manipulation focus-ring",
  "motion-safe:transition-colors motion-safe:duration-fast",
  "disabled:cursor-not-allowed disabled:opacity-50",
);

// Плитка живе на картках і в аркушах, тобто на тій самій `panel`, тож
// необрану тримає межа контролу (3:1), а не заливка. В обраної межа кольору
// заливки й не видна.
function tileClass(checked: boolean, size: ChoiceSize) {
  return cn(
    OPTION_BASE,
    "inline-flex items-center justify-center border px-3 text-center text-style-label font-semibold",
    size === "sm" ? "rounded-segment" : "rounded-lg",
    checked
      ? "border-text bg-text text-bg"
      : "border-control bg-panel text-text hover:bg-panelHi",
  );
}

export interface ChoiceCheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: ReactNode;
  description?: ReactNode | undefined;
  ariaLabel?: string | undefined;
  disabled?: boolean | undefined;
  className?: string | undefined;
}

/**
 * Рядок мультивибору: позначка 20 px, залита чорнилом, коли позначено.
 * Окремо від групи - для рядка, що несе сусідні контроли (кількість, заміна),
 * які не можуть жити всередині кнопки; групу тоді тримає `role="group"`
 * списку навколо.
 */
export function ChoiceCheckbox({
  checked,
  onChange,
  label,
  description,
  ariaLabel,
  disabled = false,
  className,
}: ChoiceCheckboxProps) {
  const id = useId();
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={ariaLabel}
      aria-labelledby={ariaLabel ? undefined : `${id}-label`}
      aria-describedby={description ? `${id}-hint` : undefined}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        OPTION_BASE,
        "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-style-label-lg text-text enabled:hover:bg-panelHi",
        className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          "flex h-5 w-5 shrink-0 items-center justify-center rounded-check border",
          checked ? "border-text bg-text text-bg" : "border-control bg-panel",
        )}
      >
        {checked ? <Icon name="check" size="xs" strokeWidth={3} /> : null}
      </span>
      <span className="min-w-0 flex-1">
        <span id={`${id}-label`} className="block min-w-0">
          {label}
        </span>
        {description ? (
          <span
            id={`${id}-hint`}
            className="mt-0.5 block min-w-0 text-style-label text-muted"
          >
            {description}
          </span>
        ) : null}
      </span>
    </button>
  );
}

export function ChoiceGroup<V extends string = string>(
  props: ChoiceGroupProps<V>,
) {
  const {
    items,
    variant = "tiles",
    size = "md",
    ariaLabel,
    ariaLabelledBy,
    disabled = false,
    className,
  } = props;
  const groupRef = useRef<HTMLDivElement>(null);
  const enabled = (item: ChoiceItem<V>) => !disabled && !item.disabled;
  const rows = variant === "rows";
  const groupClass = cn(
    rows ? "flex flex-col divide-y divide-line" : "flex flex-wrap gap-2",
    className,
  );

  if (props.multiple) {
    const picked = new Set<V>(props.value);
    const toggle = (value: V) =>
      props.onChange(
        picked.has(value)
          ? props.value.filter((v) => v !== value)
          : [...props.value, value],
      );
    return (
      <div
        role="group"
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
        aria-disabled={disabled || undefined}
        className={groupClass}
      >
        {items.map((item) =>
          rows ? (
            <ChoiceCheckbox
              key={item.value}
              checked={picked.has(item.value)}
              onChange={() => toggle(item.value)}
              label={item.label}
              description={item.description}
              ariaLabel={item.ariaLabel}
              disabled={!enabled(item)}
            />
          ) : (
            <button
              key={item.value}
              type="button"
              role="checkbox"
              aria-checked={picked.has(item.value)}
              aria-label={item.ariaLabel}
              disabled={!enabled(item)}
              onClick={() => toggle(item.value)}
              className={tileClass(picked.has(item.value), size)}
            >
              {item.label}
            </button>
          ),
        )}
      </div>
    );
  }

  const { value, onChange } = props;
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

  return (
    <div
      ref={groupRef}
      role="radiogroup"
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledBy}
      aria-disabled={disabled || undefined}
      className={groupClass}
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
            className={
              rows
                ? cn(
                    OPTION_BASE,
                    "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-style-label-lg",
                    checked ? "bg-text text-bg" : "text-text hover:bg-panel",
                  )
                : tileClass(checked, size)
            }
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
