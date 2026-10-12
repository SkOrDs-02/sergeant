import { FizrukChoiceList } from "./FizrukChoiceList";

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
    <FizrukChoiceList<T>
      ariaLabel={ariaLabel}
      items={options.map((option) => ({
        value: option.id,
        label: option.label,
      }))}
      value={value}
      onChange={onChange}
    />
  );
}
