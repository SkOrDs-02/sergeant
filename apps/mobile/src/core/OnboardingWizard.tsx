/**
 * Mobile multi-step onboarding wizard (v2).
 *
 * 3 steps: Welcome → Module selection → Goal-setting → Hub.
 *
 * Keeps full parity with the web flow and reuses the shared pure domain
 * (`@sergeant/shared/lib/onboarding` + `vibePicks` + `onboardingGoals`)
 * so both platforms cannot drift on key constants, step taxonomy or
 * done-flag rules.
 *
 * Platform-specific behaviour:
 *  - Haptics via the shared adapter (`expo-haptics`): `tap` on chip
 *    toggle, `success` on finish.
 *  - Respects `AccessibilityInfo.isReduceMotionEnabled()` for the
 *    enter animation.
 *  - Progress is persisted through the shared `KVStore` adapter.
 */

import { useCallback, useEffect, useMemo, useReducer, useState } from "react";
import {
  AccessibilityInfo,
  Modal,
  Pressable,
  SafeAreaView,
  Text,
  View,
} from "react-native";

import {
  ALL_MODULES,
  buildFinalPicks,
  DASHBOARD_MODULE_LABELS,
  hapticSuccess,
  hapticTap,
  markFirstActionPending,
  markFirstActionStartedAt,
  markOnboardingDone,
  ONBOARDING_MODULE_DESCRIPTIONS,
  ONBOARDING_STEPS,
  ONBOARDING_VIBE_TEASERS,
  saveVibePicks,
  type DashboardModuleId,
  type KVStore,
  type OnboardingStepId,
  EMPTY_GOALS,
  getGoalQuestions,
  saveOnboardingGoals,
  type OnboardingGoals,
} from "@sergeant/shared";

import {
  safeReadLS as mmkvGet,
  safeRemoveLS as mmkvRemove,
  safeWriteLS as mmkvWrite,
} from "@/lib/storage";

import { Button } from "@/components/ui/Button";

const mmkvStore: KVStore = {
  getString(key) {
    try {
      const raw = mmkvGet<unknown>(key, null);
      if (raw === null || raw === undefined) return null;
      return typeof raw === "string" ? raw : JSON.stringify(raw);
    } catch {
      return null;
    }
  },
  setString(key, value) {
    try {
      mmkvWrite(key, value);
    } catch {
      /* noop */
    }
  },
  remove(key) {
    try {
      mmkvRemove(key);
    } catch {
      /* noop */
    }
  },
};

export function getOnboardingStore(): KVStore {
  return mmkvStore;
}

export interface OnboardingFinishOptions {
  intent: "vibe_empty";
  picks: DashboardModuleId[];
}

export interface OnboardingWizardProps {
  onDone: (
    startModuleId: DashboardModuleId | null,
    opts: OnboardingFinishOptions,
  ) => void;
  variant?: "modal" | "fullPage";
  /** Allow users to skip the entire onboarding. Defaults to false. */
  allowSkip?: boolean;
}

// ---------------------------------------------------------------------------
// Wizard state
// ---------------------------------------------------------------------------

interface WizardState {
  step: OnboardingStepId;
  picks: DashboardModuleId[];
  goals: OnboardingGoals;
}

type WizardAction =
  | { type: "NEXT" }
  | { type: "BACK" }
  | { type: "TOGGLE_PICK"; id: DashboardModuleId }
  | { type: "SET_GOAL"; key: keyof OnboardingGoals; value: unknown };

function wizardReducer(state: WizardState, action: WizardAction): WizardState {
  switch (action.type) {
    case "NEXT": {
      const idx = ONBOARDING_STEPS.indexOf(state.step);
      if (idx < ONBOARDING_STEPS.length - 1) {
        return { ...state, step: ONBOARDING_STEPS[idx + 1] };
      }
      return state;
    }
    case "BACK": {
      const idx = ONBOARDING_STEPS.indexOf(state.step);
      if (idx > 0) {
        return { ...state, step: ONBOARDING_STEPS[idx - 1] };
      }
      return state;
    }
    case "TOGGLE_PICK": {
      const picks = state.picks.includes(action.id)
        ? state.picks.filter((p) => p !== action.id)
        : [...state.picks, action.id];
      return { ...state, picks };
    }
    case "SET_GOAL":
      return {
        ...state,
        goals: { ...state.goals, [action.key]: action.value },
      };
    default:
      return state;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function useReduceMotion(): boolean {
  const [reduceMotion, setReduceMotion] = useState(false);
  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        if (mounted) setReduceMotion(enabled);
      })
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      (enabled) => setReduceMotion(enabled),
    );
    return () => {
      mounted = false;
      sub.remove();
    };
  }, []);
  return reduceMotion;
}

