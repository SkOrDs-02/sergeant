/**
 * Last validated: 2026-06-15
 * Status: Active
 */
import { useRef, useState } from "react";
import type { ChangeEvent, Dispatch, SetStateAction } from "react";
import { useDialogFocusTrap } from "@shared/hooks/useDialogFocusTrap";
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
  pickedGrams: string;
  photoResult?: MealFormPhotoResult | null | undefined;
  hasPhotoMacros: boolean;
}

export function MacrosEditor({
  form,
  field,
  setForm,
  pickedFood,
  setPickedFood,
  pickedGrams,
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
      // Kcal is routinely overridden manually — bypass unlink confirm.
      // Protein/fat/carbs edits would silently invalidate the food link, so
      // those still require explicit confirmation before unlinking.
      const isLinked = Boolean(pickedFood) && Number(pickedGrams) > 0;
      if (isLinked && key !== "kcal") {
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

  // role="alertdialog" inline panel: move focus into the warning when it
  // opens, let Escape cancel, and restore focus on close. Non-modal
  // (no backdrop), so no inertBackground / aria-modal.
  const unlinkPanelRef = useRef<HTMLDivElement | null>(null);
  useDialogFocusTrap(Boolean(pendingUnlink), unlinkPanelRef, {
    onEscape: cancelUnlink,
  });

  return (
    <div className="mb-1">
      <div className="flex items-center justify-between mb-2">
        <SectionHeading as="div" size="xs" variant="nutrition">
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
            <SectionHeading
              as="div"
              size="xs"
              variant="nutrition"
              className="mb-1"
            >
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
      {pickedFood && Number(pickedGrams) > 0 && !pendingUnlink && (
        <div className="mt-2 rounded-xl border border-line bg-panelHi p-3">
          <p className="text-xs text-subtle leading-relaxed">
            Значення розраховані з картки продукту на 100 г і автоматично
            масштабуються під вагу. Якщо зробити їх незалежними, поточні КБЖВ
            збережуться лише для цього запису й більше не змінюватимуться разом
            із вагою або карткою продукту.
          </p>
          <button
            type="button"
            onClick={() => setPendingUnlink({ key: null, value: null })}
            className="mt-2 min-h-11 text-style-caption text-nutrition-strong dark:text-nutrition hover:underline"
          >
            Редагувати КБЖВ вручну
          </button>
        </div>
      )}
      {pendingUnlink && (
        <div
          ref={unlinkPanelRef}
          role="alertdialog"
          aria-label="Підтвердити ручне редагування КБЖВ"
          className="mt-3 rounded-2xl border border-warning/40 bg-warning/10 p-3 text-xs text-text space-y-2"
        >
          <p className="font-semibold">
            Редагувати КБЖВ для «{pickedFood?.name || "продукт"}» вручну?
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
              Редагувати вручну
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
