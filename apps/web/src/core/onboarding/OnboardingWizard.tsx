import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import { cn } from "@shared/lib/cn";
import {
  safeReadStringLS,
  safeWriteLS,
  safeRemoveLS,
} from "@shared/lib/storage";
import { Button } from "@shared/components/ui/Button";
import { Card, type CardVariant } from "@shared/components/ui/Card";
import { Icon } from "@shared/components/ui/Icon";
import { useCelebration } from "@shared/components/ui/CelebrationModal";
import { BrandLogo } from "../app/BrandLogo";
import { trackEvent, ANALYTICS_EVENTS } from "../observability/analytics";
import {
  ALL_MODULES,
  markFirstActionPending,
  markFirstActionStartedAt,
  saveVibePicks,
} from "./vibePicks";
import {
  markOnboardingDone,
  shouldShowOnboarding as sharedShouldShowOnboarding,
} from "./onboardingGate";
import { PermissionsPrompt } from "./PermissionsPrompt";
import { MODULE_LABELS } from "@shared/lib/moduleLabels";
import {
  ONBOARDING_MODULE_DESCRIPTIONS,
  ONBOARDING_STEPS,
  ONBOARDING_VIBE_ICONS,
  ONBOARDING_VIBE_TEASERS,
  type OnboardingStepId,
} from "@sergeant/shared";
import {
  EMPTY_GOALS,
  getGoalQuestions,
  saveOnboardingGoals,
  type GoalQuestion,
  type OnboardingGoals,
} from "@sergeant/shared";

// Re-exported so `App.tsx` and any legacy call-site keep importing
// `shouldShowOnboarding` straight from this file.
export function shouldShowOnboarding() {
  return sharedShouldShowOnboarding();
}

// ---------------------------------------------------------------------------
// Wizard state
// ---------------------------------------------------------------------------

interface WizardState {
  step: OnboardingStepId;
  picks: string[];
  goals: OnboardingGoals;
  stepStartedAt: number;
}

// Персистентний сліпк wizard-state-у. v1 — резерв на майбутнє: якщо
// форма `WizardState` змінюється, бампаємо ключ в v2/v3, щоб легасі-
// кеш не поламав візард.
const ONBOARDING_WIZARD_STATE_KEY = "sergeant.onboarding.wizardState.v1";

interface PersistedWizardState {
  step: OnboardingStepId;
  picks: string[];
  goals: OnboardingGoals;
}

// Не пишемо `stepStartedAt` в localStorage — він релевантний лише в межах
// поточного маунту (міряє час на степ для аналітики; посля рефрешу це
// була б неправдива тривалість «від відкривання вкладки»).
function loadPersistedWizardState(defaultState: WizardState): WizardState {
  const raw = safeReadStringLS(ONBOARDING_WIZARD_STATE_KEY);
  if (!raw) return defaultState;
  try {
    const data = JSON.parse(raw) as PersistedWizardState;
    if (
      !data ||
      typeof data !== "object" ||
      !ONBOARDING_STEPS.includes(data.step) ||
      !Array.isArray(data.picks) ||
      !data.goals ||
      typeof data.goals !== "object"
    ) {
      return defaultState;
    }
    return {
      step: data.step,
      picks: data.picks.filter((p): p is string => typeof p === "string"),
      goals: { ...EMPTY_GOALS, ...data.goals },
      stepStartedAt: Date.now(),
    };
  } catch {
    return defaultState;
  }
}

function persistWizardState(state: WizardState): void {
  const payload: PersistedWizardState = {
    step: state.step,
    picks: state.picks,
    goals: state.goals,
  };
  safeWriteLS(ONBOARDING_WIZARD_STATE_KEY, payload);
}

function clearPersistedWizardState(): void {
  safeRemoveLS(ONBOARDING_WIZARD_STATE_KEY);
}

type WizardAction =
  | { type: "NEXT" }
  | { type: "BACK" }
  | { type: "TOGGLE_PICK"; id: string }
  | { type: "SET_GOAL"; key: keyof OnboardingGoals; value: unknown };

