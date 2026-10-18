import { useId } from "react";

/** Взаємовиключний вибір у формі: нативні radio, рядки на hairline. */
export function RoutineChoiceList<V extends string | number>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: V | null;
  options: readonly { value: V; label: string }[];
  onChange: (value: V) => void;
}) {
  const name = useId();
  return (
    <div role="radiogroup" aria-label={label} className="divide-y divide-line">
      {options.map((option) => (
        <label
          key={option.value}
          className="flex min-h-11 cursor-pointer items-center gap-3 py-2 text-style-label-lg text-text"
        >
          <input
            type="radio"
            name={name}
            value={option.value}
            checked={value === option.value}
            onChange={() => onChange(option.value)}
            data-compact
            className="h-[22px] w-[22px] shrink-0 accent-text"
          />
          <span>{option.label}</span>
        </label>
      ))}
    </div>
  );
}
