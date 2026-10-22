import { ChoiceGroup } from "@shared/components/ui/Choice";

/** Режим і бік атласу: взаємовиключний вибір без пігулок. */
export function BodyAtlasSegGroup<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: readonly { id: T; label: string }[];
  value: T;
  onChange: (next: T) => void;
  ariaLabel: string;
}) {
  return (
    <ChoiceGroup<T>
      ariaLabel={ariaLabel}
      className="grid auto-cols-fr grid-flow-col"
      items={options.map((option) => ({
        value: option.id,
        label: option.label,
      }))}
      value={value}
      onChange={onChange}
    />
  );
}
