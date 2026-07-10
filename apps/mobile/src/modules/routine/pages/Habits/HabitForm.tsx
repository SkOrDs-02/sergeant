/**
 * Sergeant Routine — HabitForm (React Native)
 *
 * Mobile port of
 * `apps/web/src/modules/routine/components/settings/HabitForm.tsx`
 * (~438 LOC). Rendered inside the shared `Sheet` primitive so it works
 * the same as other mobile bottom-sheet forms (Finyk
 * `ManualExpenseSheet`, #453).
 *
 * Scope of this cut:
 *  - Emoji chip picker (16 suggestions — same set as web).
 *  - Name input + inline required-field validation.
 *  - Recurrence segmented chips (daily / weekdays / weekly / monthly /
 *    once) — labels come from the shared `RECURRENCE_OPTIONS`.
 *  - Inline `WeekdayPicker` when recurrence === "weekly", with its
 *    own inline error banner mirroring the web contract.
 *  - Reminder preset chips (Ранок / День / Вечір / Ранок+Вечір /
 *    Ранок/День/Вечір) — bumping `timeOfDay` + `reminderTimes`.
 *  - Advanced disclosure: start-date, end-date, tag select (1 of N),
 *    category select (1 of N). Start/end dates are plain text inputs
 *    — a native date-picker lands in a follow-up PR.
 *  - Submit / Cancel actions via the shared `Sheet` footer.
 *
 * ALL business logic (draft → patch translation, validation, empty
 * defaults) lives in `@sergeant/routine-domain/drafts` —
 * `validateHabitDraft`, `habitDraftToPatch`, `emptyHabitDraft`,
 * `habitToDraft`. The component is a pure view on top of those
 * helpers so both web and mobile share the exact same contract.
 *
 * Intentional differences from the web file:
 *  - No `VoiceMicButton` (Web Speech API is browser-only; the native
 *    equivalent is a separate follow-up).
 *  - No `focusTick` prop — the sheet already opens focused, and
 *    re-opening the sheet resets the draft via the `open` transition.
 *  - Scroll-into-view on weekdays error is replaced by the inline
 *    error banner + the form being in a scrollable sheet body.
 *  - No `Card` wrapper — the `Sheet` body is already the visible card.
 */

import { useCallback, useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";

import {
  RECURRENCE_OPTIONS,
  REMINDER_PRESETS,
  emptyHabitDraft,
  habitDraftToPatch,
  habitToDraft,
  validateHabitDraft,
  type Habit,
  type HabitDraft,
  type HabitDraftPatch,
  type HabitFormErrors,
  type RoutineState,
} from "@sergeant/routine-domain";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Sheet } from "@/components/ui/Sheet";

import { WeekdayPicker } from "./WeekdayPicker";

/** 16 emoji suggestions — identical set as the web file. */
export const HABIT_EMOJI_SUGGESTIONS: readonly string[] = [
  "✓",
  "💧",
  "🚶",
  "🏃",
  "💪",
  "🧘",
  "📖",
  "✍️",
  "🧠",
  "💊",
  "🥗",
  "😴",
  "☕",
  "🎯",
  "⏰",
  "🌙",
];

export interface HabitFormProps {
  /** Whether the sheet is visible. */
  open: boolean;
  /** Close the sheet without saving. */
  onClose: () => void;
  /**
   * Full routine state — used to render the tag / category selectors.
   * Passed by value (not `setRoutine`) because the form only reads the
   * state; the parent owns mutations.
   */
  routine: RoutineState;
  /**
   * When non-null the form is in edit mode and pre-populated from the
   * matching habit. `null` = new-habit mode, starts from
   * `emptyHabitDraft()`.
   */
  editingHabit?: Habit | null;
  /**
   * Called with the normalised `HabitDraftPatch` when the user taps
   * the primary action AND validation passes. The parent is
   * responsible for calling `applyCreateHabit` / `applyUpdateHabit`
   * on the routine store.
   */
  onSubmit: (patch: HabitDraftPatch) => void;
  /** Optional root `testID` — children derive stable sub-ids. */
  testID?: string;
}

