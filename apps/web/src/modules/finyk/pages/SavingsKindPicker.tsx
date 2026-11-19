import { useState, type ReactNode } from "react";
import { ChoiceGroup } from "@shared/components/ui/Choice";
import { messages } from "@shared/i18n";
import { localTodayKey } from "@sergeant/finyk-domain/domain/assets";
import type { ManualAsset } from "../hooks/useStorage";
import { SavingsAssetForm } from "./SavingsAssetForm";

const t = messages.finyk.savingsAssets;

export type SavingsKindChoice = "other" | "deposit" | "ovdp" | "fund";

const KINDS: readonly SavingsKindChoice[] = [
  "other",
  "deposit",
  "ovdp",
  "fund",
];

/**
 * Тип власного активу (спека `finyk-savings-assets.md`): «Інше» — стара
 * форма з ручною сумою, решта — рахунки з розрахунком вартості.
 */
export function SavingsKindPicker({
  value,
  onChange,
}: {
  value: SavingsKindChoice;
  onChange: (kind: SavingsKindChoice) => void;
}) {
  return (
    <div className="space-y-1">
      <ChoiceGroup<SavingsKindChoice>
        items={KINDS.map((k) => ({ value: k, label: t.kinds[k] }))}
        value={value}
        onChange={(kind) => {
          if (kind !== value) onChange(kind);
        }}
        ariaLabel={t.kindLabel}
        size="sm"
        className="grid grid-cols-4"
      />
      <p className="text-style-caption text-muted px-1">{t.kindHints[value]}</p>
    </div>
  );
}

/**
 * Обгортка полів нового власного активу у формі «Активів»: для «Інше»
 * показує стару форму (`children`), для депозиту, ОВДП, фонду —
 * `SavingsAssetForm`. Правка наявного активу (`enabled = false`) лишає
 * стару форму без вибору типу.
 */
export function SavingsKindSwitch({
  enabled,
  onAdd,
  onCancel,
  children,
}: {
  enabled: boolean;
  onAdd: (asset: ManualAsset) => void;
  onCancel: () => void;
  children: ReactNode;
}) {
  const [kind, setKind] = useState<SavingsKindChoice>("other");
  return (
    <>
      {enabled && <SavingsKindPicker value={kind} onChange={setKind} />}
      {enabled && kind !== "other" ? (
        <SavingsAssetForm
          kind={kind}
          today={localTodayKey()}
          onAdd={onAdd}
          onCancel={onCancel}
        />
      ) : (
        children
      )}
    </>
  );
}
