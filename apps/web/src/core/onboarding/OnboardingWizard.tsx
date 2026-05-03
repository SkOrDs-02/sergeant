import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@shared/lib/ui/cn";
import {
  safeReadStringLS,
  safeWriteLS,
  safeRemoveLS,
} from "@shared/lib/storage/storage";
import { Button } from "@shared/components/ui/Button";
import { Icon } from "@shared/components/ui/Icon";
import { useCelebration } from "@shared/components/ui/CelebrationModal";
import { BrandLogo } from "../app/BrandLogo";
import { trackEvent, ANALYTICS_EVENTS } from "../observability/analytics";
import { OnboardingProgress } from "./OnboardingProgress";
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
import { MODULE_LABELS } from "@shared/lib/modules/moduleLabels";
import {
  ONBOARDING_MODULE_DESCRIPTIONS,
  ONBOARDING_VIBE_ICONS,
  ONBOARDING_VIBE_TEASERS,
} from "@sergeant/shared";

// Re-exported so `App.tsx` and any legacy call-site keep importing
// `shouldShowOnboarding` straight from this file.
export function shouldShowOnboarding() {
  return sharedShouldShowOnboarding();
}

// ---------------------------------------------------------------------------
// Persisted state — picks-only (v2)
// ---------------------------------------------------------------------------
//
// The earlier wizard persisted `{ step, picks, goals }` (4-step flow). The
// one-screen rebuild only needs the user's module picks: goal-questions
// moved to per-module first-run sheets and the permissions interstitial
// became a just-in-time prompt inside the modules that need them.
//
// We bump the storage key to `v2` so a stale `v1` blob from a partially
// completed legacy onboarding never resurrects the old multi-step state.
const ONBOARDING_PICKS_STATE_KEY = "sergeant.onboarding.wizardState.v2";

interface PersistedPicksState {
  picks: string[];
}

function loadPersistedPicks(): string[] {
  const raw = safeReadStringLS(ONBOARDING_PICKS_STATE_KEY);
  if (!raw) return [...ALL_MODULES];
  try {
    const data = JSON.parse(raw) as PersistedPicksState;
    if (
      !data ||
      typeof data !== "object" ||
      !Array.isArray(data.picks) ||
      data.picks.length === 0
    ) {
      return [...ALL_MODULES];
    }
    const allowed: ReadonlySet<string> = new Set(ALL_MODULES);
    return data.picks.filter(
      (p): p is string => typeof p === "string" && allowed.has(p),
    );
  } catch {
    return [...ALL_MODULES];
  }
}

function persistPicks(picks: string[]): void {
  const payload: PersistedPicksState = { picks };
  safeWriteLS(ONBOARDING_PICKS_STATE_KEY, payload);
}

function clearPersistedPicks(): void {
  safeRemoveLS(ONBOARDING_PICKS_STATE_KEY);
}

// ---------------------------------------------------------------------------
// Module-row data
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

