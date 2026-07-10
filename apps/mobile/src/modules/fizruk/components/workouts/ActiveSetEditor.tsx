/**
 * `ActiveSetEditor` — bottom-sheet editor for adding or updating a
 * single set on an active workout item.
 *
 * Every mutation (increment / decrement / direct edit) flows through
 * the pure helpers in
 * `@sergeant/fizruk-domain/domain/workouts/activeSet`, so the same
 * validation / snapping rules apply regardless of the UI surface.
 * The parent passes the exercise context and a draft `onSubmit`
 * callback; the editor owns the draft state locally.
 */
import {
  createEmptySetDraft,
  decrementReps,
  decrementWeight,
  incrementReps,
  incrementWeight,
  isSetDraftValid,
  RPE_MAX,
  RPE_MIN,
  setReps,
  setRpe,
  setToDraft,
  setWeightKg,
  validateSetDraft,
  type WorkoutSet,
  type WorkoutSetDraft,
  type WorkoutSetDraftErrors,
} from "@sergeant/fizruk-domain/domain";
import { useCallback, useMemo, useState } from "react";
import { Text, View } from "react-native";

import { hapticSuccess, hapticTap, hapticWarning } from "@sergeant/shared";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Sheet } from "@/components/ui/Sheet";

export interface ActiveSetEditorProps {
  open: boolean;
  onClose(): void;
  /** Human-readable exercise name used in the sheet title. */
  exerciseName: string;
  /** 1-based index in the item's set list (for the sheet header). */
  setIndex?: number;
  /**
   * Initial set to seed the editor with (edit mode). Omit for a fresh
   * 0×0 draft (new-set mode).
   */
  initialSet?: WorkoutSet | null;
  onSubmit(set: WorkoutSet): void;
  /** Optional root testID — sub-ids derive from it. */
  testID?: string;
}

const RPE_OPTIONS: readonly (number | null)[] = [
  null,
  RPE_MIN,
  2,
  3,
  4,
  5,
  6,
  7,
  8,
  9,
  RPE_MAX,
];

function makeDraft(seed: WorkoutSet | null | undefined): WorkoutSetDraft {
  return seed ? setToDraft(seed) : createEmptySetDraft();
}

function numInputValue(n: number): string {
  return Number.isFinite(n) ? String(n) : "";
}

