import { useEffect, useState, type ReactNode } from "react";
import { Banner } from "@shared/components/ui/Banner";
import { cn } from "@shared/lib/ui/cn";

/**
 * Persistent storage-error banner shared by Sergeant modules.
 *
 * All four modules previously listened to a module-specific custom event
 * (`ROUTINE_STORAGE_ERROR`, `FIZRUK_WORKOUTS_STORAGE_ERROR`, …) that the
 * storage layer dispatches when a write fails (typically a quota
 * violation). A quota failure won't self-resolve, so a 7s toast is wrong
 * — the banner stays until the user acks it or frees space.
 *
 * This primitive encapsulates the event subscription + render so each
 * module only has to wire up the event name and an optional message
 * formatter.
 */

export interface StorageErrorBannerProps {
  /** Custom event dispatched by the module's storage layer. */
  eventName: string;
  /** Format the final banner copy given the raw reason string. */
  formatMessage?: (reason: string) => ReactNode;
  /** aria-label for the dismiss button. Defaults to "Закрити повідомлення". */
  dismissLabel?: string;
  className?: string;
}

interface StorageErrorEventDetail {
  message?: string;
}

const DEFAULT_FORMAT = (reason: string) =>
  `Не вдалося зберегти дані (${reason}). Можливо, браузер переповнив сховище — експортуй бекап або звільни місце.`;

export function StorageErrorBanner({
  eventName,
  formatMessage = DEFAULT_FORMAT,
  dismissLabel = "Закрити повідомлення",
  className,
}: StorageErrorBannerProps) {
  const [reason, setReason] = useState<string | null>(null);

  useEffect(() => {
    const onError = (event: Event) => {
      const detail = (event as CustomEvent<StorageErrorEventDetail>).detail;
      setReason(detail?.message || "невідома помилка");
    };
    window.addEventListener(eventName, onError);
    return () => window.removeEventListener(eventName, onError);
  }, [eventName]);

  if (!reason) return null;

  return (
    <Banner
      variant="danger"
      role="alert"
      className={cn(
        "mx-4 mt-3 flex items-start justify-between gap-3",
        className,
      )}
    >
      <span>{formatMessage(reason)}</span>
      <button
        type="button"
        onClick={() => setReason(null)}
        className="shrink-0 text-xs font-semibold text-danger/80 hover:text-danger"
        aria-label={dismissLabel}
      >
        Закрити
      </button>
    </Banner>
  );
}