function ModuleRow({
  card,
  active,
  expanded,
  onToggle,
}: {
  card: (typeof MODULE_CARDS)[number];
  active: boolean;
  expanded: boolean;
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
        "relative w-full text-left rounded-2xl border transition-all duration-200",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/45",
        expanded ? "p-3.5" : "p-3",
        active
          ? `${activeClasses.border} ${activeClasses.bg} shadow-card`
          : "border-line bg-panel hover:border-brand-500/30",
      )}
    >
      <span
        className={cn(
          "absolute top-2.5 right-2.5 w-5 h-5 rounded-full text-white flex items-center justify-center transition-opacity",
          active ? activeClasses.check : "bg-panelHi/0",
          active ? "opacity-100" : "opacity-0",
        )}
        aria-hidden
      >
        <Icon name="check" size={12} strokeWidth={3} />
      </span>
      <div className="flex items-center gap-3">
        <span
          className={cn(
            "shrink-0 rounded-xl flex items-center justify-center",
            expanded ? "w-10 h-10" : "w-9 h-9",
            active ? activeClasses.icon : "bg-panelHi text-muted",
          )}
          aria-hidden
        >
          <Icon name={card.icon} size={expanded ? 20 : 18} strokeWidth={2} />
        </span>
        <div className="min-w-0 flex-1 pr-7">
          <span className="block text-sm font-bold text-text leading-tight">
            {card.label}
          </span>
          {expanded ? (
            <>
              <span className="block text-xs text-muted mt-0.5 leading-snug">
                {card.description}
              </span>
              <span className="block text-meta text-subtle mt-1 leading-tight">
                {card.teaser}
              </span>
            </>
          ) : (
            <span className="block text-meta text-subtle mt-0.5 leading-tight">
              {card.teaser}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

// ---------------------------------------------------------------------------
// One-screen welcome
// ---------------------------------------------------------------------------

/**
 * One-screen FTUX content. Hero copy + 4 module rows (all checked by
 * default) + primary CTA + tertiary toggle to expand the rows with
 * description / teaser copy. Replaces the previous 4-step wizard
 * (welcome → modules → goals → permissions).
 *
 * Goals moved to per-module first-run sheets — the relevant question
 * shows the first time the user opens that module, not upfront.
 *
 * Permissions moved to just-in-time prompts — push is asked when the
 * user taps a "remind me" affordance inside a module (already wired in
 * `useRoutineReminders` and `usePushNotifications`), camera/mic when
 * the relevant feature is invoked.
 */
function WelcomeOneScreen({
  picks,
  togglePick,
  onOpen,
  expanded,
  onToggleExpanded,
}: {
  picks: string[];
  togglePick: (id: string) => void;
  onOpen: () => void;
  expanded: boolean;
  onToggleExpanded: () => void;
}) {
  return (
    <div className="flex flex-col items-center text-center space-y-5">
      <div className="space-y-2">
        <h2 className="text-style-hero text-text">
          <BrandLogo
            size="md"
            variant="inline"
            className="inline-flex align-baseline"
          />{" "}
          — твій хаб.
        </h2>
        <p className="text-sm text-muted leading-relaxed max-w-xs mx-auto">
          Гроші, тіло, звички, їжа — все в одному місці. Офлайн. Приватно.
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
          ~10 сек
        </span>
      </div>

      <div className="w-full space-y-2">
        {MODULE_CARDS.map((card, idx) => (
          <div
            key={card.id}
            className="motion-safe:animate-module-card"
            style={{ animationDelay: `${idx * 50}ms` }}
          >
            <ModuleRow
              card={card}
              active={picks.includes(card.id)}
              expanded={expanded}
              onToggle={() => togglePick(card.id)}
            />
          </div>
        ))}
      </div>

      <div className="w-full">
        <OnboardingProgress
          activeModules={picks}
          totalModules={ALL_MODULES.length}
        />
      </div>

      <Button
        type="button"
        onClick={onOpen}
        variant="primary"
        size="lg"
        className="w-full"
      >
        Відкрити Sergeant
        <Icon name="chevron-right" size={16} />
      </Button>

      <button
        type="button"
        onClick={onToggleExpanded}
        aria-expanded={expanded}
        className="w-full text-xs text-muted hover:text-text transition-colors py-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/45 rounded inline-flex items-center justify-center gap-1.5"
      >
        <Icon
          name={expanded ? "chevron-up" : "chevron-down"}
          size={12}
          aria-hidden
        />
        {expanded ? "Згорнути" : "Налаштувати модулі"}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main wizard
// ---------------------------------------------------------------------------

/**
 * One-screen onboarding (v3).
 *
 * Hero + 4 module checkboxes (all on by default) + primary CTA. Tap
 * once → hub. Goal questions moved to per-module first-run sheets;
 * push permission asked just-in-time when the user enables a reminder
 * inside a module.
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
  const [picks, setPicks] = useState<string[]>(loadPersistedPicks);
  const [expanded, setExpanded] = useState(false);
  const { confetti, CelebrationComponent } = useCelebration();

  // Persist picks on every change. Payload is tiny (≤4 strings) so
  // unconditional writes are cheap and keep the resume-after-refresh
  // story trivial.
  useEffect(() => {
    persistPicks(picks);
  }, [picks]);

  // The wizard is a single-screen flow (welcome → finish), so the
  // first paint counts as both `onboarding_started` and the welcome
  // step's `onboarding_step_viewed`. Capture both in one effect so
  // the funnel definition in `posthog-ftux-dashboards.md` stays a
  // strict superset of `started`.
  const startedAtRef = useRef(Date.now());
  useEffect(() => {
    trackEvent(ANALYTICS_EVENTS.ONBOARDING_STARTED);
    trackEvent(ANALYTICS_EVENTS.ONBOARDING_STEP_VIEWED, { step: "welcome" });
  }, []);

  const togglePick = useCallback((id: string) => {
    setPicks((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id],
    );
  }, []);

  const toggleExpanded = useCallback(() => {
    setExpanded((v) => !v);
  }, []);

  const finish = useCallback(() => {
    // Empty selection falls back to all modules: the lazy "tap-through"
    // path leaves every module visible on the hub instead of producing
    // a useless dashboard.
    const hadEmptyPicks = picks.length === 0;
    const chosen = hadEmptyPicks ? [...ALL_MODULES] : picks;
    saveVibePicks(chosen as never[]);

    trackEvent(ANALYTICS_EVENTS.ONBOARDING_VIBE_PICKED, {
      picks: chosen,
      picksCount: chosen.length,
    });
    trackEvent(ANALYTICS_EVENTS.ONBOARDING_STEP_COMPLETED, {
      step: "welcome",
      durationMs: Math.max(0, Date.now() - startedAtRef.current),
    });
    trackEvent(ANALYTICS_EVENTS.ONBOARDING_COMPLETED, {
      intent: hadEmptyPicks ? "vibe_empty" : "vibe_picked",
      picksCount: chosen.length,
    });

    markFirstActionStartedAt();
    markFirstActionPending();
    markOnboardingDone();
    clearPersistedPicks();

    confetti("Готово!", "Твій Sergeant налаштовано. Час діяти!", "high");

    // Hold the celebration on screen long enough for the user to read the
    // copy and enjoy the confetti before the wizard unmounts and the modal
    // disappears with it. The CelebrationModal's own `autoCloseMs` (11s) is
    // bounded by this timer because the modal lives inside the wizard tree.
    setTimeout(() => {
      onDone(null, {
        intent: hadEmptyPicks ? "vibe_empty" : "vibe_picked",
        picks: chosen,
      });
    }, 3500);
  }, [picks, onDone, confetti]);

  const content = useMemo(
    () => (
      <WelcomeOneScreen
        picks={picks}
        togglePick={togglePick}
        onOpen={finish}
        expanded={expanded}
        onToggleExpanded={toggleExpanded}
      />
    ),
    [picks, togglePick, finish, expanded, toggleExpanded],
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
        className="fixed inset-0 z-500 flex items-end sm:items-center justify-center p-4 pb-safe"
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
