import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@shared/lib/ui/cn";
import {
  safeReadStringLS,
  safeWriteLS,
  safeRemoveLS,
  webKVStore,
} from "@shared/lib/storage/storage";
import { Button } from "@shared/components/ui/Button";
import { Icon } from "@shared/components/ui/Icon";
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
  ONBOARDING_HERO_COPY_EXPERIMENT,
  ONBOARDING_DEFAULT_PICKS_EXPERIMENT,
  assignVariant,
  getOnboardingHeroCopy,
  type OnboardingDefaultPicksVariant,
  type OnboardingHeroCopy,
  type OnboardingHeroCopyVariant,
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

/**
 * Read the user's persisted module picks from localStorage. The
 * empty-state default depends on the {@link defaultPicksVariant}:
 *
 *  - `"none"` (S6.1 opt-in arm): missing / malformed / empty payload
 *    returns `[]`. The wizard then disables its primary CTA until
 *    the user picks ≥1 module — no silent ALL_MODULES fallback.
 *
 *  - `"all"` (legacy control arm): missing / malformed / empty payload
 *    returns `[...ALL_MODULES]`. Pre-S6.1 behaviour.
 *
 * Valid persisted picks are returned filtered against the known
 * module list regardless of variant; only the empty-state branch
 * differs.
 */
