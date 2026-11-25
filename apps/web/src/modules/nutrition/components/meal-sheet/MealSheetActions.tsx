/**
 * Last validated: 2026-11-18
 * Status: Active
 *
 * Дрібні блоки кроку «fill» аркуша `AddMealSheet`: поле дати редагованого
 * запису, кнопки збереження і підтвердження запису без КБЖВ. Винесено з
 * `AddMealSheet` під стелю Hard Rule #18 (поведінка не змінена).
 */
import { cn } from "@shared/lib/ui/cn";
import { FIELD_LABEL } from "@shared/components/ui/Input";
import { Button } from "@shared/components/ui/Button";
import { ConfirmDialog } from "@shared/components/ui/ConfirmDialog";
import { DateField } from "@shared/components/ui/DateField";
import { messages } from "@shared/i18n/uk";

const copy = messages.nutrition.addMeal;

/** «Дата» редагованого запису: зміна переносить запис на інший день. */
export function EditDateField({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="mb-4">
      <div className={cn(FIELD_LABEL, "mb-1")}>{copy.dateLabel}</div>
      <DateField
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={copy.dateAria}
      />
    </div>
  );
}

export function MealSaveButtons({
  editing,
  onSave,
  onCancel,
}: {
  editing: boolean;
  onSave: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      <Button
        type="button"
        variant="solid"
        className="h-12 min-h-[44px]"
        onClick={onSave}
      >
        {editing ? copy.saveEdit : copy.save}
      </Button>
      <Button
        type="button"
        variant="outline"
        className="h-12 min-h-[44px]"
        onClick={onCancel}
      >
        {copy.cancel}
      </Button>
    </div>
  );
}

/**
 * Рішення засновника: запис із порожніми КБЖВ не блокується, а
 * перепитується — він не зрушить денну статистику.
 */
export function EmptyMacrosConfirm({
  open,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <ConfirmDialog
      open={open}
      title={copy.emptyMacrosTitle}
      description={copy.emptyMacrosDescription}
      confirmLabel={copy.emptyMacrosConfirm}
      cancelLabel={copy.emptyMacrosBack}
      danger={false}
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  );
}