export function ActiveSetEditor({
  open,
  onClose,
  exerciseName,
  setIndex,
  initialSet,
  onSubmit,
  testID = "fizruk-workouts-set-editor",
}: ActiveSetEditorProps) {
  const [draft, setDraft] = useState<WorkoutSetDraft>(() =>
    makeDraft(initialSet),
  );
  const [errors, setErrors] = useState<WorkoutSetDraftErrors>({});
  const [prevOpen, setPrevOpen] = useState(open);

  // Re-seed each time the sheet opens for a (possibly different) set.
  // Render-time pattern avoids `react-hooks/set-state-in-effect` (init 0021).
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setDraft(makeDraft(initialSet));
      setErrors({});
    }
  }

  const handleWeightInc = useCallback(() => {
    hapticTap();
    setDraft((d) => incrementWeight(d));
  }, []);
  const handleWeightDec = useCallback(() => {
    hapticTap();
    setDraft((d) => decrementWeight(d));
  }, []);
  const handleRepsInc = useCallback(() => {
    hapticTap();
    setDraft((d) => incrementReps(d));
  }, []);
  const handleRepsDec = useCallback(() => {
    hapticTap();
    setDraft((d) => decrementReps(d));
  }, []);

  const handleWeightText = useCallback((text: string) => {
    const normalised = text.replace(",", ".");
    const parsed = Number(normalised);
    if (!Number.isFinite(parsed)) return;
    setDraft((d) => setWeightKg(d, parsed));
  }, []);

  const handleRepsText = useCallback((text: string) => {
    const parsed = Number(text);
    if (!Number.isFinite(parsed)) return;
    setDraft((d) => setReps(d, parsed));
  }, []);

  const handlePickRpe = useCallback((value: number | null) => {
    hapticTap();
    setDraft((d) => setRpe(d, value));
  }, []);

  const handleSubmit = useCallback(() => {
    const next = validateSetDraft(draft);
    if (!isSetDraftValid(next)) {
      setErrors(next);
      hapticWarning();
      return;
    }
    setErrors({});
    hapticSuccess();
    const { weightKg, reps, rpe } = draft;
    const payload: WorkoutSet = { weightKg, reps };
    if (typeof rpe === "number") {
      (payload as WorkoutSet & { rpe: number }).rpe = rpe;
    }
    onSubmit(payload);
    onClose();
  }, [draft, onClose, onSubmit]);

  const title = useMemo(() => {
    if (setIndex && setIndex > 0) {
      return `${exerciseName} · Сет ${setIndex}`;
    }
    return exerciseName;
  }, [exerciseName, setIndex]);

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={title}
      description="Вага, повторення та (опційно) RPE за Borg 1..10."
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
            testID={`${testID}-save`}
          >
            Зберегти
          </Button>
        </View>
      }
    >
      <View className="gap-4 py-2" testID={testID}>
        {/* Weight */}
        <View className="gap-2">
          <Text className="text-xs font-semibold uppercase text-fg-muted">
            Вага (кг)
          </Text>
          <View className="flex-row items-center gap-2">
            <Button
              variant="secondary"
              size="md"
              iconOnly
              onPress={handleWeightDec}
              accessibilityLabel="Зменшити вагу"
              testID={`${testID}-weight-dec`}
            >
              <Text className="text-fg text-lg font-bold">−</Text>
            </Button>
            <Input
              value={numInputValue(draft.weightKg)}
              onChangeText={handleWeightText}
              keyboardType="decimal-pad"
              size="md"
              error={!!errors.weightKg}
              accessibilityLabel="Вага в кілограмах"
              testID={`${testID}-weight-input`}
            />
            <Button
              variant="secondary"
              size="md"
              iconOnly
              onPress={handleWeightInc}
              accessibilityLabel="Збільшити вагу"
              testID={`${testID}-weight-inc`}
            >
              <Text className="text-fg text-lg font-bold">+</Text>
            </Button>
          </View>
          {errors.weightKg ? (
            <Text
              className="text-xs text-red-600"
              testID={`${testID}-weight-error`}
            >
              {errors.weightKg}
            </Text>
          ) : null}
        </View>

        {/* Reps */}
        <View className="gap-2">
          <Text className="text-xs font-semibold uppercase text-fg-muted">
            Повторення
          </Text>
          <View className="flex-row items-center gap-2">
            <Button
              variant="secondary"
              size="md"
              iconOnly
              onPress={handleRepsDec}
              accessibilityLabel="Зменшити повторення"
              testID={`${testID}-reps-dec`}
            >
              <Text className="text-fg text-lg font-bold">−</Text>
            </Button>
            <Input
              value={numInputValue(draft.reps)}
              onChangeText={handleRepsText}
              keyboardType="number-pad"
              size="md"
              error={!!errors.reps}
              accessibilityLabel="Кількість повторень"
              testID={`${testID}-reps-input`}
            />
            <Button
              variant="secondary"
              size="md"
              iconOnly
              onPress={handleRepsInc}
              accessibilityLabel="Збільшити повторення"
              testID={`${testID}-reps-inc`}
            >
              <Text className="text-fg text-lg font-bold">+</Text>
            </Button>
          </View>
          {errors.reps ? (
            <Text
              className="text-xs text-red-600"
              testID={`${testID}-reps-error`}
            >
              {errors.reps}
            </Text>
          ) : null}
        </View>

        {/* RPE */}
        <View className="gap-2">
          <Text className="text-xs font-semibold uppercase text-fg-muted">
            RPE (Borg 1..10) — необов&apos;язково
          </Text>
          <View className="flex-row flex-wrap gap-1.5">
            {RPE_OPTIONS.map((value) => {
              const active = draft.rpe === value;
              const label = value === null ? "—" : String(value);
              return (
                <Button
                  key={label}
                  variant={active ? "fizruk" : "secondary"}
                  size="xs"
                  onPress={() => handlePickRpe(value)}
                  accessibilityLabel={`RPE ${label}`}
                  testID={`${testID}-rpe-${value === null ? "none" : value}`}
                >
                  {label}
                </Button>
              );
            })}
          </View>
          {errors.rpe ? (
            <Text
              className="text-xs text-red-600"
              testID={`${testID}-rpe-error`}
            >
              {errors.rpe}
            </Text>
          ) : null}
        </View>
      </View>
    </Sheet>
  );
}
