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

import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
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
  ONBOARDING_HERO_COPY_EXPERIMENT,
  ONBOARDING_DEFAULT_PICKS_EXPERIMENT,
  assignVariant,
  getOnboardingHeroCopy,
  isOnboardingDefaultPicksVariant,
  type OnboardingDefaultPicksVariant,
  type OnboardingHeroCopy,
  type OnboardingHeroCopyVariant,
} from "@sergeant/shared";

import { mobileKVStore } from "@/lib/storage";
import { ANALYTICS_EVENTS, trackEvent } from "@/lib/analytics";

import { Button } from "@/components/ui/Button";

export function getOnboardingStore(): KVStore {
  return mobileKVStore;
}

export interface OnboardingFinishOptions {
  intent: "vibe_empty" | "tour_replay";
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
  /**
   * Wizard run-mode (mobile parity for web S4.5).
   *
   * - `"real"` (default) — first-run wizard: persists picks/goals,
   *   fires the FTUX-funnel events, and marks onboarding done on
   *   finish.
   * - `"tour"` — read-only replay launched from Settings →
   *   "Подивитись tour". Skips all storage writes and FTUX-funnel
   *   events, fires `onboarding_replay_*` instead, and `finish`
   *   simply closes the wizard without touching the user's
   *   onboarding / first-action state. Mirrors
   *   `apps/web/src/core/onboarding/OnboardingWizard.tsx`.
   */
  mode?: "real" | "tour";
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
        return { ...state, step: ONBOARDING_STEPS[idx + 1]! };
      }
      return state;
    }
    case "BACK": {
      const idx = ONBOARDING_STEPS.indexOf(state.step);
      if (idx > 0) {
        return { ...state, step: ONBOARDING_STEPS[idx - 1]! };
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

function WelcomeStep({
  onContinue,
  copy,
}: {
  onContinue: () => void;
  copy: OnboardingHeroCopy;
}) {
  return (
    <View className="items-center gap-5">
      <View className="h-20 w-20 items-center justify-center rounded-3xl bg-brand-500/10">
        <Text className="text-4xl">✨</Text>
      </View>
      <View className="items-center gap-2">
        <Text className="text-center text-2xl font-bold text-fg">
          {copy.title}
        </Text>
        <Text className="text-center text-sm leading-relaxed text-fg-muted">
          {copy.subtitle}
        </Text>
      </View>
      <View className="flex-row items-center gap-3">
        <Text className="text-xs text-fg-subtle">🔒 {copy.badges[0]}</Text>
        <Text className="text-xs text-fg-subtle">☁️ {copy.badges[1]}</Text>
        <Text className="text-xs text-fg-subtle">🚫 {copy.badges[2]}</Text>
      </View>
      <Button
        variant="primary"
        size="lg"
        onPress={onContinue}
        testID="onboarding-next-welcome"
        className="w-full"
      >
        {copy.primaryCta}
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
  defaultPicksVariant,
}: {
  picks: DashboardModuleId[];
  togglePick: (id: DashboardModuleId) => void;
  onContinue: () => void;
  onBack: () => void;
  /**
   * S6.1: `none` arm disables «Далі» on empty picks and switches the
   * inline hint to «Обери хоч один модуль». `all` arm keeps the
   * pre-S6.1 «Без вибору — всі 4 модулі» fallback message.
   */
  defaultPicksVariant: OnboardingDefaultPicksVariant;
}) {
  const ctaDisabled = defaultPicksVariant === "none" && picks.length === 0;
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
          disabled={ctaDisabled}
        >
          Далі
        </Button>
      </View>
      {picks.length === 0 && defaultPicksVariant === "none" && (
        <Text
          accessibilityRole="text"
          accessibilityLabel="Обери хоч один модуль"
          testID="onboarding-empty-picks-hint"
          className="text-center text-[11px] text-fg-muted"
        >
          Обери хоч один модуль
        </Text>
      )}
      {picks.length === 0 && defaultPicksVariant === "all" && (
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
            if (!goalKey) return null;
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
  mode = "real",
}: OnboardingWizardProps) {
  const isTour = mode === "tour";

  // Default-picks A/B (S6.1). Mirrors the web wizard: deterministic
  // per device fingerprint, persisted across renders. Tour replay
  // short-circuits to the legacy `all` arm so the read-only replay
  // always renders every module pre-checked.
  const defaultPicksVariant = useMemo<OnboardingDefaultPicksVariant>(() => {
    if (isTour) return "all";
    const raw = assignVariant(
      mobileKVStore,
      ONBOARDING_DEFAULT_PICKS_EXPERIMENT,
    );
    return isOnboardingDefaultPicksVariant(raw) ? raw : "all";
  }, [isTour]);

  const [state, dispatch] = useReducer(wizardReducer, undefined, () => ({
    step: "welcome" as OnboardingStepId,
    picks: defaultPicksVariant === "none" ? [] : [...ALL_MODULES],
    goals: { ...EMPTY_GOALS },
  }));
  const reduceMotion = useReduceMotion();

  // FTUX-funnel timestamps (S0.4 mobile parity). `startedAtRef` is the
  // wizard-mount baseline; `stepEnteredAtRef` resets on every step
  // transition so `onboarding_step_completed.durationMs` reflects time
  // *spent* on each step instead of cumulative wall-clock from mount.
  const startedAtRef = useRef<number | null>(null);
  const stepEnteredAtRef = useRef<number>(Date.now());

  // Mount-only: fire `onboarding_started` + the welcome step view. The
  // web wizard collapses both into one screen; on mobile they map to
  // the first paint of the welcome step. PostHog funnels treat
  // `step_viewed` as a strict superset of `started`, so order matters.
  //
  // Tour mode (S4.5): replace the FTUX-funnel pair with a single
  // `onboarding_replay_viewed` so the funnel definitions on PostHog
  // never see a tour-replay user — the dashboards split shown vs
  // replayed by event name, mirroring the web parity in
  // `apps/web/src/core/onboarding/OnboardingWizard.tsx`.
  useEffect(() => {
    startedAtRef.current = Date.now();
    stepEnteredAtRef.current = startedAtRef.current;
    if (isTour) {
      trackEvent(ANALYTICS_EVENTS.ONBOARDING_REPLAY_VIEWED);
      return;
    }
    trackEvent(ANALYTICS_EVENTS.ONBOARDING_STARTED);
    trackEvent(ANALYTICS_EVENTS.ONBOARDING_STEP_VIEWED, { step: "welcome" });
  }, [isTour]);

  // Hero copy A/B (S1.1 + S1.2). Mirrors the web wizard so a single
  // user on both surfaces sees the same arm. Tour replay bypasses
  // assignment so it never contaminates the experiment dataset.
  const heroVariant = useMemo<OnboardingHeroCopyVariant>(
    () =>
      isTour
        ? "outcome"
        : (assignVariant(
            mobileKVStore,
            ONBOARDING_HERO_COPY_EXPERIMENT,
          ) as OnboardingHeroCopyVariant),
    [isTour],
  );
  const heroCopy = useMemo(
    () => getOnboardingHeroCopy(heroVariant),
    [heroVariant],
  );

  useEffect(() => {
    if (isTour) return;
    trackEvent(ANALYTICS_EVENTS.EXPERIMENT_EXPOSED, {
      experiment_id: ONBOARDING_HERO_COPY_EXPERIMENT.id,
      variant: heroVariant,
    });
    trackEvent(ANALYTICS_EVENTS.EXPERIMENT_EXPOSED, {
      experiment_id: ONBOARDING_DEFAULT_PICKS_EXPERIMENT.id,
      variant: defaultPicksVariant,
    });
  }, [isTour, heroVariant, defaultPicksVariant]);

  // Per-step view event whenever `state.step` changes. The first paint
  // (welcome) is fired by the mount effect above so the dedupe logic
  // here only re-fires when the step *transitions*. Tour mode skips
  // the funnel entirely.
  const lastStepRef = useRef<OnboardingStepId>(state.step);
  useEffect(() => {
    if (lastStepRef.current === state.step) return;
    lastStepRef.current = state.step;
    stepEnteredAtRef.current = Date.now();
    if (isTour) return;
    trackEvent(ANALYTICS_EVENTS.ONBOARDING_STEP_VIEWED, { step: state.step });
  }, [state.step, isTour]);

  const togglePick = useCallback((id: DashboardModuleId) => {
    dispatch({ type: "TOGGLE_PICK", id });
  }, []);

  const setGoal = useCallback(
    (key: keyof OnboardingGoals, value: unknown) => {
      dispatch({ type: "SET_GOAL", key, value });
      if (isTour) return;
      // PostHog parity with web `ONBOARDING_GOAL_SET`. We fire on
      // every change so dashboards can compute pick-rate per goal
      // type. `module` mirrors the web payload (the goal-question
      // module owner) for the same shared dashboard query.
      const goalToModule: Record<keyof OnboardingGoals, DashboardModuleId> = {
        finykBudget: "finyk",
        fizrukWeeklyGoal: "fizruk",
        routineFirstHabit: "routine",
        nutritionGoal: "nutrition",
      };
      trackEvent(ANALYTICS_EVENTS.ONBOARDING_GOAL_SET, {
        module: goalToModule[key],
        goalType: key,
        value,
      });
    },
    [isTour],
  );

  const handleNext = useCallback(() => {
    if (isTour) {
      dispatch({ type: "NEXT" });
      return;
    }
    // S6.1 / B-1: in the `none` arm, the modules step never advances
    // with an empty picks list. The CTA is disabled in DOM but block
    // programmatic dispatch as well so the user cannot reach goals
    // step (and eventually a populated dashboard) without choosing.
    if (
      state.step === "modules" &&
      state.picks.length === 0 &&
      defaultPicksVariant === "none"
    ) {
      return;
    }
    // Step-completed event fires on the leaving side of the
    // transition. The matching step-viewed event for the next step
    // is emitted by the `state.step` effect above on the next paint.
    const leaving = state.step;
    const durationMs = Math.max(0, Date.now() - stepEnteredAtRef.current);
    trackEvent(ANALYTICS_EVENTS.ONBOARDING_STEP_COMPLETED, {
      step: leaving,
      durationMs,
    });
    if (leaving === "modules") {
      // Mobile is multi-step, so VIBE_PICKED rides the modules→goals
      // edge — earlier than web's single-screen wizard but with the
      // same payload contract.
      const chosen = buildFinalPicks(state.picks, ALL_MODULES);
      trackEvent(ANALYTICS_EVENTS.ONBOARDING_VIBE_PICKED, {
        picks: chosen,
        picksCount: chosen.length,
      });
    }
    dispatch({ type: "NEXT" });
  }, [state.step, state.picks, isTour, defaultPicksVariant]);

  const handleBack = useCallback(() => {
    dispatch({ type: "BACK" });
  }, []);

  const finish = useCallback(() => {
    if (isTour) {
      // Tour replay: no side effects on user state. Just emit the
      // dismissal event with a duration so PostHog can show "how long
      // does the user spend in replay" without polluting the FTUX
      // funnel. Mirrors `apps/web/src/core/onboarding/OnboardingWizard.tsx`.
      trackEvent(ANALYTICS_EVENTS.ONBOARDING_REPLAY_DISMISSED, {
        durationMs: Math.max(
          0,
          Date.now() - (startedAtRef.current ?? Date.now()),
        ),
      });
      hapticTap();
      onDone(null, { intent: "tour_replay", picks: [] });
      return;
    }
    const hadEmptyPicks = state.picks.length === 0;

    // S6.1 / B-1: `none` arm never silently writes ALL_MODULES. The
    // CTA on modules-step is disabled while picks is empty, and
    // `handleNext` blocks the dispatch path, so reaching `finish()`
    // with no picks means the wizard navigated past those guards
    // (programmatic call, future refactor). Bail out without writing
    // any state so the user's "I haven't chosen" stays preserved.
    if (hadEmptyPicks && defaultPicksVariant === "none") {
      return;
    }

    const chosen = buildFinalPicks(state.picks, ALL_MODULES);
    saveVibePicks(mobileKVStore, chosen);
    saveOnboardingGoals(mobileKVStore, state.goals);
    markFirstActionStartedAt(mobileKVStore);
    markFirstActionPending(mobileKVStore);
    markOnboardingDone(mobileKVStore);
    trackEvent(ANALYTICS_EVENTS.ONBOARDING_STEP_COMPLETED, {
      step: state.step,
      durationMs: Math.max(0, Date.now() - stepEnteredAtRef.current),
    });
    trackEvent(ANALYTICS_EVENTS.ONBOARDING_COMPLETED, {
      intent: hadEmptyPicks ? "vibe_empty" : "vibe_picked",
      picksCount: chosen.length,
    });
    hapticSuccess();
    onDone(null, { intent: "vibe_empty", picks: chosen });
  }, [
    onDone,
    state.picks,
    state.goals,
    state.step,
    isTour,
    defaultPicksVariant,
  ]);

  const skipOnboarding = useCallback(() => {
    // Skip with all modules enabled and empty goals
    saveVibePicks(mobileKVStore, [...ALL_MODULES]);
    saveOnboardingGoals(mobileKVStore, { ...EMPTY_GOALS });
    markFirstActionStartedAt(mobileKVStore);
    markFirstActionPending(mobileKVStore);
    markOnboardingDone(mobileKVStore);
    trackEvent(ANALYTICS_EVENTS.ONBOARDING_SKIPPED, {
      step: state.step,
      durationMs: Math.max(
        0,
        Date.now() - (startedAtRef.current ?? Date.now()),
      ),
    });
    hapticTap();
    onDone(null, { intent: "vibe_empty", picks: [...ALL_MODULES] });
  }, [onDone, state.step]);

  const stepIdx = ONBOARDING_STEPS.indexOf(state.step);

  const content = (
    <View
      testID="onboarding-splash-card"
      className="w-full max-w-sm rounded-3xl border border-cream-300 bg-cream-50 p-6 gap-4"
    >
      {isTour ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Закрити tour"
          onPress={finish}
          className="absolute top-3 right-3 px-3 py-1.5 rounded-full active:opacity-70"
          testID="onboarding-tour-close"
        >
          <Text className="text-xs text-fg-muted">Закрити</Text>
        </Pressable>
      ) : (
        allowSkip && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Пропустити онбординг"
            onPress={skipOnboarding}
            className="absolute top-3 right-3 px-3 py-1.5 rounded-full active:opacity-70"
            testID="onboarding-skip"
          >
            <Text className="text-xs text-fg-muted">Пропустити</Text>
          </Pressable>
        )
      )}
      <StepIndicator current={stepIdx} total={ONBOARDING_STEPS.length} />
      {state.step === "welcome" && (
        <WelcomeStep onContinue={handleNext} copy={heroCopy} />
      )}
      {state.step === "modules" && (
        <ModulesStep
          picks={state.picks}
          togglePick={togglePick}
          onContinue={handleNext}
          onBack={handleBack}
          defaultPicksVariant={defaultPicksVariant}
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
