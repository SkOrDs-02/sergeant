import { useQuery } from "@tanstack/react-query";
import { chatApi } from "@shared/api";
import { chatKeys } from "@shared/lib/api/queryKeys";
import { messages } from "@shared/i18n/uk";
import { cn } from "@shared/lib/ui/cn";

/**
 * Free-tier daily AI-chat counter pill (PR-42, tracker §15). Reads
 * `GET /api/chat/usage`; renders nothing while loading, on error (401 for
 * anon callers, transient fetch failure), or for Pro (`limit === null` —
 * unlimited). The real 429 gate stays server-side in `assertAiQuota`; this
 * pill is a nudge, never a blocker — so we fail silently to `null` rather
 * than surfacing a loading/error state in the chat header.
 *
 * Plain `<a href="/pricing">` (not `<Link>`) on purpose: `HubChat` renders
 * outside a `<Router>` in some unit tests, and a full navigation to the
 * pricing page is an acceptable UX for this rare "exhausted" state.
 */
export function ChatUsageCounter() {
  const { data } = useQuery({
    queryKey: chatKeys.usage,
    queryFn: ({ signal }) => chatApi.usage({ signal }),
    staleTime: 30_000,
    retry: false,
  });

  if (!data || data.limit == null || data.remaining == null) return null;

  const used = data.limit - data.remaining;
  const exhausted = data.remaining <= 0;
  const ariaLabel = `${messages.hub.chatUsageAriaPrefix} ${used}/${data.limit} ${messages.hub.chatUsageAriaSuffix}`;

  return (
    <span
      role="status"
      aria-label={ariaLabel}
      data-testid="chat-usage-counter"
      className={cn(
        "shrink-0 px-2 py-1 rounded-full text-style-caption font-semibold whitespace-nowrap",
        exhausted
          ? "bg-warning-soft text-warning-strong dark:text-warning"
          : "bg-panelHi text-muted",
      )}
    >
      {exhausted ? (
        <a
          href="/pricing"
          className="underline focus-visible:ring-2 focus-visible:ring-focus/45"
        >
          {messages.hub.chatUsageExhausted}
        </a>
      ) : (
        `${used}/${data.limit} ${messages.hub.chatUsageUnit}`
      )}
    </span>
  );
}
