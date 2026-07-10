/**
 * `MeasurementEntryForm` — bottom-sheet form used by the Fizruk
 * Measurements page for create + edit flows.
 *
 * Wraps the shared {@link import("@/components/ui/Sheet.js").Sheet}
 * primitive. All pure logic (field list, validation, normalisation,
 * empty-draft seeding) is sourced from
 * `@sergeant/fizruk-domain/domain/measurements` so the form stays
 * presentational and the same rules apply wherever the draft shape
 * is consumed.
 */
import { useCallback, useState } from "react";
import { Text, View } from "react-native";

import {
  MEASUREMENT_FIELDS,
  emptyMeasurementDraft,
  entryToMeasurementDraft,
  isMeasurementDraftValid,
  setMeasurementField,
  validateMeasurementDraft,
  type MeasurementDraft,
  type MeasurementDraftErrors,
  type MobileMeasurementEntry,
} from "@sergeant/fizruk-domain/domain";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Sheet } from "@/components/ui/Sheet";

export interface MeasurementEntryFormProps {
  /** Whether the sheet is visible. */
  open: boolean;
  /** Close without saving. */
  onClose: () => void;
  /**
   * When non-null the form is in edit mode and pre-populated from the
   * matching entry. `null` = new-entry mode.
   */
  editingEntry?: MobileMeasurementEntry | null;
  /**
   * Called with the validated draft on submit. The parent is
   * responsible for calling `add` / `update` on the hook.
   */
  onSubmit: (draft: MeasurementDraft) => void;
  /** Optional root testID — sub-ids are derived from it. */
  testID?: string;
}

function makeInitial(entry?: MobileMeasurementEntry | null): MeasurementDraft {
  return entry ? entryToMeasurementDraft(entry) : emptyMeasurementDraft();
}

export function MeasurementEntryForm({
  open,
  onClose,
  editingEntry,
  onSubmit,
  testID = "fizruk-measurements-form",
}: MeasurementEntryFormProps) {
  const isEditing = !!editingEntry;

  const [draft, setDraft] = useState<MeasurementDraft>(() =>
    makeInitial(editingEntry),
  );
  const [errors, setErrors] = useState<MeasurementDraftErrors>({});
  const [prevOpen, setPrevOpen] = useState(open);

  // Re-seed the form each time the sheet opens for a (possibly new)
  // target entry. Render-time pattern avoids `react-hooks/set-state-in-effect`
  // (initiative 0021).
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setDraft(makeInitial(editingEntry));
      setErrors({});
    }
  }

  const handleSubmit = useCallback(() => {
    const next = validateMeasurementDraft(draft);
    if (!isMeasurementDraftValid(next)) {
      setErrors(next);
      return;
    }
    setErrors({});
    onSubmit(draft);
    onClose();
  }, [draft, onSubmit, onClose]);

  const formError = errors.form;

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={isEditing ? "Редагувати замір" : "Новий замір"}
      description="Запиши будь-які з цих значень — порожні поля пропустяться."
      footer={
        <View className="flex-row gap-3">
          <Button
            variant="ghost"
            className="flex-1"
            onPress={onClose}
            testID={`${testID}-cancel`}
          >
            Скасувати
          </Button>
          <Button
            variant="fizruk"
            className="flex-1"
            onPress={handleSubmit}
            testID={`${testID}-submit`}
          >
            {isEditing ? "Зберегти" : "Додати"}
          </Button>
        </View>
      }
    >
      <View className="px-4 pb-4 gap-4" testID={testID}>
        {formError ? (
          <View
            className="rounded-xl bg-red-50 border border-red-200 px-3 py-2"
            testID={`${testID}-form-error`}
          >
            <Text className="text-sm text-red-700">{formError}</Text>
          </View>
        ) : null}

        <View className="flex-row flex-wrap -mx-1">
          {MEASUREMENT_FIELDS.map((field) => {
            const fieldError = errors.values?.[field.id];
            const value = draft.values[field.id] ?? "";
            return (
              <View
                key={field.id}
                className="w-1/2 px-1 mb-3"
                testID={`${testID}-field-${field.id}`}
              >
                <Text className="text-xs font-semibold text-fg mb-1">
                  {field.label}
                  {field.unit ? (
                    <Text className="text-fg-muted">{` (${field.unit})`}</Text>
                  ) : null}
                </Text>
                <Input
                  type="number"
                  accessibilityLabel={field.label}
                  value={value}
                  onChangeText={(text) =>
                    setDraft((d) => setMeasurementField(d, field.id, text))
                  }
                  error={!!fieldError}
                  placeholder="—"
                />
                {fieldError ? (
                  <Text className="text-[11px] text-red-600 mt-1">
                    {fieldError}
                  </Text>
                ) : null}
              </View>
            );
          })}
        </View>
      </View>
    </Sheet>
  );
}
