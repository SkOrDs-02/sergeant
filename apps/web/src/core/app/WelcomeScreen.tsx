import { Icon } from "@shared/components/ui/Icon";
import { cn } from "@shared/lib/ui/cn";
import { OnboardingWizard } from "../onboarding/OnboardingWizard";
import { seedDemoData } from "../onboarding/seedDemoData";
import { trackEvent, ANALYTICS_EVENTS } from "../observability/analytics";

// Static preview of the populated hub that sits behind the splash card on
// `/welcome`. Renders a 2×2 bento grid matching `HubDashboard`'s module
// cards so the blurred silhouette under the splash accurately teases the
// real dashboard layout new users are about to see.
//
// PR-06 — canonical Cyrillic without emoji. Module labels are bare brand
// names (`Фінік / Фізрук / Рутина / Харчування`) — the colored module-icon
// bubble already carries the visual association, so emoji prefixed to the
// text was duplicative and broke uniformity vs the hub bottom-nav and
// settings groups.
const PEEK_CARDS = [
  {
    id: "finyk",
    label: "Фінік",
    cardBg: "bg-finyk-soft/40 dark:bg-finyk-surface-dark/8",
    iconClass: "bg-finyk-soft text-finyk dark:bg-finyk-surface-dark/15",
    icon: "credit-card",
    metric: "−320 ₴",
    sub: "тиждень",
  },
  {
    id: "fizruk",
    label: "Фізрук",
    cardBg: "bg-fizruk-soft/40 dark:bg-fizruk-surface-dark/8",
    iconClass: "bg-fizruk-soft text-fizruk dark:bg-fizruk-surface-dark/15",
    icon: "dumbbell",
    metric: "5 трен.",
    sub: "14 днів",
  },
  {
    id: "routine",
    label: "Рутина",
    cardBg: "bg-routine-surface/40 dark:bg-routine-surface-dark/8",
    iconClass:
      "bg-routine-surface text-routine dark:bg-routine-surface-dark/15",
    icon: "check",
    metric: "7 днів",
    sub: "стрік",
  },
  {
    id: "nutrition",
    label: "Харчування",
    cardBg: "bg-nutrition-soft/40 dark:bg-nutrition-surface-dark/8",
    iconClass:
      "bg-nutrition-soft text-nutrition dark:bg-nutrition-surface-dark/15",
    icon: "utensils",
    metric: "420 ккал",
    sub: "сніданок",
  },
];

