/**
 * Last validated: 2026-10-08
 * Status: Active
 *
 * Поля власного продукту: назва, КБЖВ на 100 г і порції. Спільні для
 * `PackageEntryStep` і форми редагування в «Мої продукти».
 */
import { Input } from "@shared/components/ui/Input";
import { messages } from "@shared/i18n/uk";
import { NAME_MAX_LEN } from "@shared/lib/text/limits";
import type { FoodDraft } from "./foodDraft";
import { PortionRows } from "./PortionRows";

const MACRO_FIELDS = [
  ["kcal", "Ккал / 100 г", "350"],
  ["protein_g", "Білки / 100 г", "12"],
  ["fat_g", "Жири / 100 г", "6"],
  ["carbs_g", "Вуглеводи / 100 г", "60"],
] as const;

interface FoodFieldsProps {
  idPrefix: string;
  draft: FoodDraft;
  portionErrors?: Record<string, string> | undefined;
  onChange: (next: FoodDraft) => void;
}

export function FoodFields({
  idPrefix,
  draft,
  portionErrors,
  onChange,
}: FoodFieldsProps) {
  const t = messages.nutrition.myFoods;
  const set = (patch: Partial<FoodDraft>) => onChange({ ...draft, ...patch });
  return (
    <>
      <label className="block" htmlFor={`${idPrefix}-name`}>
        <span className="mb-1 block text-style-caption text-text">
          {t.nameLabel}
        </span>
        <Input
          id={`${idPrefix}-name`}
          value={draft.name}
          onChange={(event) => set({ name: event.target.value })}
          placeholder={t.namePlaceholder}
          maxLength={NAME_MAX_LEN}
          showCharCount={false}
        />
      </label>
      <div className="grid grid-cols-2 gap-2">
        {MACRO_FIELDS.map(([key, label, placeholder]) => (
          <label key={key} className="block">
            <span className="mb-1 block text-style-caption text-text">
              {label}
            </span>
            <Input
              value={draft[key]}
              onChange={(event) => set({ [key]: event.target.value })}
              inputMode="decimal"
              placeholder={placeholder}
              maxLength={8}
              showCharCount={false}
            />
          </label>
        ))}
      </div>
      <PortionRows
        rows={draft.portions}
        errors={portionErrors ?? {}}
        onChange={(portions) => set({ portions })}
      />
    </>
  );
}