function wizardReducer(state: WizardState, action: WizardAction): WizardState {
  switch (action.type) {
    case "NEXT": {
      const idx = ONBOARDING_STEPS.indexOf(state.step);
      if (idx < ONBOARDING_STEPS.length - 1) {
        return {
          ...state,
          step: ONBOARDING_STEPS[idx + 1],
          stepStartedAt: Date.now(),
        };
      }
      return state;
    }
    case "BACK": {
      const idx = ONBOARDING_STEPS.indexOf(state.step);
      if (idx > 0) {
        return {
          ...state,
          step: ONBOARDING_STEPS[idx - 1],
          stepStartedAt: Date.now(),
        };
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
// Step indicator (3 dots)
// ---------------------------------------------------------------------------

function StepIndicator({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center justify-center gap-1.5" aria-hidden>
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          className={cn(
            "rounded-full transition-all duration-300",
            i === current
              ? "w-6 h-1.5 bg-brand-500"
              : "w-1.5 h-1.5 bg-muted/30",
          )}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 1: Welcome
// ---------------------------------------------------------------------------

function WelcomeStep({ onContinue }: { onContinue: () => void }) {
  return (
    <div className="flex flex-col items-center text-center space-y-6">
      <div className="flex items-center gap-2">
        <div className="w-12 h-12 rounded-2xl bg-finyk/15 border border-finyk/30 flex items-center justify-center">
          <Icon
            name="credit-card"
            size={22}
            className="text-finyk"
            aria-hidden
          />
        </div>
        <div className="w-12 h-12 rounded-2xl bg-fizruk/15 border border-fizruk/30 flex items-center justify-center">
          <Icon name="dumbbell" size={22} className="text-fizruk" aria-hidden />
        </div>
        <div className="w-12 h-12 rounded-2xl bg-routine-surface border border-routine/30 flex items-center justify-center">
          <Icon name="check" size={22} className="text-routine" aria-hidden />
        </div>
        <div className="w-12 h-12 rounded-2xl bg-nutrition-soft border border-nutrition/30 flex items-center justify-center">
          <Icon
            name="utensils"
            size={22}
            className="text-nutrition"
            aria-hidden
          />
        </div>
      </div>
      <div className="space-y-2">
        <h2 className="text-2xl font-bold text-text">
          Привіт. Це{" "}
          <BrandLogo
            size="md"
            variant="inline"
            className="inline-flex align-baseline"
          />
          .
        </h2>
        <p className="text-sm text-muted leading-relaxed max-w-xs mx-auto">
          Гроші, тіло, звички, їжа — все в одному місці. Офлайн. Приватно. Через
          хвилину побачиш свій хаб.
        </p>
      </div>
      <div className="flex items-center gap-3 text-xs text-muted">
        <span className="flex items-center gap-1">
          <Icon name="wifi-off" size={14} aria-hidden />
          Офлайн
        </span>
        <span className="flex items-center gap-1">
          <Icon name="lock" size={14} aria-hidden />
          Локально
        </span>
        <span className="flex items-center gap-1">
          <Icon name="zap" size={14} aria-hidden />
          ~30 сек
        </span>
      </div>
      <Button
        type="button"
        onClick={onContinue}
        variant="primary"
        size="lg"
        className="w-full"
      >
        Далі
        <Icon name="chevron-right" size={16} />
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 2: Module selection (ModuleCards)
// ---------------------------------------------------------------------------

const MODULE_ACTIVE_CLASSES: Record<
  string,
  { border: string; bg: string; icon: string; check: string }
> = {
  finyk: {
    border: "border-finyk/60",
    bg: "bg-finyk/8",
    icon: "bg-finyk/15 text-finyk",
    check: "bg-finyk-strong",
  },
  fizruk: {
    border: "border-fizruk/60",
    bg: "bg-fizruk/8",
    icon: "bg-fizruk/15 text-fizruk",
    check: "bg-fizruk-strong",
  },
  routine: {
    border: "border-routine/60",
    bg: "bg-routine/8",
    icon: "bg-routine/15 text-routine",
    check: "bg-routine-strong",
  },
  nutrition: {
    border: "border-nutrition/60",
    bg: "bg-nutrition/8",
    icon: "bg-nutrition/15 text-nutrition",
    check: "bg-nutrition-strong",
  },
};

const MODULE_CARDS = ALL_MODULES.map((id) => ({
  id,
  icon: ONBOARDING_VIBE_ICONS[id],
  label: MODULE_LABELS[id],
  teaser: ONBOARDING_VIBE_TEASERS[id],
  description: ONBOARDING_MODULE_DESCRIPTIONS[id],
}));

function ModuleCard({
  card,
  active,
  onToggle,
}: {
  card: (typeof MODULE_CARDS)[number];
  active: boolean;
  onToggle: () => void;
}) {
  const activeClasses = MODULE_ACTIVE_CLASSES[card.id] ?? {
    border: "border-brand-500/60",
    bg: "bg-brand-500/8",
    icon: "bg-brand-500/15 text-brand-strong dark:text-brand",
    check: "bg-brand-strong",
  };

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={active}
      className={cn(
        "relative w-full text-left p-3.5 rounded-2xl border transition-all duration-200",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/45",
        active
          ? `${activeClasses.border} ${activeClasses.bg} shadow-card`
          : "border-line bg-panel hover:border-brand-500/30",
      )}
    >
      {active && (
        <span
          className={cn(
            "absolute top-2.5 right-2.5 w-5 h-5 rounded-full text-white flex items-center justify-center",
            activeClasses.check,
          )}
        >
          <Icon name="check" size={12} strokeWidth={3} />
        </span>
      )}
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "shrink-0 w-10 h-10 rounded-xl flex items-center justify-center",
            active ? activeClasses.icon : "bg-panelHi text-muted",
          )}
          aria-hidden
        >
          <Icon name={card.icon} size={20} strokeWidth={2} />
        </span>
        <div className="min-w-0 flex-1 pr-4">
          <span className="block text-sm font-bold text-text leading-tight">
            {card.label}
          </span>
          <span className="block text-xs text-muted mt-0.5 leading-snug">
            {card.description}
          </span>
          <span className="block text-[11px] text-subtle mt-1 leading-tight">
            {card.teaser}
          </span>
        </div>
      </div>
    </button>
  );
}

function ModulesStep({
  picks,
  togglePick,
  onContinue,
  onBack,
}: {
  picks: string[];
  togglePick: (id: string) => void;
  onContinue: () => void;
  onBack: () => void;
}) {
  return (
    <div className="flex flex-col items-center text-center space-y-4">
      <div className="space-y-1">
        <h2 className="text-xl font-bold text-text">Що тобі важливо?</h2>
        <p className="text-xs text-muted">
          Обери модулі — решту легко додати потім.
        </p>
      </div>
      <div className="w-full space-y-2">
        {MODULE_CARDS.map((card, idx) => (
          <div
            key={card.id}
            className="motion-safe:animate-module-card"
            style={{ animationDelay: `${idx * 60}ms` }}
          >
            <ModuleCard
              card={card}
              active={picks.includes(card.id)}
              onToggle={() => togglePick(card.id)}
            />
          </div>
        ))}
      </div>
      <p className="text-[11px] text-center text-muted min-h-[16px]">
        {picks.length === 0
          ? "Пропустиш вибір — отримаєш усі 4 модулі 🎉"
          : `Обрано: ${picks.length} з ${ALL_MODULES.length}`}
      </p>
      <div className="w-full flex gap-2">
        <Button
          type="button"
          onClick={onBack}
          variant="ghost"
          size="lg"
          className="w-auto px-4"
        >
          <Icon name="chevron-left" size={16} />
        </Button>
        <Button
          type="button"
          onClick={onContinue}
          variant="primary"
          size="lg"
          className="flex-1"
        >
          Далі
          <Icon name="chevron-right" size={16} />
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 3: Goal-setting
// ---------------------------------------------------------------------------

function GoalRadioGroup({
  question,
  value,
  onChange,
}: {
  question: GoalQuestion;
  value: string | null;
  onChange: (v: string) => void;
}) {
  if (!question.options) return null;
  return (
    <div className="space-y-1.5">
      <p className="text-sm font-semibold text-text text-left">
        {question.title}
      </p>
      <div className="flex flex-wrap gap-2">
        {question.options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={cn(
              "px-3.5 py-2 rounded-xl border text-sm font-medium transition-all duration-150",
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/45",
              value === opt.value
                ? "border-brand-500/60 bg-brand-500/10 text-brand-strong dark:text-brand"
                : "border-line bg-panel text-text hover:border-brand-500/30",
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function GoalSlider({
  question,
  value,
  onChange,
}: {
  question: GoalQuestion;
  value: number | null;
  onChange: (v: number) => void;
}) {
  const s = question.slider;
  if (!s) return null;
  const current = value ?? Math.round((s.min + s.max) / 2);
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between">
        <p className="text-sm font-semibold text-text text-left">
          {question.title}
        </p>
        <span className="text-sm font-bold text-brand-strong dark:text-brand tabular-nums">
          {current.toLocaleString("uk-UA")}
          {s.unit}
        </span>
      </div>
      <input
        type="range"
        min={s.min}
        max={s.max}
        step={s.step}
        value={current}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-brand-500"
      />
      <div className="flex justify-between text-[11px] text-muted">
        <span>
          {s.min.toLocaleString("uk-UA")}
          {s.unit}
        </span>
        <span>
          {s.max.toLocaleString("uk-UA")}
          {s.unit}
        </span>
      </div>
    </div>
  );
}

/** Map question id → OnboardingGoals key. */
const GOAL_KEY_MAP: Record<string, keyof OnboardingGoals> = {
  finyk_budget: "finykBudget",
  fizruk_weekly: "fizrukWeeklyGoal",
  routine_first_habit: "routineFirstHabit",
  nutrition_goal: "nutritionGoal",
};

/** Per-module card style hooks for the goal-step soft cards. */
const GOAL_MODULE_STYLES: Record<
  string,
  { variant: CardVariant; iconBg: string; iconColor: string }
> = {
  finyk: {
    variant: "finyk-soft",
    iconBg: "bg-finyk/15",
    iconColor: "text-finyk",
  },
  fizruk: {
    variant: "fizruk-soft",
    iconBg: "bg-fizruk/15",
    iconColor: "text-fizruk",
  },
  routine: {
    variant: "routine-soft",
    iconBg: "bg-routine/15",
    iconColor: "text-routine",
  },
  nutrition: {
    variant: "nutrition-soft",
    iconBg: "bg-nutrition/15",
    iconColor: "text-nutrition",
  },
};

function GoalsStep({
  picks,
  goals,
  onSetGoal,
  onFinish,
  onBack,
}: {
  picks: string[];
  goals: OnboardingGoals;
  onSetGoal: (key: keyof OnboardingGoals, value: unknown) => void;
  onFinish: () => void;
  onBack: () => void;
}) {
  const questions = useMemo(() => getGoalQuestions(picks as never[]), [picks]);
  const hasQuestions = questions.length > 0;

  return (
    <div className="flex flex-col items-center text-center space-y-4">
      <div className="space-y-1">
        <h2 className="text-xl font-bold text-text">
          {hasQuestions ? "Твої цілі" : "Готово!"}
        </h2>
        <p className="text-xs text-muted">
          {hasQuestions
            ? "Необов'язково — можна пропустити."
            : "Налаштуй деталі потім у кожно��у модулі."}
        </p>
      </div>

      {hasQuestions && (
        <div className="w-full space-y-2.5 text-left">
          {questions.map((q) => {
            const goalKey = GOAL_KEY_MAP[q.id];
            const style = GOAL_MODULE_STYLES[q.module];
            const moduleIcon = ONBOARDING_VIBE_ICONS[q.module];
            const moduleLabel = MODULE_LABELS[q.module];
            const inner =
              q.type === "radio" ? (
                <GoalRadioGroup
                  question={q}
                  value={(goals[goalKey] as string | null) ?? null}
                  onChange={(v) => {
                    onSetGoal(goalKey, v);
                    trackEvent(ANALYTICS_EVENTS.ONBOARDING_GOAL_SET, {
                      module: q.module,
                      goalType: q.id,
                      value: v,
                    });
                  }}
                />
              ) : (
                <GoalSlider
                  question={q}
                  value={(goals[goalKey] as number | null) ?? null}
                  onChange={(v) => {
                    onSetGoal(goalKey, v);
                    trackEvent(ANALYTICS_EVENTS.ONBOARDING_GOAL_SET, {
                      module: q.module,
                      goalType: q.id,
                      value: v,
                    });
                  }}
                />
              );
            return (
              <Card
                key={q.id}
                variant={style?.variant ?? "flat"}
                radius="md"
                padding="sm"
                className="space-y-2.5"
              >
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      "shrink-0 w-7 h-7 rounded-lg flex items-center justify-center",
                      style?.iconBg ?? "bg-panelHi",
                      style?.iconColor ?? "text-muted",
                    )}
                    aria-hidden
                  >
                    <Icon name={moduleIcon} size={14} strokeWidth={2.25} />
                  </span>
                  <span className="text-xs font-semibold text-subtle">
                    {moduleLabel}
                  </span>
                </div>
                {inner}
              </Card>
            );
          })}
        </div>
      )}

      <div className="w-full flex gap-2">
        <Button
          type="button"
          onClick={onBack}
          variant="ghost"
          size="lg"
          className="w-auto px-4"
        >
          <Icon name="chevron-left" size={16} />
        </Button>
        <Button
          type="button"
          onClick={onFinish}
          variant="primary"
          size="lg"
          className="flex-1"
        >
          Відкрити Sergeant
          <Icon name="chevron-right" size={16} />
        </Button>
      </div>
      {hasQuestions && (
        <button
          type="button"
          onClick={onFinish}
          className="w-full text-xs text-muted hover:text-text transition-colors py-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/45 rounded"
        >
          Пропустити налаштування
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main wizard
// ---------------------------------------------------------------------------

/**
 * Multi-step onboarding wizard (v2).
 *
 * 3 steps: Welcome → Module selection → Goal-setting → Hub.
 *
 * Renders as a modal overlay (default) or inline card (`fullPage`
 * variant) inside the `/welcome` route.
 */
export function OnboardingWizard({
  onDone,
  variant = "modal",
}: {
  onDone: (
    startModuleId: string | null,
    opts?: { intent: string; picks: string[] },
  ) => void;
  variant?: "modal" | "fullPage";
}) {
  // Ледача ініціалізація з localStorage: якщо юзер вже починав візард і рефрешнув
  // вкладку / прийшов знову пізніше — відновлюємо step + picks + goals,
  // щоб не було «старт з нуля». Раніше рефреш фактично ресетив візард,
  // роблячи їх лопатою професійної фрустрації.
  const [state, dispatch] = useReducer(
    wizardReducer,
    {
      step: "welcome",
      picks: [],
      goals: { ...EMPTY_GOALS },
      stepStartedAt: Date.now(),
    } as WizardState,
    loadPersistedWizardState,
  );

  // Пишемо на кожну зміну. Обсяг даних малий (3 фільди) — писати без
  // дебаунсу безпечно і не впливає на perf-якість.
  useEffect(() => {
    persistWizardState(state);
  }, [state]);
  const [showPermissions, setShowPermissions] = useState(false);
  const { confetti, CelebrationComponent } = useCelebration();

  // Track wizard start
  useEffect(() => {
    trackEvent(ANALYTICS_EVENTS.ONBOARDING_STARTED);
    trackEvent(ANALYTICS_EVENTS.ONBOARDING_STEP_VIEWED, { step: "welcome" });
  }, []);

  // Track step views
  const trackStepTransition = useCallback(
    (fromStep: OnboardingStepId, toStep: OnboardingStepId) => {
      const duration = Date.now() - state.stepStartedAt;
      trackEvent(ANALYTICS_EVENTS.ONBOARDING_STEP_COMPLETED, {
        step: fromStep,
        durationMs: duration,
      });
      trackEvent(ANALYTICS_EVENTS.ONBOARDING_STEP_VIEWED, { step: toStep });
    },
    [state.stepStartedAt],
  );

  const handleNext = useCallback(() => {
    const idx = ONBOARDING_STEPS.indexOf(state.step);
    if (idx < ONBOARDING_STEPS.length - 1) {
      trackStepTransition(state.step, ONBOARDING_STEPS[idx + 1]);
    }
    dispatch({ type: "NEXT" });
  }, [state.step, trackStepTransition]);

  const handleBack = useCallback(() => {
    dispatch({ type: "BACK" });
  }, []);

  const togglePick = useCallback((id: string) => {
    dispatch({ type: "TOGGLE_PICK", id });
  }, []);

  const setGoal = useCallback((key: keyof OnboardingGoals, value: unknown) => {
    dispatch({ type: "SET_GOAL", key, value });
  }, []);

  const finish = useCallback(() => {
    const chosen = state.picks.length > 0 ? state.picks : [...ALL_MODULES];
    saveVibePicks(chosen as never[]);

    // Persist goals
    saveOnboardingGoals(
      {
        getString: (k) => safeReadStringLS(k),
        setString: (k, v) => {
          safeWriteLS(k, v);
        },
        remove: (k) => {
          safeRemoveLS(k);
        },
      },
      {
        ...state.goals,
        fizrukWeeklyGoal: state.goals.fizrukWeeklyGoal
          ? Number(state.goals.fizrukWeeklyGoal)
          : null,
      },
    );

    // Track completion
    trackEvent(ANALYTICS_EVENTS.ONBOARDING_STEP_COMPLETED, {
      step: "permissions",
    });
    trackEvent(ANALYTICS_EVENTS.ONBOARDING_VIBE_PICKED, {
      picks: chosen,
      picksCount: chosen.length,
    });
    trackEvent(ANALYTICS_EVENTS.ONBOARDING_COMPLETED, {
      intent: "vibe_empty",
      picksCount: chosen.length,
      hasGoals: Object.values(state.goals).some((v) => v !== null),
    });

    markFirstActionStartedAt();
    markFirstActionPending();
    markOnboardingDone();
    clearPersistedWizardState();

    // Show celebration before navigating
    confetti("Готово!", "Твій Sergeant налаштовано. Час діяти!", "high");

    // Delay navigation slightly to let celebration show
    setTimeout(() => {
      onDone(null, { intent: "vibe_empty", picks: chosen });
    }, 800);
  }, [state.picks, state.goals, onDone, confetti]);

  // «Пропустити онбординг» — хуткий вихід для юзерів, що вже знають
  // Sergeant або відкрили додаток вдруге (інший браузер / приватний вікно),
  // єй не варто проходити весь flow знову. Зберігаємо всі модулі (як fallback
  // в `finish()` при порожньому picks), не пишемо goals, позначаємо
  // first-action-pending і markOnboardingDone. Без конфетті: юзер вибрав skip
  // — celebration була б dissonance.
  const handleSkip = useCallback(() => {
    saveVibePicks([...ALL_MODULES] as never[]);
    trackEvent(ANALYTICS_EVENTS.ONBOARDING_COMPLETED, {
      intent: "skip",
      picksCount: ALL_MODULES.length,
      hasGoals: false,
    });
    markFirstActionStartedAt();
    markFirstActionPending();
    markOnboardingDone();
    clearPersistedWizardState();
    onDone(null, { intent: "skip", picks: [...ALL_MODULES] });
  }, [onDone]);

  const stepIdx = ONBOARDING_STEPS.indexOf(state.step);

  // Track transition direction for animation
  const [direction, setDirection] = useState<"forward" | "backward">("forward");
  const stepKeyRef = useRef(0);

  const animatedNext = useCallback(() => {
    setDirection("forward");
    stepKeyRef.current += 1;
    handleNext();
  }, [handleNext]);

  const animatedBack = useCallback(() => {
    setDirection("backward");
    stepKeyRef.current += 1;
    handleBack();
  }, [handleBack]);

  const goToPermissions = useCallback(() => {
    setDirection("forward");
    stepKeyRef.current += 1;
    trackEvent(ANALYTICS_EVENTS.ONBOARDING_STEP_COMPLETED, {
      step: "goals",
      durationMs: Date.now() - state.stepStartedAt,
    });
    trackEvent(ANALYTICS_EVENTS.ONBOARDING_STEP_VIEWED, {
      step: "permissions",
    });
    setShowPermissions(true);
  }, [state.stepStartedAt]);

  const finishFromPermissions = useCallback(() => {
    setDirection("forward");
    finish();
  }, [finish]);

  const backFromPermissions = useCallback(() => {
    setDirection("backward");
    stepKeyRef.current += 1;
    setShowPermissions(false);
  }, []);

  const transitionClass =
    direction === "forward"
      ? "motion-safe:animate-step-forward"
      : "motion-safe:animate-step-backward";

  const totalSteps = ONBOARDING_STEPS.length + 1;
  const currentStepIdx = showPermissions ? ONBOARDING_STEPS.length : stepIdx;
  const content = (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <StepIndicator current={currentStepIdx} total={totalSteps} />
        {/* Skip-CTA: прибирає 3-крокову опору, дає юзеру вийти у дашборд
         * за один тап. Зберігає всі модулі (як fallback `finish()`),
         * але без goals і без celebration. Показ — на всіх степах,
         * крім останнього (permissions): там є власний onComplete,
         * skip туди б додав 3-й конкуруючий CTA. */}
        {!showPermissions && (
          <button
            type="button"
            onClick={handleSkip}
            className="text-xs font-medium text-muted hover:text-text underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 rounded-md px-1.5 py-0.5"
          >
            Пропустити
          </button>
        )}
      </div>
      <div key={stepKeyRef.current} className={transitionClass}>
        {!showPermissions && state.step === "welcome" && (
          <WelcomeStep onContinue={animatedNext} />
        )}
        {!showPermissions && state.step === "modules" && (
          <ModulesStep
            picks={state.picks}
            togglePick={togglePick}
            onContinue={animatedNext}
            onBack={animatedBack}
          />
        )}
        {!showPermissions && state.step === "goals" && (
          <GoalsStep
            picks={state.picks}
            goals={state.goals}
            onSetGoal={setGoal}
            onFinish={goToPermissions}
            onBack={animatedBack}
          />
        )}
        {showPermissions && (
          <PermissionsPrompt
            onComplete={finishFromPermissions}
            onBack={backFromPermissions}
          />
        )}
      </div>
    </div>
  );

  if (variant === "fullPage") {
    return (
      <>
        {CelebrationComponent}
        <div
          className="relative w-full max-w-sm bg-panel border border-line rounded-3xl shadow-float p-6 animate-onboarding-enter"
          aria-label="Вітальний екран"
        >
          {content}
        </div>
      </>
    );
  }

  return (
    <>
      {CelebrationComponent}
      <div
        className="fixed inset-0 z-[500] flex items-end sm:items-center justify-center p-4 pb-safe"
        role="dialog"
        aria-modal="true"
        aria-label="Вітальний екран"
      >
        <div className="absolute inset-0 bg-bg/80 backdrop-blur-md" />
        <div className="relative w-full max-w-sm bg-panel border border-line rounded-3xl shadow-float p-6 animate-onboarding-enter">
          {content}
        </div>
      </div>
    </>
  );
}
