import { Icon } from "@shared/components/ui/Icon";
import { useOnlineStatus } from "@shared/hooks/useOnlineStatus";
import { useSyncStatus } from "../cloudSync/useCloudSync";
import { pluralUa } from "@sergeant/shared";

/**
 * Subtle connectivity-and-sync indicator — a small floating pill in the
 * top-right corner. For a PWA designed to work offline, screaming
 * "NO INTERNET!" felt like a critical error, so this stays compact.
 *
 * Three states:
 *   - **online + nothing pending:** invisible (returns `null`).
 *   - **online + queue/dirty > 0:** "Синхронізація · N в черзі" with an
 *     animated `refresh` icon. Tells the user that their last few
 *     changes have not yet reached the cloud — useful on flaky 3G or
 *     while a long push is in flight.
 *   - **offline:** "Офлайн" or "Офлайн · N в черзі" with the wifi-off
 *     icon, so the user knows their data is safe and waiting.
 */
export function OfflineBanner() {
  const online = useOnlineStatus();
  const {
    queuedCount,
    dirtyCount,
    syncV2PendingCount = 0,
    syncV2DeadLetterCount = 0,
    retrySyncV2DeadLetters,
  } = useSyncStatus();
  const pending = Math.max(queuedCount, dirtyCount, syncV2PendingCount);

  if (syncV2DeadLetterCount > 0) {
    return (
      <div
        role="status"
        aria-live="polite"
        data-testid="offline-banner"
        data-state="blocked"
        className="fixed top-3 right-3 z-300 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-panel/90 border border-line text-muted text-style-caption shadow-soft backdrop-blur-sm safe-area-pt motion-safe:animate-fade-in"
      >
        <Icon name="refresh-cw" size={12} strokeWidth={2.5} aria-hidden />
        <span>{`${syncV2DeadLetterCount} blocked`}</span>
        <button
          type="button"
          onClick={() => {
            void retrySyncV2DeadLetters?.();
          }}
          className="ml-1 text-style-caption text-accent underline underline-offset-2"
        >
          Retry
        </button>
      </div>
    );
  }

  // Online and nothing waiting — the happy path needs no chrome.
  if (online && pending === 0) return null;

  const queueLabel = (count: number) =>
    `${count} ${pluralUa(count, {
      one: "в черзі",
      few: "в черзі",
      many: "в черзі",
    })}`;

  if (!online) {
    const label = pending > 0 ? `Офлайн · ${queueLabel(pending)}` : "Офлайн";
    return (
      <div
        role="status"
        aria-live="polite"
        data-testid="offline-banner"
        data-state="offline"
        className="fixed top-3 right-3 z-300 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-panel/90 border border-line text-muted text-style-caption shadow-soft backdrop-blur-sm safe-area-pt motion-safe:animate-fade-in"
      >
        <Icon name="wifi-off" size={12} strokeWidth={2.5} aria-hidden />
        <span>{label}</span>
      </div>
    );
  }

  // online && pending > 0
  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="offline-banner"
      data-state="syncing"
      className="fixed top-3 right-3 z-300 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-panel/90 border border-line text-muted text-style-caption shadow-soft backdrop-blur-sm safe-area-pt motion-safe:animate-fade-in"
    >
      <Icon
        name="refresh-cw"
        size={12}
        strokeWidth={2.5}
        aria-hidden
        className="motion-safe:animate-spin [animation-duration:2.4s]"
      />
      <span>{`Синхронізація · ${queueLabel(pending)}`}</span>
    </div>
  );
}