function loadPersistedPicks(
  defaultPicksVariant: OnboardingDefaultPicksVariant,
): string[] {
  const emptyDefault = (): string[] =>
    defaultPicksVariant === "none" ? [] : [...ALL_MODULES];
  const raw = safeReadStringLS(ONBOARDING_PICKS_STATE_KEY);
  if (!raw) return emptyDefault();
  try {
    const data = JSON.parse(raw) as PersistedPicksState;
    if (
      !data ||
      typeof data !== "object" ||
      !Array.isArray(data.picks) ||
      data.picks.length === 0
    ) {
      return emptyDefault();
    }
    const allowed: ReadonlySet<string> = new Set(ALL_MODULES);
    return data.picks.filter(
      (p): p is string => typeof p === "string" && allowed.has(p),
    );
  } catch {
    return emptyDefault();
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
  copy,
  ctaLabelOverride,
  ctaDisabled,
  emptyPicksHint,
  onSecondaryAction,
}: {
  picks: string[];
  togglePick: (id: string) => void;
  onOpen: () => void;
  expanded: boolean;
  onToggleExpanded: () => void;
  /** Resolved A/B copy for the splash hero (S1.1 + S1.2). */
  copy: OnboardingHeroCopy;
  /**
   * Override label for the primary CTA. Used by tour replay to swap
   * `copy.primaryCta` for "Закрити". Real wizard always renders
   * `copy.primaryCta` so the experiment arm controls the text.
   */
  ctaLabelOverride?: string;
  /**
   * S6.1: disable the primary CTA when the user is in the `none` arm
   * of `onboarding_default_picks_v1` and has no module selected.
   */
  ctaDisabled?: boolean;
  /**
   * S6.1: inline hint rendered below the CTA when {@link ctaDisabled}
   * is true. Tells the user why the button is inactive.
   */
  emptyPicksHint?: string;
  /**
   * PR-05 — demo mode as first-class CTA. Optional handler for the
   * secondary "Подивитись приклад" button rendered inside the splash
   * card under the primary CTA. When omitted (modal mode, tour
   * replay) the secondary CTA is not rendered. Hosts (`/welcome`)
   * pass `seedDemoData()` so the demo entry sits in the same visual
   * card as the primary onboarding CTA, satisfying the share-of-
   * traffic ≥ 15% target without forcing the user to scan past the
   * card.
   */
  onSecondaryAction?: () => void;
}) {
  return (
    <div className="flex flex-col items-center text-center space-y-5">
      <div className="space-y-2">
        <BrandLogo size="md" variant="inline" className="mx-auto" />
        <h2 className="text-style-hero text-text">{copy.title}</h2>
        <p className="text-sm text-muted leading-relaxed max-w-xs mx-auto">
          {copy.subtitle}
        </p>
      </div>

      <div className="flex items-center gap-3 text-xs text-muted">
        <span className="flex items-center gap-1">
          <Icon name="lock" size={14} aria-hidden />
          {copy.badges[0]}
        </span>
        <span className="flex items-center gap-1">
          <Icon name="cloud-off" size={14} aria-hidden />
          {copy.badges[1]}
        </span>
        <span className="flex items-center gap-1">
          <Icon name="eye-off" size={14} aria-hidden />
          {copy.badges[2]}
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
        disabled={ctaDisabled}
      >
        {ctaLabelOverride ?? copy.primaryCta}
        <Icon name="chevron-right" size={16} />
      </Button>

      {ctaDisabled && emptyPicksHint ? (
        <p
          className="text-xs text-muted -mt-2"
          role="status"
          aria-live="polite"
        >
          {emptyPicksHint}
        </p>
      ) : null}

      {onSecondaryAction ? (
        <button
          type="button"
          onClick={onSecondaryAction}
          className={cn(
            "w-full flex items-center justify-center gap-2",
            "h-11 min-h-[44px] rounded-2xl border border-brand-500/35 bg-brand-500/5",
            "text-style-label text-brand-strong dark:text-brand",
            "hover:bg-brand-500/10 hover:border-brand-500/55 transition-colors",
            "focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/45",
          )}
        >
          <Icon name="sparkles" size={16} strokeWidth={2} aria-hidden />
          <span>{copy.secondaryCta}</span>
        </button>
      ) : null}

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
        {expanded ? "Згорнути" : "Що це за модулі?"}
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
  mode = "real",
  onSecondaryAction,
}: {
  onDone: (
    startModuleId: string | null,
    opts?: { intent: string; picks: string[] },
  ) => void;
  variant?: "modal" | "fullPage";
  /**
   * "real" (default) — first-run wizard: persists picks, fires the FTUX
   * funnel events, and marks onboarding done on finish.
   *
   * "tour" — read-only replay launched from Settings → "Подивитись tour".
   * Skips all storage writes and FTUX-funnel events, fires
   * `onboarding_replay_*` instead, and `finish` simply closes the
   * wizard without touching the user's onboarding / first-action state.
   */
  mode?: "real" | "tour";
  /**
   * PR-05 — demo mode as first-class CTA. Optional handler for the
   * "Подивитись приклад" button rendered inside the splash card. Only
   * passed by the `/welcome` host (`fullPage` variant); modal mode and
   * tour replay leave the secondary CTA hidden so demo seeding never
   * happens by accident from in-app surfaces.
   */
  onSecondaryAction?: () => void;
}) {
  const isTour = mode === "tour";

  // Default-picks A/B (S6.1). Assignment is deterministic per device
  // fingerprint and persists across renders, so the user always sees
  // the same arm — no mid-flight flip from "all pre-selected" to
  // "empty" between paints. Tour replay short-circuits to the legacy
  // `all` arm so the read-only replay always shows every module
  // pre-checked, matching the screenshot we ship in marketing.
  // UX-feedback 2026-05-08: kill the A/B test and force `none` for every
  // real wizard mount. Users were confused by the pre-selected modules
  // ("we planned that on start everything would be off and the user
  // picks themselves, right?") — pre-checking everything was reading as
  // "we already chose for you" rather than as a friendly default. Tour
  // replay still pins to `all` so the marketing screenshot stays
  // consistent.
  const defaultPicksVariant = useMemo<OnboardingDefaultPicksVariant>(() => {
    if (isTour) return "all";
    // Touch the experiment for analytics continuity, but ignore the
    // result. Variant is hardcoded to `none` until / unless we run a
    // new experiment that explicitly opts into pre-selection.
    assignVariant(webKVStore, ONBOARDING_DEFAULT_PICKS_EXPERIMENT);
    return "none";
  }, [isTour]);

  const [picks, setPicks] = useState<string[]>(() =>
    isTour ? [...ALL_MODULES] : loadPersistedPicks(defaultPicksVariant),
  );
  const [expanded, setExpanded] = useState(false);

  // Persist picks on every change. Payload is tiny (≤4 strings) so
  // unconditional writes are cheap and keep the resume-after-refresh
  // story trivial. Tour mode is throwaway state — never persists.
  useEffect(() => {
    if (isTour) return;
    persistPicks(picks);
  }, [picks, isTour]);

  // Real wizard: first paint counts as both `onboarding_started` and the
  // welcome step's `onboarding_step_viewed` so the funnel definition in
  // `posthog-ftux-dashboards.md` stays a strict superset of `started`.
  // Tour replay fires its own events instead so it never inflates the
  // FTUX funnel.
  const startedAtRef = useRef<number | null>(null);
  useEffect(() => {
    startedAtRef.current = Date.now();
    if (isTour) {
      trackEvent(ANALYTICS_EVENTS.ONBOARDING_REPLAY_VIEWED);
      return;
    }
    trackEvent(ANALYTICS_EVENTS.ONBOARDING_STARTED);
    trackEvent(ANALYTICS_EVENTS.ONBOARDING_STEP_VIEWED, { step: "welcome" });
  }, [isTour]);

  const togglePick = useCallback((id: string) => {
    setPicks((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id],
    );
  }, []);

  const toggleExpanded = useCallback(() => {
    setExpanded((v) => !v);
  }, []);

  const finish = useCallback(() => {
    if (isTour) {
      // Tour replay: no side effects on user state. Just emit the
      // dismissal event with a duration so PostHog can show "how long
      // does the user spend in replay" without polluting the FTUX
      // funnel.
      trackEvent(ANALYTICS_EVENTS.ONBOARDING_REPLAY_DISMISSED, {
        durationMs: Math.max(
          0,
          Date.now() - (startedAtRef.current ?? Date.now()),
        ),
      });
      onDone(null, { intent: "tour_replay", picks: [] });
      return;
    }

    const hadEmptyPicks = picks.length === 0;

    // S6.1 / B-1: in the `none` arm we never silently fall back to
    // ALL_MODULES — the primary CTA is disabled while picks is empty,
    // so reaching this branch means the wizard component bypassed the
    // disable (keyboard-driven submit, programmatic call, etc.). Bail
    // out without writing any state so the user's choice (none yet)
    // is preserved and they stay on the splash.
    if (hadEmptyPicks && defaultPicksVariant === "none") {
      return;
    }

    // `all` arm (legacy): empty selection falls back to all modules
    // so the lazy "tap-through" path leaves every module visible on
    // the hub instead of producing a useless dashboard.
    const chosen = hadEmptyPicks ? [...ALL_MODULES] : picks;
    saveVibePicks(chosen as never[]);

    trackEvent(ANALYTICS_EVENTS.ONBOARDING_VIBE_PICKED, {
      picks: chosen,
      picksCount: chosen.length,
    });
    trackEvent(ANALYTICS_EVENTS.ONBOARDING_STEP_COMPLETED, {
      step: "welcome",
      durationMs: Math.max(
        0,
        Date.now() - (startedAtRef.current ?? Date.now()),
      ),
    });
    trackEvent(ANALYTICS_EVENTS.ONBOARDING_COMPLETED, {
      intent: hadEmptyPicks ? "vibe_empty" : "vibe_picked",
      picksCount: chosen.length,
    });

    markFirstActionStartedAt();
    markFirstActionPending();
    markOnboardingDone();
    clearPersistedPicks();

    // Wizard finish is a clean handoff to the hub — no celebration modal
    // here. The real CelebrationModal fires on the user's first real entry
    // (see `useFirstEntryCelebration`), so onboarding-completion stays a
    // promise ("тут буде твій дашборд") instead of a fake reward.
    onDone(null, {
      intent: hadEmptyPicks ? "vibe_empty" : "vibe_picked",
      picks: chosen,
    });
  }, [picks, onDone, isTour, defaultPicksVariant]);

  // Hero copy A/B (S1.1 + S1.2). Assignment is deterministic per
  // device fingerprint and persists across renders, so the user always
  // sees the same headline / CTA throughout the funnel. Tour replay
  // bypasses assignment so it never gets counted as an exposure.
  const heroVariant = useMemo<OnboardingHeroCopyVariant>(
    () =>
      isTour
        ? "outcome"
        : (assignVariant(
            webKVStore,
            ONBOARDING_HERO_COPY_EXPERIMENT,
          ) as OnboardingHeroCopyVariant),
    [isTour],
  );
  const heroCopy = useMemo(
    () => getOnboardingHeroCopy(heroVariant),
    [heroVariant],
  );

  // Fire `EXPERIMENT_EXPOSED` on the same render the user actually sees
  // the variant. Real wizard only — tour replay must not contaminate
  // the experiment dataset. Effects run once because both variants are
  // stable for the lifetime of the wizard mount.
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

  // S6.1: only the `none` arm disables the CTA on empty picks. Tour
  // replay never disables the CTA — replay always renders all four
  // pre-checked, so the disabled state would be unreachable noise.
  const ctaDisabled =
    !isTour && defaultPicksVariant === "none" && picks.length === 0;

  // Tour replay never seeds demo data — `onSecondaryAction` is only
  // wired through in real mode so the read-only replay can never
  // accidentally trigger the demo seeder against the host's store.
  const secondaryAction = isTour ? undefined : onSecondaryAction;

  const content = useMemo(
    () => (
      <WelcomeOneScreen
        picks={picks}
        togglePick={togglePick}
        onOpen={finish}
        expanded={expanded}
        onToggleExpanded={toggleExpanded}
        copy={heroCopy}
        ctaLabelOverride={isTour ? "Закрити" : undefined}
        ctaDisabled={ctaDisabled}
        emptyPicksHint="Обери хоч один модуль"
        onSecondaryAction={secondaryAction}
      />
    ),
    [
      picks,
      togglePick,
      finish,
      expanded,
      toggleExpanded,
      heroCopy,
      isTour,
      ctaDisabled,
      secondaryAction,
    ],
  );

  if (variant === "fullPage") {
    return (
      <div
        className="relative w-full max-w-sm bg-panel border border-line rounded-3xl shadow-float p-6 animate-onboarding-enter"
        aria-label="Вітальний екран"
      >
        {content}
      </div>
    );
  }

  return (
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
  );
}