function PeekBackdrop() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 overflow-hidden"
    >
      <div
        className={cn(
          "absolute inset-0",
          // Soft brand wash so the backdrop never looks empty on cold load.
          "bg-linear-to-b from-brand-500/5 via-transparent to-transparent",
        )}
      />
      {/* Honest peek disclaimer. The blurred cards beneath carry fake
          metrics (`−320 ₴`, `5 трен.`, ...) so on first load the splash
          visually promises a populated dashboard. The disclaimer keeps
          that promise honest without competing with the primary CTA:
          muted caption-size text, single-line, pinned just below the
          safe-area top so it sits inside the peek area but above the
          blurred bento. */}
      <div
        className={cn(
          "absolute inset-x-0",
          "pt-[max(0.5rem,calc(env(safe-area-inset-top)+0.25rem))] px-5",
          "flex justify-center",
        )}
      >
        <span className="text-style-caption text-muted/80">
          Це приклад. Твій дашборд буде твоїм.
        </span>
      </div>
      {/* Animated floating shapes for visual interest */}
      <div className="absolute inset-0">
        <div
          className="absolute top-[15%] left-[10%] w-24 h-24 rounded-full bg-brand-500/5 blur-2xl motion-safe:animate-float-slow"
          style={{ animationDelay: "0s" }}
        />
        <div
          className="absolute top-[30%] right-[15%] w-32 h-32 rounded-full bg-finyk/5 blur-2xl motion-safe:animate-float-slow"
          style={{ animationDelay: "1s" }}
        />
        <div
          className="absolute bottom-[25%] left-[20%] w-20 h-20 rounded-full bg-fizruk/5 blur-2xl motion-safe:animate-float-slow"
          style={{ animationDelay: "2s" }}
        />
      </div>
      {/* Faux hub rendered under a blur so the user perceives the shape
          and accent colors of their about-to-be-populated dashboard, but
          can't read individual numbers well enough to be distracted from
          the splash copy. Uses a 2×2 bento grid matching the real dashboard. */}
      <div
        className={cn(
          "absolute inset-x-0 top-0 pt-[max(2.5rem,env(safe-area-inset-top))] px-5 max-w-lg mx-auto w-full",
          "opacity-0 motion-safe:animate-fade-in-slow",
        )}
        style={{
          filter: "blur(6px) saturate(0.85)",
          animationDelay: "0.3s",
          animationFillMode: "forwards",
        }}
      >
        <div className="space-y-3 opacity-40">
          <div>
            <div className="h-6 w-32 rounded-xl bg-panelHi" />
            <div className="h-3 w-24 rounded-xl bg-panelHi mt-2" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            {PEEK_CARDS.map((card, idx) => (
              <div
                key={card.id}
                className={cn(
                  "flex flex-col rounded-3xl border border-line p-3.5 shadow-card",
                  card.cardBg,
                  "motion-safe:animate-card-enter",
                )}
                style={{ animationDelay: `${0.4 + idx * 0.1}s` }}
              >
                <div
                  className={cn(
                    "w-7 h-7 rounded-xl flex items-center justify-center shrink-0 mb-2",
                    card.iconClass,
                  )}
                >
                  <Icon
                    name={card.icon}
                    size={16}
                    strokeWidth={2}
                    aria-hidden
                  />
                </div>
                <span className="text-xs font-semibold text-text">
                  {card.label}
                </span>
                <span className="text-style-title text-text tabular-nums mt-1">
                  {card.metric}
                </span>
                <span className="text-2xs text-muted mt-0.5">{card.sub}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

interface WelcomeScreenProps {
  /** Called when onboarding completes. Receives the selected start module and optional wizard options. */
  onDone: (
    startModuleId: string | null,
    opts?: { intent: string; picks: string[] },
  ) => void;
  /** Navigate to the sign-in route for users who already have an account. */
  onOpenAuth: () => void;
}

/**
 * Full-page cold-start at `/welcome`. Owns the page chrome + peek
 * backdrop and delegates the splash card to `OnboardingWizard` in
 * `fullPage` mode.
 */
/**
 * S4.1 "Подивитись приклад" handler. Seeds a synthetic hub payload
 * across all four modules and reloads onto `/` so the demo state is
 * visible immediately. Tracking is fired before the redirect so the
 * `demo_started` event lands even if the new page mounts before the
 * old PostHog buffer flushes (the SDK persists pending events).
 */
function startDemoAndGoHome(): void {
  trackEvent(ANALYTICS_EVENTS.DEMO_STARTED, { source: "welcome" });
  seedDemoData();
  try {
    window.location.assign("/");
  } catch {
    /* noop */
  }
}

export function WelcomeScreen({ onDone, onOpenAuth }: WelcomeScreenProps) {
  return (
    <div className="relative min-h-dvh bg-bg text-text overflow-hidden page-enter">
      <PeekBackdrop />
      <div className="relative min-h-dvh flex items-end sm:items-center justify-center p-4 pb-safe">
        <div className="w-full max-w-sm space-y-3">
          <OnboardingWizard onDone={onDone} variant="fullPage" />
          {/* Demo-first CTA (S4.1). Lower visual weight than the
              wizard primary, but above the returning-user entry so
              the "просто подивитись" cohort doesn't have to scan past
              an account-prompt to find it. */}
          <button
            type="button"
            onClick={startDemoAndGoHome}
            className={cn(
              "w-full flex items-center justify-center gap-2",
              "h-11 min-h-[44px] rounded-2xl border border-brand-500/35 bg-brand-500/5",
              "text-style-label text-brand-strong dark:text-brand",
              "hover:bg-brand-500/10 hover:border-brand-500/55 transition-colors",
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/45",
            )}
          >
            <Icon name="sparkles" size={16} strokeWidth={2} aria-hidden />
            <span>Подивитись приклад</span>
          </button>
          {/* Returning-user entry. The previous text-xs muted underline was
              almost invisible on a fresh device — users who already had an
              account were dropped into onboarding. Promoted to a secondary
              button so the "у мене є акаунт" path is visible without
              competing with the primary splash CTA. */}
          <button
            type="button"
            onClick={onOpenAuth}
            className={cn(
              "w-full flex items-center justify-center gap-2",
              "h-11 min-h-[44px] rounded-2xl border border-line bg-panel/60",
              "text-style-label text-text",
              "hover:bg-panelHi hover:border-brand-500/40 transition-colors",
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/45",
            )}
          >
            <Icon name="user" size={16} strokeWidth={2} aria-hidden />
            <span>У мене вже є акаунт</span>
          </button>
        </div>
      </div>
    </div>
  );
}
