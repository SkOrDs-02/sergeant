import { useState } from "react";
import type { ChangeEvent, Dispatch, SetStateAction } from "react";
import { SectionHeading } from "@shared/components/ui/SectionHeading";
import { Input } from "@shared/components/ui/Input";
import { Button } from "@shared/components/ui/Button";
import type { PickedFood } from "./FoodPickerSection";
import {
  emptyForm,
  type MealFormPhotoResult,
  type MealFormState,
} from "./mealFormUtils";

type MacroFieldKey = "kcal" | "protein_g" | "fat_g" | "carbs_g";

interface PendingUnlink {
  key: MacroFieldKey | null;
  value: string | null;
}

interface MacrosEditorProps {
  form: MealFormState;
  field: (key: keyof MealFormState) => (value: string) => void;
  setForm: Dispatch<SetStateAction<MealFormState>>;
  pickedFood: PickedFood | null;
  setPickedFood: Dispatch<SetStateAction<PickedFood | null>>;
  photoResult?: MealFormPhotoResult | null;
  hasPhotoMacros: boolean;
}

export function MacrosEditor({
  form,
  field,
  setForm,
  pickedFood,
  setPickedFood,
  photoResult,
  hasPhotoMacros,
}: MacrosEditorProps) {
  // Guarded edit: when a food is linked from the DB, direct macro edits
  // used to silently drop the `foodId`. Now the first edit opens a
  // confirmation panel and the user must explicitly unlink before editing.
  const [pendingUnlink, setPendingUnlink] = useState<PendingUnlink | null>(
    null,
  );

  const handleMacroChange =
    (key: MacroFieldKey) => (e: ChangeEvent<HTMLInputElement>) => {
      const v = e.target.value;
      if (pickedFood) {
        setPendingUnlink({ key, value: v });
        return;
      }
      field(key)(v);
    };

  const confirmUnlink = () => {
    if (!pendingUnlink) return;
    const { key, value } = pendingUnlink;
    setPickedFood(null);
    if (key && value !== null) field(key)(value);
    setPendingUnlink(null);
  };

  const cancelUnlink = () => setPendingUnlink(null);

  return (
    <div className="mb-1">
      <div className="flex items-center justify-between mb-2">
        <SectionHeading as="div" size="xs">
          {pickedFood ? "КБЖВ (редагувати вручну)" : "КБЖВ"}
        </SectionHeading>
        {hasPhotoMacros && (
          <button
            type="button"
            onClick={() =>
              setForm((s) => ({
                ...s,
                ...emptyForm(photoResult),
                mealType: s.mealType,
                time: s.time,
                name: s.name,
                err: "",
              }))
            }
            className="text-xs text-nutrition-strong dark:text-nutrition font-semibold hover:underline"
          >
            ← З результату фото
          </button>
        )}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {(
          [
            { key: "kcal", label: "Ккал", placeholder: "350" },
            { key: "protein_g", label: "Білки г", placeholder: "12" },
            { key: "fat_g", label: "Жири г", placeholder: "6" },
            { key: "carbs_g", label: "Вуглев. г", placeholder: "60" },
          ] as const
        ).map(({ key, label, placeholder }) => (
          <div key={key}>
            <SectionHeading as="div" size="xs" className="mb-1">
              {label}
            </SectionHeading>
            <Input
              value={form[key]}
              onChange={handleMacroChange(key)}
              inputMode="decimal"
              placeholder={placeholder}
              aria-label={label}
            />
          </div>
        ))}
      </div>
      {pickedFood && !pendingUnlink && (
        <div className="mt-1.5 flex items-center justify-between gap-2">
          <span className="text-xs text-subtle">
            Щоб змінити вручну — відʼєднайте продукт
          </span>
          <button
            type="button"
            onClick={() => setPendingUnlink({ key: null, value: null })}
            className="text-xs font-semibold text-nutrition-strong dark:text-nutrition hover:underline shrink-0"
          >
            Відʼєднати
          </button>
        </div>
      )}
      {pendingUnlink && (
        <div
          role="alertdialog"
          aria-label="Підтвердити відʼєднання продукту"
          className="mt-3 rounded-2xl border border-warning/40 bg-warning/10 p-3 text-xs text-text space-y-2"
        >
          <p className="font-semibold">
            Відʼєднати «{pickedFood?.name || "продукт"}»?
          </p>
          <p className="text-muted">
            Макроси перестануть оновлюватись з бази продуктів — значення
            зафіксуються у цьому прийомі.
          </p>
          <div className="flex gap-2 pt-1">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="flex-1"
              onClick={cancelUnlink}
            >
              Скасувати
            </Button>
            <Button
              type="button"
              variant="primary"
              module="nutrition"
              size="sm"
              className="flex-1"
              onClick={confirmUnlink}
            >
              Відʼєднати
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
