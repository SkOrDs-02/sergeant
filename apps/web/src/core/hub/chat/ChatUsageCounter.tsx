import { useQuery } from "@tanstack/react-query";
import { chatApi } from "@shared/api";
import { chatKeys } from "@shared/lib/api/queryKeys";
import { messages } from "@shared/i18n/uk";
import { cn } from "@shared/lib/ui/cn";
import { useAuthOptional } from "../../auth/AuthContext";

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
  // FUN-1 (аудит 2026-09): без сесії `GET /api/chat/usage` = гарантований
  // 401 у консолі; пігулка і так рендерить `null`.
  const auth = useAuthOptional();
  const signedOut = auth?.status === "unauthenticated";
  const { data } = useQuery({
    queryKey: chatKeys.usage,
    queryFn: ({ signal }) => chatApi.usage({ signal }),
    staleTime: 30_000,
    retry: false,
    enabled: !signedOut,
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
        `${used}/${data.limit} ${messages.hub.chatUsageUnit}`
      )}
    </span>
  );
}
