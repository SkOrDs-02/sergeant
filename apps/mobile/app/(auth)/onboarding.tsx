import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useReducer, useRef } from "react";
import { View, Text, Pressable, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  Wallet,
  Dumbbell,
  UtensilsCrossed,
  ArrowRight,
} from "lucide-react-native";
import type { LucideIcon } from "lucide-react-native";

import {
  ALL_MODULES,
  buildFinalPicks,
  EMPTY_GOALS,
  saveVibePicks,
  saveOnboardingGoals,
  markFirstActionPending,
  markFirstActionStartedAt,
  markOnboardingDone,
  assignVariant,
  getOnboardingHeroCopy,
  isOnboardingDefaultPicksVariant,
  ONBOARDING_HERO_COPY_EXPERIMENT,
  ONBOARDING_DEFAULT_PICKS_EXPERIMENT,
  type DashboardModuleId,
  type OnboardingGoals,
  type OnboardingDefaultPicksVariant,
  type OnboardingHeroCopyVariant,
} from "@sergeant/shared";

import { colors, radius } from "@/theme";
import { mobileKVStore } from "@/lib/storage";
import { ANALYTICS_EVENTS, trackEvent } from "@/lib/analytics";

import { ModulesStep } from "@/core/onboarding/ModulesStep";
import { GoalsStep } from "@/core/onboarding/GoalsStep";
import {
  PermissionsStep,
  type PermissionPromptResult,
} from "@/core/onboarding/PermissionsStep";
import { StepIndicator } from "@/core/onboarding/StepIndicator";

interface Slide {
  Icon: LucideIcon;
  color: string;
  title: string;
  desc: string;
}

const SLIDES: Slide[] = [
  {
    Icon: Wallet,
    color: "#7c6af7",
    title: "Фінанси під контролем",
    desc: "Відстежуй витрати, будуй бюджети та розумій, куди йдуть гроші — все в одному місці.",
  },
  {
    Icon: Dumbbell,
    color: "#0d9488",
    title: "Тренування без зупинок",
    desc: "Програми, логи тренувань та прогрес — для тих, хто хоче результату.",
  },
  {
    Icon: UtensilsCrossed,
    color: "#84cc16",
    title: "Харчування по-людськи",
    desc: "Логуй їжу, відстежуй КБЖУ та будуй здорові звички без зайвого стресу.",
  },
];

/**
 * Wizard phases rendered after the intro slides. Mirrors the web
 * OnboardingWizard data structure (module grid → goals → JIT
 * permissions), adapted to a native multi-step flow rather than a web
 * modal. Intro slides stay mobile-only marketing chrome ahead of the
 * shared funnel.
 */
type WizardStep = "modules" | "goals" | "permissions";
const WIZARD_STEPS: readonly WizardStep[] = ["modules", "goals", "permissions"];

interface WizardState {
  step: WizardStep;
  picks: DashboardModuleId[];
  goals: OnboardingGoals;
}

type WizardAction =
  | { type: "NEXT" }
  | { type: "BACK" }
  | { type: "TOGGLE_PICK"; id: DashboardModuleId }
  | { type: "SET_GOAL"; key: keyof OnboardingGoals; value: unknown };

