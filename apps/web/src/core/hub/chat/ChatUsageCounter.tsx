import { messages } from "@shared/i18n/uk";
import { cn } from "@shared/lib/ui/cn";
import { usePlan } from "../../billing/usePlan";

/**
 * Free-tier weekly AI counter pill (PR-42, tracker §15; тижневе відро за
 * спекою access-tiers). Reads `access.meters.aiActions` from the billing
 * snapshot via `usePlan()`; renders nothing while loading, without a session,
 * or for Premium (`limit === null`, unlimited). The real 429 gate stays
 * server-side in `assertAiQuota`; this pill is a nudge, never a blocker.
 *
 * Plain `<a href="/pricing">` (not `<Link>`) on purpose: `HubChat` renders
 * outside a `<Router>` in some unit tests, and a full navigation to the
 * pricing page is an acceptable UX for this rare "exhausted" state.
 */
export function ChatUsageCounter() {
  const meter = usePlan().access?.meters.aiActions;
  if (!meter || meter.limit == null) return null;

  const used = Math.min(meter.used, meter.limit);
  const exhausted = meter.used >= meter.limit;
  const ariaLabel = `${messages.hub.chatUsageAriaPrefix} ${used}/${meter.limit} ${messages.hub.chatUsageAriaSuffix}`;

  return (
    <span
      role="status"
      aria-label={ariaLabel}
      data-testid="chat-usage-counter"
      className={cn(
        // `min-w-0 truncate` замість `shrink-0 whitespace-nowrap`: на 393px
        // саме ця пігулка зʼїдала ширину заголовка шапки. Вона — підказка,
        // тож віддає простір першою (aria-label несе повне значення).
        "min-w-0 truncate px-2 py-1 rounded-full text-style-caption font-semibold",
        exhausted
          ? "bg-warning-soft text-warning-strong dark:text-warning"
          : "bg-panelHi text-muted",
      )}
    >
      {exhausted ? (
        <a
          href="/pricing"
          className="touch-target underline focus-visible:ring-2 focus-visible:ring-focus/45"
        >
          {messages.hub.chatUsageExhausted}
        </a>
      ) : (
        `${used}/${meter.limit} ${messages.hub.chatUsageUnit}`
      )}
    </span>
  );
}