function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

const CHIP_GLYPH: Record<DashboardModuleId, string> = {
  finyk: "💰",
  fizruk: "🏋",
  routine: "✅",
  nutrition: "🍽",
};

// ---------------------------------------------------------------------------
// Step indicator
// ---------------------------------------------------------------------------

function StepIndicator({ current, total }: { current: number; total: number }) {
  return (
    <View className="flex-row items-center justify-center gap-1.5">
      {Array.from({ length: total }, (_, i) => (
        <View
          key={i}
          className={cx(
            "rounded-full",
            i === current ? "h-1.5 w-6 bg-brand-500" : "h-1.5 w-1.5 bg-line",
          )}
        />
      ))}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Step 1: Welcome
// ---------------------------------------------------------------------------

function WelcomeStep({ onContinue }: { onContinue: () => void }) {
  return (
    <View className="items-center gap-5">
      <View className="h-20 w-20 items-center justify-center rounded-3xl bg-brand-500/10">
        <Text className="text-4xl">✨</Text>
      </View>
      <View className="items-center gap-2">
        <Text className="text-center text-2xl font-bold text-fg">
          Привіт. Це Sergeant.
        </Text>
        <Text className="text-center text-sm leading-relaxed text-fg-muted">
          Гроші, тіло, звички, їжа — все в одному місці. Офлайн. Приватно.
        </Text>
      </View>
      <View className="flex-row items-center gap-3">
        <Text className="text-xs text-fg-subtle">📶 Офлайн</Text>
        <Text className="text-xs text-fg-subtle">🔒 Локально</Text>
        <Text className="text-xs text-fg-subtle">⚡ ~30 сек</Text>
      </View>
      <Button
        variant="primary"
        size="lg"
        onPress={onContinue}
        testID="onboarding-next-welcome"
        className="w-full"
      >
        Далі
      </Button>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Step 2: Module selection
// ---------------------------------------------------------------------------

function ModulesStep({
  picks,
  togglePick,
  onContinue,
  onBack,
}: {
  picks: DashboardModuleId[];
  togglePick: (id: DashboardModuleId) => void;
  onContinue: () => void;
  onBack: () => void;
}) {
  return (
    <View className="items-center gap-4">
      <View className="items-center gap-1">
        <Text className="text-center text-xl font-bold text-fg">
          Що тобі важливо?
        </Text>
        <Text className="text-center text-xs text-fg-muted">
          Обери модулі — решту легко додати потім.
        </Text>
      </View>
      <View className="w-full gap-2">
        {ALL_MODULES.map((id) => {
          const active = picks.includes(id);
          return (
            <Pressable
              key={id}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              accessibilityLabel={DASHBOARD_MODULE_LABELS[id]}
              testID={`onboarding-module-${id}`}
              onPress={() => {
                hapticTap();
                togglePick(id);
              }}
              className={cx(
                "w-full flex-row items-start gap-3 rounded-2xl border p-3.5",
                "active:opacity-70",
                active
                  ? "border-brand-500/60 bg-brand-500/10"
                  : "border-cream-300 bg-cream-50",
              )}
            >
              {active && (
                <View className="absolute right-2.5 top-2.5 h-5 w-5 items-center justify-center rounded-full bg-brand-500">
                  <Text className="text-xs text-white">✓</Text>
                </View>
              )}
              <View
                className={cx(
                  "h-10 w-10 shrink-0 items-center justify-center rounded-xl",
                  active ? "bg-brand-500/15" : "bg-cream-100",
                )}
              >
                <Text className="text-lg">{CHIP_GLYPH[id]}</Text>
              </View>
              <View className="min-w-0 flex-1 pr-4">
                <Text className="text-sm font-bold leading-tight text-fg">
                  {DASHBOARD_MODULE_LABELS[id]}
                </Text>
                <Text className="mt-0.5 text-xs leading-snug text-fg-muted">
                  {ONBOARDING_MODULE_DESCRIPTIONS[id]}
                </Text>
                <Text className="mt-1 text-[11px] leading-tight text-fg-subtle">
                  {ONBOARDING_VIBE_TEASERS[id]}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>
      <View className="w-full flex-row gap-2">
        <Pressable
          onPress={onBack}
          className="items-center justify-center rounded-xl px-4 py-3 active:opacity-70"
          testID="onboarding-back-modules"
        >
          <Text className="text-sm text-fg-muted">←</Text>
        </Pressable>
        <Button
          variant="primary"
          size="lg"
          onPress={onContinue}
          testID="onboarding-next-modules"
          className="flex-1"
        >
          Далі
        </Button>
      </View>
      {picks.length === 0 && (
        <Text className="text-center text-[11px] text-fg-muted">
          Без вибору — всі 4 модулі.
        </Text>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Step 3: Goals
// ---------------------------------------------------------------------------

const GOAL_KEY_MAP: Record<string, keyof OnboardingGoals> = {
  finyk_budget: "finykBudget",
  fizruk_weekly: "fizrukWeeklyGoal",
  routine_first_habit: "routineFirstHabit",
  nutrition_goal: "nutritionGoal",
};

function GoalsStep({
  picks,
  goals,
  onSetGoal,
  onFinish,
  onBack,
}: {
  picks: DashboardModuleId[];
  goals: OnboardingGoals;
  onSetGoal: (key: keyof OnboardingGoals, value: unknown) => void;
  onFinish: () => void;
  onBack: () => void;
}) {
  const questions = useMemo(() => getGoalQuestions(picks), [picks]);
  const hasQuestions = questions.length > 0;

  return (
    <View className="items-center gap-4">
      <View className="items-center gap-1">
        <Text className="text-center text-xl font-bold text-fg">
          {hasQuestions ? "Твої цілі" : "Готово!"}
        </Text>
        <Text className="text-center text-xs text-fg-muted">
          {hasQuestions
            ? "Необов'язково — можна пропустити."
            : "Налаштуй деталі потім у кожному модулі."}
        </Text>
      </View>

      {hasQuestions && (
        <View className="w-full gap-4">
          {questions.map((q) => {
            const goalKey = GOAL_KEY_MAP[q.id];
            if (q.type === "radio" && q.options) {
              const currentVal = (goals[goalKey] as string | null) ?? null;
              return (
                <View key={q.id} className="gap-1.5">
                  <Text className="text-sm font-semibold text-fg">
                    {q.title}
                  </Text>
                  <View className="flex-row flex-wrap gap-2">
                    {q.options.map((opt) => (
                      <Pressable
                        key={opt.value}
                        onPress={() => {
                          hapticTap();
                          onSetGoal(
                            goalKey,
                            q.id === "fizruk_weekly"
                              ? Number(opt.value)
                              : opt.value,
                          );
                        }}
                        className={cx(
                          "rounded-xl border px-3.5 py-2",
                          "active:opacity-70",
                          currentVal === opt.value ||
                            (q.id === "fizruk_weekly" &&
                              goals[goalKey] === Number(opt.value))
                            ? "border-brand-500/60 bg-brand-500/10"
                            : "border-cream-300 bg-cream-50",
                        )}
                      >
                        <Text className="text-sm font-medium text-fg">
                          {opt.label}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              );
            }
            if (q.type === "slider" && q.slider) {
              const currentNum = (goals[goalKey] as number | null) ?? null;
              const s = q.slider;
              const presets = [
                s.min,
                Math.round((s.min + s.max) / 3),
                Math.round(((s.min + s.max) * 2) / 3),
                s.max,
              ];
              return (
                <View key={q.id} className="gap-1.5">
                  <Text className="text-sm font-semibold text-fg">
                    {q.title}
                  </Text>
                  <View className="flex-row flex-wrap gap-2">
                    {presets.map((preset) => (
                      <Pressable
                        key={preset}
                        onPress={() => {
                          hapticTap();
                          onSetGoal(goalKey, preset);
                        }}
                        className={cx(
                          "rounded-xl border px-3.5 py-2",
                          "active:opacity-70",
                          currentNum === preset
                            ? "border-brand-500/60 bg-brand-500/10"
                            : "border-cream-300 bg-cream-50",
                        )}
                      >
                        <Text className="text-sm font-medium text-fg">
                          {preset.toLocaleString("uk-UA")}
                          {s.unit ? ` ${s.unit}` : ""}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              );
            }
            return null;
          })}
        </View>
      )}

      <View className="w-full flex-row gap-2">
        <Pressable
          onPress={onBack}
          className="items-center justify-center rounded-xl px-4 py-3 active:opacity-70"
          testID="onboarding-back-goals"
        >
          <Text className="text-sm text-fg-muted">←</Text>
        </Pressable>
        <Button
          variant="primary"
          size="lg"
          onPress={onFinish}
          testID="onboarding-finish"
          className="flex-1"
        >
          Заповни мій хаб
        </Button>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Main wizard
// ---------------------------------------------------------------------------

export function OnboardingWizard({
  onDone,
  variant = "modal",
  allowSkip = false,
}: OnboardingWizardProps) {
  const [state, dispatch] = useReducer(wizardReducer, {
    step: "welcome",
    picks: [...ALL_MODULES],
    goals: { ...EMPTY_GOALS },
  });
  const reduceMotion = useReduceMotion();

  const togglePick = useCallback((id: DashboardModuleId) => {
    dispatch({ type: "TOGGLE_PICK", id });
  }, []);

  const setGoal = useCallback((key: keyof OnboardingGoals, value: unknown) => {
    dispatch({ type: "SET_GOAL", key, value });
  }, []);

  const handleNext = useCallback(() => {
    dispatch({ type: "NEXT" });
  }, []);

  const handleBack = useCallback(() => {
    dispatch({ type: "BACK" });
  }, []);

  const finish = useCallback(() => {
    const chosen = buildFinalPicks(state.picks, ALL_MODULES);
    saveVibePicks(mmkvStore, chosen);
    saveOnboardingGoals(mmkvStore, state.goals);
    markFirstActionStartedAt(mmkvStore);
    markFirstActionPending(mmkvStore);
    markOnboardingDone(mmkvStore);
    hapticSuccess();
    onDone(null, { intent: "vibe_empty", picks: chosen });
  }, [onDone, state.picks, state.goals]);

  const skipOnboarding = useCallback(() => {
    // Skip with all modules enabled and empty goals
    saveVibePicks(mmkvStore, [...ALL_MODULES]);
    saveOnboardingGoals(mmkvStore, { ...EMPTY_GOALS });
    markFirstActionStartedAt(mmkvStore);
    markFirstActionPending(mmkvStore);
    markOnboardingDone(mmkvStore);
    hapticTap();
    onDone(null, { intent: "vibe_empty", picks: [...ALL_MODULES] });
  }, [onDone]);

  const stepIdx = ONBOARDING_STEPS.indexOf(state.step);

  const content = (
    <View
      testID="onboarding-splash-card"
      className="w-full max-w-sm rounded-3xl border border-cream-300 bg-cream-50 p-6 gap-4"
    >
      {allowSkip && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Пропустити онбординг"
          onPress={skipOnboarding}
          className="absolute top-3 right-3 px-3 py-1.5 rounded-full active:opacity-70"
          testID="onboarding-skip"
        >
          <Text className="text-xs text-fg-muted">Пропустити</Text>
        </Pressable>
      )}
      <StepIndicator current={stepIdx} total={ONBOARDING_STEPS.length} />
      {state.step === "welcome" && <WelcomeStep onContinue={handleNext} />}
      {state.step === "modules" && (
        <ModulesStep
          picks={state.picks}
          togglePick={togglePick}
          onContinue={handleNext}
          onBack={handleBack}
        />
      )}
      {state.step === "goals" && (
        <GoalsStep
          picks={state.picks}
          goals={state.goals}
          onSetGoal={setGoal}
          onFinish={finish}
          onBack={handleBack}
        />
      )}
    </View>
  );

  if (variant === "fullPage") {
    return (
      <SafeAreaView
        className="flex-1 bg-cream-50"
        accessibilityLabel="Вітальний екран"
        testID="onboarding-wizard"
      >
        <View className="flex-1 items-center justify-center p-4">
          {content}
        </View>
      </SafeAreaView>
    );
  }

  return (
    <Modal
      visible
      transparent
      animationType={reduceMotion ? "none" : "slide"}
      onRequestClose={finish}
      accessibilityLabel="Вітальний екран"
      testID="onboarding-wizard"
    >
      <View className="flex-1 items-center justify-end bg-black/60 p-4">
        <View className="w-full max-w-sm pb-6">
          <Text accessibilityRole="header" className="sr-only">
            Вітальний екран
          </Text>
          {content}
        </View>
      </View>
    </Modal>
  );
}
