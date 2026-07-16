import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "@shared/components/ui/Icon";
import { cn } from "@shared/lib/ui/cn";
import { useOnlineStatus } from "@shared/hooks/useOnlineStatus";
import { useSyncStatus } from "../cloudSync/hook/useSyncStatus";
import { pluralUa } from "@sergeant/shared";
import { SyncStatusSheet } from "./SyncStatusSheet";

/**
 * Стриманий індикатор зʼєднання та синхронізації — невелика плаваюча плашка
 * під хедером застосунку. Для офлайн-first PWA відсутність мережі не є
 * критичною помилкою, тому індикатор лишається компактним.
 *
 * Three visible states (idle → renders `null`):
 *   - **online + queue/dirty > 0:** "Синхронізація · N в черзі" with an
 *     animated `refresh` icon.
 *   - **offline:** "Офлайн" or "Офлайн · N в черзі" with the wifi-off icon.
 *   - **blocked (dead-letter > 0):** sync errors that need a retry.
 *
 * The pill is a button — tapping it opens {@link SyncStatusSheet} with the
 * full state (connection, queue, errors + retry). The safe-area inset is
 * applied to the `top` position (not padding) so the `rounded-full` shape
 * stays symmetric on notched devices (mobile-audit A6).
 */

// Плашка виняткового стану розміщується під 68px-хедером і не перекриває
// його назву та дії. У нормальному стані індикатор не показується.
const PILL_CLS =
  "min-h-11 min-w-11 shrink-0 inline-flex items-center justify-center gap-1.5 px-2.5 rounded-xl bg-panelHi border border-line text-muted text-style-caption shadow-soft motion-safe:animate-fade-in focus:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-bg";

type BannerState = "blocked" | "offline" | "syncing";

const queueLabel = (count: number) =>
  `${count} ${pluralUa(count, {
    one: "в черзі",
    few: "в черзі",
    many: "в черзі",
  })}`;

export function OfflineBanner() {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [headerSlot, setHeaderSlot] = useState<HTMLElement | null>(() =>
    typeof document === "undefined"
      ? null
      : document.querySelector<HTMLElement>("[data-sync-status-slot]"),
  );
  const online = useOnlineStatus();
  const {
    syncV2PendingCount = 0,
    syncV2DeadLetterCount = 0,
    retrySyncV2DeadLetters,
  } = useSyncStatus();
  const pending = syncV2PendingCount;

  useEffect(() => {
    if (headerSlot || typeof MutationObserver === "undefined") return;
    const observer = new MutationObserver(() => {
      const slot = document.querySelector<HTMLElement>(
        "[data-sync-status-slot]",
      );
      if (!slot) return;
      setHeaderSlot(slot);
      observer.disconnect();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [headerSlot]);

  const state: BannerState | null =
    syncV2DeadLetterCount > 0
      ? "blocked"
      : !online
        ? "offline"
        : pending > 0
          ? "syncing"
          : null;

  // Online and nothing waiting — the happy path needs no chrome.
  if (state === null) return null;

  const view =
    state === "blocked"
      ? {
          icon: "refresh-cw" as const,
          iconClass: undefined as string | undefined,
          label: `${syncV2DeadLetterCount} ${pluralUa(syncV2DeadLetterCount, {
            one: "помилка синхронізації",
            few: "помилки синхронізації",
            many: "помилок синхронізації",
          })}`,
        }
      : state === "offline"
        ? {
            icon: "wifi-off" as const,
            iconClass: undefined,
            label: pending > 0 ? `Офлайн · ${queueLabel(pending)}` : "Офлайн",
          }
        : {
            icon: "refresh-cw" as const,
            iconClass: "motion-safe:animate-spin-slow",
            label: `Синхронізація · ${queueLabel(pending)}`,
          };

  const content = (
    <>
      <button
        type="button"
        aria-live="polite"
        data-testid="offline-banner"
        data-state={state}
        onClick={() => setSheetOpen(true)}
        aria-label={`${view.label}. Відкрити деталі синхронізації`}
        className={PILL_CLS}
      >
        <Icon
          name={view.icon}
          size={12}
          strokeWidth={2.5}
          aria-hidden
          className={cn(view.iconClass)}
        />
        <span className="hidden xl:inline">{view.label}</span>
      </button>
      <SyncStatusSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        online={online}
        pending={pending}
        deadLetter={syncV2DeadLetterCount}
        onRetry={retrySyncV2DeadLetters}
      />
    </>
  );

  if (headerSlot === undefined) return null;
  return headerSlot ? createPortal(content, headerSlot) : content;
}
