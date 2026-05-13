import { useInRouterContext, useNavigate } from "react-router-dom";
import { Button } from "@shared/components/ui/Button";
import { usePlan } from "./usePlan";

/**
 * Trial-expiry banner (initiative 0010 Phase 4 / audit `2026-05-13-revenue-monetization-roast.md` P1-9).
 *
 * Reads `usePlan()` and renders a single-line CTA when the on-file
 * subscription is `status === "trialing"` and the trial expires in
 * `≤ 7` days. At `≤ 1` day remaining we switch to a sticky variant so
 * the «last call» is visible across hub-view scroll on small screens.
 * Outside the trialing window the component renders `null` — callers
 * (HubMainContent banner stack) mount it unconditionally.
 *
 * Pro plan, free plan, loading, and unauthenticated callers all
 * collapse to `null` via `usePlan()`'s fall-throughs (subscription is
 * `null` while loading / on 401). The component does not invalidate
 * billing queries — `usePlan()` already refetches on focus.
 *
 * A11y: `role="status"` + `aria-live="polite"` so screen readers
 * announce the countdown change without stealing focus.
 */

export interface TrialBannerProps {
  /**
   * Override "now" for tests / Storybook. Defaults to `Date.now()`.
   * The countdown is computed in whole-day buckets (`Math.ceil` of
   * the remaining ms), so timezone is irrelevant — we never display
   * an hour/minute breakdown here.
   */
  now?: () => number;
}

function computeDaysLeft(currentPeriodEnd: string, now: number): number {
  const end = Date.parse(currentPeriodEnd);
  if (Number.isNaN(end)) {
    return Number.NaN;
  }
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.max(0, Math.ceil((end - now) / msPerDay));
}

const COPY = {
  endsToday: "Trial завершується сьогодні",
  remainingPrefix: "Залишилось",
  trailing: "trial",
  body: "Оформіть Pro, щоб не втратити доступ до AI-чату й автосинку Mono.",
  cta: "Перейти на Pro",
  dayForms: { one: "день", few: "дні", many: "днів" },
} as const;

function pluralizeDays(days: number): string {
  // Ukrainian plurals — 1 день / 2-4 дні / 5+ днів. Trial windows top
  // out at 7 days so we only need the three-form rule, not the full
  // Intl.PluralRules wrapper.
  const mod10 = days % 10;
  const mod100 = days % 100;
  if (mod10 === 1 && mod100 !== 11) return COPY.dayForms.one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20))
    return COPY.dayForms.few;
  return COPY.dayForms.many;
}

/**
 * Public wrapper — defers to {@link TrialBannerInner} only when a
 * `<Router>` ancestor is present. `HubMainContent`'s unit tests render
 * the hub layout outside `<MemoryRouter>` (see
 * `apps/web/src/core/app/HubMainContent.test.tsx`); calling
 * `useNavigate()` there would throw. The outer component owns a single
 * `useInRouterContext()` hook call to keep React's hook-order rule
 * intact across mounts.
 */
export function TrialBanner(props: TrialBannerProps = {}) {
  const inRouter = useInRouterContext();
  if (!inRouter) {
    return null;
  }
  return <TrialBannerInner {...props} />;
}

function TrialBannerInner({ now = Date.now }: TrialBannerProps) {
  const navigate = useNavigate();
  const { subscription } = usePlan();

  if (!subscription || subscription.status !== "trialing") {
    return null;
  }
  if (!subscription.currentPeriodEnd) {
    return null;
  }

  const daysLeft = computeDaysLeft(subscription.currentPeriodEnd, now());
  if (Number.isNaN(daysLeft) || daysLeft > 7) {
    return null;
  }

  const sticky = daysLeft <= 1;
  const headline =
    daysLeft === 0
      ? COPY.endsToday
      : `${COPY.remainingPrefix} ${daysLeft} ${pluralizeDays(daysLeft)} ${COPY.trailing}`;

  function handleCta() {
    navigate("/pricing?source=trial_banner");
  }

  return (
    <div
      role="status"
      aria-live="polite"
      data-trial-banner-variant={sticky ? "sticky" : "inline"}
      className={
        sticky
          ? "sticky top-0 z-30 px-5 pt-2 pb-2 max-w-lg mx-auto w-full"
          : "px-5 max-w-lg mx-auto w-full mb-2"
      }
    >
      <div
        className={
          sticky
            ? "rounded-2xl border border-warning/40 bg-warning-soft text-warning-strong dark:text-amber-100 px-4 py-3 flex items-center gap-3 shadow-sm"
            : "rounded-2xl border border-warning/30 bg-warning-soft text-warning-strong dark:text-amber-100 px-4 py-3 flex items-center gap-3"
        }
      >
        <div className="min-w-0 flex-1">
          <p className="text-style-label">{headline}</p>
          <p className="text-xs opacity-80">{COPY.body}</p>
        </div>
        <Button
          variant="primary"
          size="sm"
          onClick={handleCta}
          className="shrink-0 font-semibold"
        >
          {COPY.cta}
        </Button>
      </div>
    </div>
  );
}
