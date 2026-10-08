import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "@shared/components/ui/Icon";
import { cn } from "@shared/lib/ui/cn";
import { useOnlineStatus } from "@shared/hooks/useOnlineStatus";
import { useSyncStatus } from "../cloudSync";
import { pluralUa } from "@sergeant/shared";
import { SyncStatusSheet } from "./SyncStatusSheet";
import { useOutboxPurgeNotice } from "../syncEngine/outboxPurgeNotice";

/**
 * Стриманий індикатор зʼєднання та синхронізації — невелика плаваюча плашка
 * під хедером застосунку. Для офлайн-first PWA відсутність мережі не є
 * критичною помилкою, тому індикатор лишається компактним.
 *
 * Visible states (idle → renders `null`):
 *   - **session expired (`sec-18`):** сесія завершилась посеред роботи, а
 *     вкладка ще вважає себе залогіненою: черга лежить на пристрої й нікуди
 *     не їде, доки людина не увійде. Найвищий пріоритет.
 *   - **online + queue/dirty > 0:** "Синхронізація · N в черзі" with an
 *     animated `refresh` icon.
 *   - **offline:** "Офлайн" or "Офлайн · N в черзі" with the wifi-off icon.
 *   - **blocked (dead-letter > 0):** sync errors that need a retry.
 *   - **rejected (server-rejected rows > 0):** records the server will
 *     never accept.
 *   - **purged (lowest priority, PR-T2):** the boot-time TTL sweep
 *     removed old rejected/dead-letter rows (`outboxPurgeNotice.ts`).
 *     Without this state the pill can disappear entirely right after a
 *     purge — the very counts that made it visible just got deleted —
 *     leaving no entry point into `SyncStatusSheet` to see what was
 *     lost.
 *
 * The pill is a button — tapping it opens {@link SyncStatusSheet} with the
 * full state (connection, queue, errors + retry). The safe-area inset is
 * applied to the `top` position (not padding) so the `rounded-full` shape
 * stays symmetric on notched devices (mobile-audit A6).
 */

// Плашка виняткового стану розміщується під 68px-хедером і не перекриває
// його назву та дії. У нормальному стані індикатор не показується.
const PILL_CLS =
  "min-h-11 min-w-11 shrink-0 inline-flex items-center justify-center gap-1.5 px-2.5 rounded-xl bg-panelHi border border-line text-muted text-style-caption shadow-soft motion-safe:animate-fade-in focus:outline-none focus-visible:ring-2 focus-visible:ring-focus/45 focus-visible:ring-offset-2 focus-visible:ring-offset-bg";

type BannerState =
  "session" | "blocked" | "offline" | "syncing" | "rejected" | "purged";

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
    syncV2RejectedCount = 0,
    sessionExpired = false,
    retrySyncV2DeadLetters,
  } = useSyncStatus();
  const pending = syncV2PendingCount;
  const purgeNotice = useOutboxPurgeNotice();

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

  // `rejected` стоїть після живих станів (dead-letter, офлайн, черга): вони
  // змінюються хвилинами, а відхилений запис лежить, поки його не приберe
  // TTL-purge. Але й мовчати про нього не можна — до 2026-09-03 людина не
  // мала жодного сигналу, що запис лишився лише на пристрої
  // (tech-debt/frontend.md, знахідка 2026-08-25).
  //
  // `session` (`sec-18`) стоїть першим: без сесії жоден інший стан не
  // виправиться сам, а черга лишається на пристрої, доки людина не увійде.
  const state: BannerState | null = sessionExpired
    ? "session"
    : syncV2DeadLetterCount > 0
      ? "blocked"
      : !online
        ? "offline"
        : pending > 0
          ? "syncing"
          : syncV2RejectedCount > 0
            ? "rejected"
            : purgeNotice
              ? "purged"
              : null;

  // Живий регіон стоїть у DOM завжди, і коли банера немає: регіон, що
  // зʼявляється разом зі своїм текстом, скрінрідери не озвучують, тож
  // перехід в офлайн мовчав. Оголошуємо стан, а не лічильник черги:
  // «Синхронізація · N» перечитувався б на кожен запис у черзі.
  const statusRegion = (text: string) => (
    <span role="status" className="sr-only">
      {text}
    </span>
  );

  // Online and nothing waiting: the happy path needs no chrome.
  if (state === null) return <>{statusRegion("")}</>;

  const view =
    state === "session"
      ? {
          icon: "log-in" as const,
          iconClass: undefined as string | undefined,
          label: "Сесія завершилась",
        }
      : state === "blocked"
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
          : state === "rejected"
            ? {
                icon: "alert-triangle" as const,
                iconClass: undefined,
                label: `${syncV2RejectedCount} ${pluralUa(syncV2RejectedCount, {
                  one: "запис не прийнято",
                  few: "записи не прийнято",
                  many: "записів не прийнято",
                })}`,
              }
            : state === "purged" && purgeNotice
              ? {
                  icon: "info" as const,
                  iconClass: undefined,
                  label: `${purgeNotice.purged} ${pluralUa(purgeNotice.purged, {
                    one: "старий запис прибрано",
                    few: "старі записи прибрано",
                    many: "старих записів прибрано",
                  })}`,
                }
              : {
                  icon: "refresh-cw" as const,
                  iconClass: "motion-safe:animate-spin-slow",
                  label: `Синхронізація · ${queueLabel(pending)}`,
                };

  const announcement =
    state === "offline"
      ? "Офлайн"
      : state === "syncing"
        ? "Синхронізація"
        : view.label;

  const content = (
    <>
      <button
        type="button"
        data-testid="offline-banner"
        data-state={state}
        onClick={() => setSheetOpen(true)}
        aria-label={`${view.label}. Відкрити деталі синхронізації`}
        className={PILL_CLS}
      >
        <Icon
          name={view.icon}
          size="xs"
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
        rejected={syncV2RejectedCount}
        sessionExpired={sessionExpired}
        onRetry={retrySyncV2DeadLetters}
      />
    </>
  );

  // Той самий Fragment зі статусом першим, що й у гілці без банера: React
  // оновлює наявний вузол регіону, а не монтує новий.
  return (
    <>
      {statusRegion(announcement)}
      {headerSlot ? createPortal(content, headerSlot) : content}
    </>
  );
}