export function HabitForm({
  open,
  onClose,
  routine,
  editingHabit,
  onSubmit,
  testID,
}: HabitFormProps) {
  const isEditing = !!editingHabit;

  // Initial draft — derived from the (optional) editing habit.
  const makeInitial = useCallback(
    (h?: Habit | null): HabitDraft => (h ? habitToDraft(h) : emptyHabitDraft()),
    [],
  );

  const [draft, setDraft] = useState<HabitDraft>(() =>
    makeInitial(editingHabit),
  );
  const [errors, setErrors] = useState<HabitFormErrors>({});
  const [showEmoji, setShowEmoji] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState<boolean>(isEditing);

  // Reset local state whenever the sheet re-opens with a (potentially
  // different) editing target. Render-time pattern avoids
  // `react-hooks/set-state-in-effect` (initiative 0021).
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setDraft(makeInitial(editingHabit));
      setErrors({});
      setShowEmoji(false);
      setShowAdvanced(!!editingHabit);
    }
  }

  // Clear field errors as the user corrects the relevant field — same
  // UX as the web `RoutineSettingsSection` component.
  // Derived at render time: clear name error once name is non-empty.
  let effectiveErrors = errors;
  if (errors.name && draft.name.trim()) {
    effectiveErrors = { ...effectiveErrors, name: undefined };
  }
  if (
    effectiveErrors.weekdays &&
    Array.isArray(draft.weekdays) &&
    draft.weekdays.length > 0
  ) {
    effectiveErrors = { ...effectiveErrors, weekdays: undefined };
  }
  if (effectiveErrors !== errors) {
    setErrors(effectiveErrors);
  }

  // Which reminder preset (if any) matches the current times — drives
  // the "selected" state of the preset chip row.
  const activePresetId = useMemo<string | null>(() => {
    const cur = (draft.reminderTimes || []).slice().sort();
    for (const p of REMINDER_PRESETS) {
      const ref = [...p.times].sort();
      if (cur.length === ref.length && cur.every((t, i) => t === ref[i])) {
        return p.id;
      }
    }
    return null;
  }, [draft.reminderTimes]);

  const handleSelectPreset = useCallback((presetId: string) => {
    const preset = REMINDER_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    setDraft((d) => ({
      ...d,
      reminderTimes: [...preset.times],
      timeOfDay: preset.times[0] ?? "",
    }));
  }, []);

  const handleClearReminders = useCallback(() => {
    setDraft((d) => ({ ...d, reminderTimes: [], timeOfDay: "" }));
  }, []);

  const handleSubmit = useCallback(() => {
    const next = validateHabitDraft(draft);
    if (next.name || next.weekdays) {
      setErrors(next);
      return;
    }
    setErrors({});
    onSubmit(habitDraftToPatch(draft));
    onClose();
  }, [draft, onSubmit, onClose]);

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={isEditing ? "Редагувати звичку" : "Нова звичка"}
      footer={
        <View className="flex-row gap-3">
          <Button
            variant="ghost"
            className="flex-1"
            onPress={onClose}
            testID={testID ? `${testID}-cancel` : undefined}
          >
            Скасувати
          </Button>
          <Button
            variant="routine"
            className="flex-1"
            onPress={handleSubmit}
            testID={testID ? `${testID}-submit` : undefined}
          >
            {isEditing ? "Зберегти" : "Додати"}
          </Button>
        </View>
      }
    >
      <View className="px-4 pb-4" testID={testID}>
        {/* Emoji + Name */}
        <View className="mb-4">
          <Text className="text-sm font-medium text-fg mb-1">Назва</Text>
          <View className="flex-row gap-2 items-start">
            <Pressable
              onPress={() => setShowEmoji((v) => !v)}
              accessibilityRole="button"
              accessibilityLabel="Обрати емодзі"
              accessibilityState={{ expanded: showEmoji }}
              testID={testID ? `${testID}-emoji-toggle` : undefined}
              className="w-14 h-12 rounded-xl border border-cream-300 bg-cream-50 items-center justify-center"
            >
              <Text className="text-xl">{draft.emoji || "✓"}</Text>
            </Pressable>
            <View className="flex-1">
              <Input
                value={draft.name}
                onChangeText={(v) => setDraft((d) => ({ ...d, name: v }))}
                placeholder="Напр.: пити воду"
                size="md"
                testID={testID ? `${testID}-name` : undefined}
                accessibilityLabel="Назва звички"
              />
            </View>
          </View>
          {errors.name ? (
            <Text
              className="text-xs text-danger mt-1"
              testID={testID ? `${testID}-name-error` : undefined}
            >
              {errors.name}
            </Text>
          ) : null}
          {showEmoji ? (
            <View className="mt-2 p-2 rounded-2xl border border-cream-300 bg-cream-50 flex-row flex-wrap gap-1">
              {HABIT_EMOJI_SUGGESTIONS.map((e) => {
                const selected = draft.emoji === e;
                return (
                  <Pressable
                    key={e}
                    onPress={() => {
                      setDraft((d) => ({ ...d, emoji: e }));
                      setShowEmoji(false);
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={`Емодзі ${e}`}
                    accessibilityState={{ selected }}
                    testID={testID ? `${testID}-emoji-${e}` : undefined}
                    className={
                      selected
                        ? "w-10 h-10 rounded-lg items-center justify-center bg-coral-100 border border-coral-400"
                        : "w-10 h-10 rounded-lg items-center justify-center bg-white"
                    }
                  >
                    <Text className="text-lg">{e}</Text>
                  </Pressable>
                );
              })}
            </View>
          ) : null}
        </View>

        {/* Recurrence */}
        <View className="mb-4">
          <Text className="text-sm font-medium text-fg mb-1">Регулярність</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingRight: 8 }}
          >
            {RECURRENCE_OPTIONS.map((o) => {
              const active = (draft.recurrence || "daily") === o.value;
              return (
                <Pressable
                  key={o.value}
                  onPress={() =>
                    setDraft((d) => ({ ...d, recurrence: o.value }))
                  }
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  testID={
                    testID ? `${testID}-recurrence-${o.value}` : undefined
                  }
                  className={
                    active
                      ? "h-9 px-3 rounded-full border border-coral-500 bg-coral-500 items-center justify-center mr-2"
                      : "h-9 px-3 rounded-full border border-cream-300 bg-cream-50 items-center justify-center mr-2"
                  }
                >
                  <Text
                    className={
                      active
                        ? "text-xs font-medium text-white"
                        : "text-xs font-medium text-fg"
                    }
                  >
                    {o.shortLabel ?? o.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        {/* Weekday picker — inline when weekly */}
        {draft.recurrence === "weekly" ? (
          <View
            className={
              errors.weekdays
                ? "mb-4 p-3 rounded-2xl border border-danger/60 bg-danger/5"
                : "mb-4 p-3 rounded-2xl border border-cream-300 bg-cream-50"
            }
          >
            <WeekdayPicker
              weekdays={draft.weekdays}
              onChange={(next) => setDraft((d) => ({ ...d, weekdays: next }))}
              testID={testID ? `${testID}-weekdays` : undefined}
            />
            {errors.weekdays ? (
              <Text
                className="text-xs text-danger mt-2"
                testID={testID ? `${testID}-weekdays-error` : undefined}
              >
                {errors.weekdays}
              </Text>
            ) : null}
          </View>
        ) : null}

        {/* Reminder presets */}
        <View className="mb-4">
          <Text className="text-sm font-medium text-fg mb-1">Нагадування</Text>
          <View className="flex-row flex-wrap gap-2">
            {REMINDER_PRESETS.map((p) => {
              const active = activePresetId === p.id;
              return (
                <Pressable
                  key={p.id}
                  onPress={() => handleSelectPreset(p.id)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  testID={testID ? `${testID}-reminder-${p.id}` : undefined}
                  className={
                    active
                      ? "h-9 px-3 rounded-full border border-coral-500 bg-coral-500 items-center justify-center"
                      : "h-9 px-3 rounded-full border border-cream-300 bg-cream-50 items-center justify-center"
                  }
                >
                  <Text
                    className={
                      active
                        ? "text-xs font-medium text-white"
                        : "text-xs font-medium text-fg"
                    }
                  >
                    {p.label}
                  </Text>
                </Pressable>
              );
            })}
            {draft.reminderTimes.length > 0 ? (
              <Pressable
                onPress={handleClearReminders}
                accessibilityRole="button"
                accessibilityLabel="Прибрати нагадування"
                testID={testID ? `${testID}-reminder-clear` : undefined}
                className="h-9 px-3 rounded-full border border-cream-300 bg-transparent items-center justify-center"
              >
                <Text className="text-xs font-medium text-fg-muted">
                  Без нагадувань
                </Text>
              </Pressable>
            ) : null}
          </View>
        </View>

        {/* Advanced disclosure */}
        <Pressable
          onPress={() => setShowAdvanced((v) => !v)}
          accessibilityRole="button"
          accessibilityState={{ expanded: showAdvanced }}
          testID={testID ? `${testID}-advanced-toggle` : undefined}
          className="flex-row items-center gap-1 py-2"
        >
          <Text className="text-xs text-fg-muted">
            {showAdvanced ? "Менше опцій" : "Більше опцій"}
          </Text>
          <Text className="text-xs text-fg-subtle">
            {showAdvanced ? "▲" : "▼"}
          </Text>
        </Pressable>

        {showAdvanced ? (
          <View className="mb-2">
            <View className="mb-3">
              <Text className="text-sm font-medium text-fg mb-1">
                Початок (дата)
              </Text>
              <Input
                value={draft.startDate || ""}
                onChangeText={(v) => setDraft((d) => ({ ...d, startDate: v }))}
                placeholder="YYYY-MM-DD"
                size="md"
                testID={testID ? `${testID}-start-date` : undefined}
                accessibilityLabel="Дата початку"
              />
            </View>
            <View className="mb-3">
              <Text className="text-sm font-medium text-fg mb-1">
                Кінець (необовʼязково)
              </Text>
              <Input
                value={draft.endDate || ""}
                onChangeText={(v) => setDraft((d) => ({ ...d, endDate: v }))}
                placeholder="YYYY-MM-DD"
                size="md"
                testID={testID ? `${testID}-end-date` : undefined}
                accessibilityLabel="Дата завершення"
              />
            </View>

            {routine.tags.length > 0 ? (
              <View className="mb-3">
                <Text className="text-sm font-medium text-fg mb-1">Тег</Text>
                <View className="flex-row flex-wrap gap-2">
                  <Pressable
                    onPress={() => setDraft((d) => ({ ...d, tagIds: [] }))}
                    accessibilityRole="button"
                    accessibilityState={{
                      selected: draft.tagIds.length === 0,
                    }}
                    testID={testID ? `${testID}-tag-none` : undefined}
                    className={
                      draft.tagIds.length === 0
                        ? "h-9 px-3 rounded-full border border-coral-500 bg-coral-500 items-center justify-center"
                        : "h-9 px-3 rounded-full border border-cream-300 bg-cream-50 items-center justify-center"
                    }
                  >
                    <Text
                      className={
                        draft.tagIds.length === 0
                          ? "text-xs font-medium text-white"
                          : "text-xs font-medium text-fg"
                      }
                    >
                      — без тегу —
                    </Text>
                  </Pressable>
                  {routine.tags.map((t) => {
                    const selected = draft.tagIds[0] === t.id;
                    return (
                      <Pressable
                        key={t.id}
                        onPress={() =>
                          setDraft((d) => ({ ...d, tagIds: [t.id] }))
                        }
                        accessibilityRole="button"
                        accessibilityState={{ selected }}
                        testID={testID ? `${testID}-tag-${t.id}` : undefined}
                        className={
                          selected
                            ? "h-9 px-3 rounded-full border border-coral-500 bg-coral-500 items-center justify-center"
                            : "h-9 px-3 rounded-full border border-cream-300 bg-cream-50 items-center justify-center"
                        }
                      >
                        <Text
                          className={
                            selected
                              ? "text-xs font-medium text-white"
                              : "text-xs font-medium text-fg"
                          }
                        >
                          {t.name}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ) : null}

            {routine.categories.length > 0 ? (
              <View className="mb-1">
                <Text className="text-sm font-medium text-fg mb-1">
                  Категорія
                </Text>
                <View className="flex-row flex-wrap gap-2">
                  <Pressable
                    onPress={() =>
                      setDraft((d) => ({ ...d, categoryId: null }))
                    }
                    accessibilityRole="button"
                    accessibilityState={{
                      selected: !draft.categoryId,
                    }}
                    testID={testID ? `${testID}-category-none` : undefined}
                    className={
                      !draft.categoryId
                        ? "h-9 px-3 rounded-full border border-coral-500 bg-coral-500 items-center justify-center"
                        : "h-9 px-3 rounded-full border border-cream-300 bg-cream-50 items-center justify-center"
                    }
                  >
                    <Text
                      className={
                        !draft.categoryId
                          ? "text-xs font-medium text-white"
                          : "text-xs font-medium text-fg"
                      }
                    >
                      — без категорії —
                    </Text>
                  </Pressable>
                  {routine.categories.map((c) => {
                    const selected = draft.categoryId === c.id;
                    return (
                      <Pressable
                        key={c.id}
                        onPress={() =>
                          setDraft((d) => ({ ...d, categoryId: c.id }))
                        }
                        accessibilityRole="button"
                        accessibilityState={{ selected }}
                        testID={
                          testID ? `${testID}-category-${c.id}` : undefined
                        }
                        className={
                          selected
                            ? "h-9 px-3 rounded-full border border-coral-500 bg-coral-500 items-center justify-center"
                            : "h-9 px-3 rounded-full border border-cream-300 bg-cream-50 items-center justify-center"
                        }
                      >
                        <Text
                          className={
                            selected
                              ? "text-xs font-medium text-white"
                              : "text-xs font-medium text-fg"
                          }
                        >
                          {c.emoji ? `${c.emoji} ` : ""}
                          {c.name}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ) : null}
          </View>
        ) : null}
      </View>
    </Sheet>
  );
}