// Local 3-step reducer ("permissions" extends the shared 3-step
// taxonomy, so we cannot reuse `@/core/onboarding/wizardState`, which is
// pinned to the shared `welcome → modules → goals` sequence).
function wizardReducer(state: WizardState, action: WizardAction): WizardState {
  switch (action.type) {
    case "NEXT": {
      const idx = WIZARD_STEPS.indexOf(state.step);
      const next = WIZARD_STEPS[idx + 1];
      return next ? { ...state, step: next } : state;
    }
    case "BACK": {
      const idx = WIZARD_STEPS.indexOf(state.step);
      const prev = WIZARD_STEPS[idx - 1];
      return prev ? { ...state, step: prev } : state;
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

export default function OnboardingScreen() {
  const router = useRouter();

  // Default-picks A/B (S6.1) — same deterministic per-device assignment
  // the web wizard uses so a single user sees the same arm on both
  // surfaces. `none` starts the grid empty and disables «Далі» until a
  // pick is made; `all` pre-checks every module.
  const defaultPicksVariant = useMemo<OnboardingDefaultPicksVariant>(() => {
    const raw = assignVariant(
      mobileKVStore,
      ONBOARDING_DEFAULT_PICKS_EXPERIMENT,
    );
    return isOnboardingDefaultPicksVariant(raw) ? raw : "all";
  }, []);

  // Hero copy A/B (S1.1 + S1.2). Used for the final intro slide CTA so
  // the experiment arm controls the "start" wording, matching web.
  const heroVariant = useMemo<OnboardingHeroCopyVariant>(
    () =>
      assignVariant(
        mobileKVStore,
        ONBOARDING_HERO_COPY_EXPERIMENT,
      ) as OnboardingHeroCopyVariant,
    [],
  );
  const heroCopy = useMemo(
    () => getOnboardingHeroCopy(heroVariant),
    [heroVariant],
  );

  // Wizard state survives intro-slide navigation: `inWizardRef` gates
  // whether the carousel or the step machine renders, so the reducer
  // never resets when the user pages through the intro slides.
  const [state, dispatch] = useReducer(
    wizardReducer,
    undefined,
    (): WizardState => ({
      step: "modules",
      picks: defaultPicksVariant === "none" ? [] : [...ALL_MODULES],
      goals: { ...EMPTY_GOALS },
    }),
  );
  const introIndexRef = useRef(0);
  const inWizardRef = useRef(false);
  // Re-render trigger for the ref-backed intro index / phase flag.
  const [, forceRender] = useReducer((n: number) => n + 1, 0);

  const startedAtRef = useRef<number | null>(null);
  const stepEnteredAtRef = useRef<number>(Date.now());
  const submittingRef = useRef(false);

  // Mount: fire `onboarding_started` + the welcome step view +
  // experiment exposures, matching web's single-screen mount effect.
  useEffect(() => {
    startedAtRef.current = Date.now();
    stepEnteredAtRef.current = startedAtRef.current;
    trackEvent(ANALYTICS_EVENTS.ONBOARDING_STARTED);
    trackEvent(ANALYTICS_EVENTS.ONBOARDING_STEP_VIEWED, { step: "welcome" });
    trackEvent(ANALYTICS_EVENTS.EXPERIMENT_EXPOSED, {
      experiment_id: ONBOARDING_HERO_COPY_EXPERIMENT.id,
      variant: heroVariant,
    });
    trackEvent(ANALYTICS_EVENTS.EXPERIMENT_EXPOSED, {
      experiment_id: ONBOARDING_DEFAULT_PICKS_EXPERIMENT.id,
      variant: defaultPicksVariant,
    });
  }, [heroVariant, defaultPicksVariant]);

  // Persist picks on every change so a backgrounded / killed app
  // resumes the in-progress selection (web persists picks on each
  // state change too).
  useEffect(() => {
    saveVibePicks(mobileKVStore, state.picks);
  }, [state.picks]);

  const togglePick = useCallback((id: DashboardModuleId) => {
    dispatch({ type: "TOGGLE_PICK", id });
  }, []);

  const setGoal = useCallback(
    (key: keyof OnboardingGoals, value: unknown) => {
      dispatch({ type: "SET_GOAL", key, value });
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
    [],
  );

  const goToSignUp = useCallback(() => {
    router.replace("/(auth)/sign-up");
  }, [router]);

  const skipAll = useCallback(() => {
    trackEvent(ANALYTICS_EVENTS.ONBOARDING_SKIPPED, {
      step: inWizardRef.current ? state.step : "welcome",
      durationMs: Math.max(0, Date.now() - (startedAtRef.current ?? Date.now())),
    });
    goToSignUp();
  }, [state.step, goToSignUp]);

  // Intro carousel navigation. The last slide hands off to the wizard.
  const advanceIntro = useCallback(() => {
    if (introIndexRef.current < SLIDES.length - 1) {
      introIndexRef.current += 1;
      forceRender();
      return;
    }
    inWizardRef.current = true;
    stepEnteredAtRef.current = Date.now();
    forceRender();
  }, []);

  const handleNext = useCallback(() => {
    // S6.1 / B-1: `none` arm never advances modules step with no picks.
    if (
      state.step === "modules" &&
      state.picks.length === 0 &&
      defaultPicksVariant === "none"
    ) {
      return;
    }
    const leaving = state.step;
    const durationMs = Math.max(0, Date.now() - stepEnteredAtRef.current);
    trackEvent(ANALYTICS_EVENTS.ONBOARDING_STEP_COMPLETED, {
      step: leaving,
      durationMs,
    });
    if (leaving === "modules") {
      const chosen = buildFinalPicks(state.picks, ALL_MODULES);
      trackEvent(ANALYTICS_EVENTS.ONBOARDING_VIBE_PICKED, {
        picks: chosen,
        picksCount: chosen.length,
      });
    }
    stepEnteredAtRef.current = Date.now();
    dispatch({ type: "NEXT" });
    trackEvent(ANALYTICS_EVENTS.ONBOARDING_STEP_VIEWED, {
      step: nextStep(leaving),
    });
  }, [state.step, state.picks, defaultPicksVariant]);

  const handleBack = useCallback(() => {
    stepEnteredAtRef.current = Date.now();
    dispatch({ type: "BACK" });
  }, []);

  const reportPermission = useCallback(
    (permission: "notifications" | "camera", result: PermissionPromptResult) => {
      trackEvent(ANALYTICS_EVENTS.PERMISSION_REQUESTED, {
        type: permission,
        context: "onboarding",
      });
      if (result === "granted") {
        trackEvent(ANALYTICS_EVENTS.PERMISSION_GRANTED, {
          type: permission,
          context: "onboarding",
        });
      } else if (result === "denied") {
        trackEvent(ANALYTICS_EVENTS.PERMISSION_DENIED, {
          type: permission,
          context: "onboarding",
        });
      }
    },
    [],
  );

  const handlePushResult = useCallback(
    (result: PermissionPromptResult) => reportPermission("notifications", result),
    [reportPermission],
  );

  const handleCameraResult = useCallback(
    (result: PermissionPromptResult) => reportPermission("camera", result),
    [reportPermission],
  );

  const finish = useCallback(() => {
    if (submittingRef.current) return;
    const hadEmptyPicks = state.picks.length === 0;
    // S6.1: `none` arm never silently writes ALL_MODULES.
    if (hadEmptyPicks && defaultPicksVariant === "none") return;

    submittingRef.current = true;
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
    goToSignUp();
  }, [state.picks, state.goals, state.step, defaultPicksVariant, goToSignUp]);

  // -- Intro carousel -------------------------------------------------------
  if (!inWizardRef.current) {
    const slide = SLIDES[introIndexRef.current]!;
    const isLast = introIndexRef.current === SLIDES.length - 1;
    return (
      <SafeAreaView className="flex-1 bg-bg px-6">
        <Pressable
          className="self-end pt-4 pb-6 active:opacity-70"
          onPress={skipAll}
          accessibilityRole="button"
          accessibilityLabel="Пропустити"
        >
          <Text className="text-muted text-sm">Пропустити</Text>
        </Pressable>

        <View className="flex-1 items-center justify-center gap-6">
          <View
            className="w-28 h-28 rounded-3xl items-center justify-center"
            style={{
              backgroundColor: slide.color + "22",
              borderWidth: 1.5,
              borderColor: slide.color + "44",
            }}
          >
            <slide.Icon size={48} color={slide.color} strokeWidth={1.5} />
          </View>
          <Text className="text-text text-2xl font-extrabold text-center">
            {slide.title}
          </Text>
          <Text className="text-muted text-base text-center leading-6">
            {slide.desc}
          </Text>
        </View>

        <View className="flex-row justify-center gap-2 mb-4">
          {SLIDES.map((_, i) => (
            <Pressable
              key={i}
              onPress={() => {
                introIndexRef.current = i;
                forceRender();
              }}
            >
              <View
                className="h-2 rounded"
                style={{
                  width: i === introIndexRef.current ? 24 : 8,
                  backgroundColor:
                    i === introIndexRef.current ? slide.color : colors.textMuted,
                }}
              />
            </Pressable>
          ))}
        </View>

        <View className="pb-6">
          <Pressable
            className="flex-row items-center justify-center gap-2 py-4 active:opacity-80"
            style={{ backgroundColor: slide.color, borderRadius: radius.md }}
            onPress={advanceIntro}
            accessibilityRole="button"
          >
            <Text className="text-white text-base font-bold">
              {isLast ? heroCopy.primaryCta : "Далі"}
            </Text>
            <ArrowRight size={18} color="#fff" strokeWidth={2.5} />
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  // -- Wizard ---------------------------------------------------------------
  const stepIdx = WIZARD_STEPS.indexOf(state.step);
  return (
    <SafeAreaView className="flex-1 bg-bg" testID="onboarding-wizard">
      <Pressable
        className="self-end px-6 pt-4 pb-2 active:opacity-70"
        onPress={skipAll}
        accessibilityRole="button"
        accessibilityLabel="Пропустити"
      >
        <Text className="text-muted text-sm">Пропустити</Text>
      </Pressable>
      <ScrollView
        contentContainerClassName="grow justify-center px-6 pb-8"
        keyboardShouldPersistTaps="handled"
      >
        <View className="gap-5">
          <StepIndicator current={stepIdx} total={WIZARD_STEPS.length} />
          {state.step === "modules" && (
            <ModulesStep
              picks={state.picks}
              togglePick={togglePick}
              onContinue={handleNext}
              onBack={() => {
                inWizardRef.current = false;
                forceRender();
              }}
              defaultPicksVariant={defaultPicksVariant}
            />
          )}
          {state.step === "goals" && (
            <GoalsStep
              picks={state.picks}
              goals={state.goals}
              onSetGoal={setGoal}
              onFinish={handleNext}
              onBack={handleBack}
            />
          )}
          {state.step === "permissions" && (
            <PermissionsStep
              picks={state.picks}
              onPushResult={handlePushResult}
              onCameraResult={handleCameraResult}
              onFinish={finish}
              onBack={handleBack}
            />
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function nextStep(current: WizardStep): WizardStep {
  const idx = WIZARD_STEPS.indexOf(current);
  return WIZARD_STEPS[Math.min(idx + 1, WIZARD_STEPS.length - 1)]!;
}
