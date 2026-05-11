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

import { useCallback, useEffect, useMemo, useReducer, useRef } from "react";
import { Modal, Pressable, SafeAreaView, Text, View } from "react-native";

import {
  ALL_MODULES,
  buildFinalPicks,
  hapticSuccess,
  hapticTap,
  markFirstActionPending,
  markFirstActionStartedAt,
  markOnboardingDone,
  ONBOARDING_STEPS,
  saveVibePicks,
  type DashboardModuleId,
  type KVStore,
  type OnboardingStepId,
  EMPTY_GOALS,
  saveOnboardingGoals,
  type OnboardingGoals,
  ONBOARDING_HERO_COPY_EXPERIMENT,
  ONBOARDING_DEFAULT_PICKS_EXPERIMENT,
  assignVariant,
  getOnboardingHeroCopy,
  isOnboardingDefaultPicksVariant,
  type OnboardingDefaultPicksVariant,
  type OnboardingHeroCopyVariant,
} from "@sergeant/shared";

import { mobileKVStore } from "@/lib/storage";
import { ANALYTICS_EVENTS, trackEvent } from "@/lib/analytics";

import { GoalsStep } from "./onboarding/GoalsStep";
import { ModulesStep } from "./onboarding/ModulesStep";
import { StepIndicator } from "./onboarding/StepIndicator";
import { useReduceMotion } from "./onboarding/useReduceMotion";
import { WelcomeStep } from "./onboarding/WelcomeStep";
import { wizardReducer } from "./onboarding/wizardState";

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
