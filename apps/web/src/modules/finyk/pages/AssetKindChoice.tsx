import { ChoiceGroup } from "@shared/components/ui/Choice";
import { messages } from "@shared/i18n";

const t = messages.finyk.assetKind;

export type AssetKind = "asset" | "receivable";

/** Тип нового активу: «Своє» чи «Мені винні» (redesign v3.2). */
export function AssetKindChoice({
  value,
  onChange,
}: {
  value: AssetKind;
  onChange: (kind: AssetKind) => void;
}) {
  return (
    <ChoiceGroup<AssetKind>
      items={[
        { value: "asset", label: t.own },
        { value: "receivable", label: t.receivable },
      ]}
      value={value}
      onChange={(kind) => {
        if (kind !== value) onChange(kind);
      }}
      ariaLabel={t.label}
      className="grid grid-cols-2"
    />
  );
}
