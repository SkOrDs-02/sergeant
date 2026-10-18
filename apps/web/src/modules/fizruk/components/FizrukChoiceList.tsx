/**
 * Status: Active
 * Last validated: 2026-10-11
 */
import { useId, type ReactNode } from "react";

/** Вибір у формі: нативні radio на hairline, без модульного hue. */
export function FizrukChoiceList<V extends string>({
  items,
  value,
  onChange,
  ariaLabel,
  disabled = false,
}: {
  items: readonly {
    value: V;
    label: ReactNode;
    title?: string;
    ariaLabel?: string;
  }[];
  value: V;
  onChange: (value: V) => void;
  ariaLabel?: string;
  disabled?: boolean;
}) {
  const name = useId();
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className="divide-y divide-line"
    >
      {items.map((item) => (
        <label
          key={item.value}
          title={item.title}
          className="flex min-h-11 cursor-pointer items-center gap-3 py-2 text-style-label-lg text-text"
        >
          <input
            type="radio"
            name={name}
            value={item.value}
            checked={value === item.value}
            disabled={disabled}
            aria-label={item.ariaLabel}
            onChange={() => onChange(item.value)}
            data-compact
            className="h-[22px] w-[22px] shrink-0 accent-text"
          />
          <span>{item.label}</span>
        </label>
      ))}
    </div>
  );
}
