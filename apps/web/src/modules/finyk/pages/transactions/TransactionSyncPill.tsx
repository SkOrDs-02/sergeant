/**
 * Last validated: 2026-05-14
 * Status: Active
 */
import { cn } from "@shared/lib/ui/cn";
import { useRelativeTime } from "@shared/hooks/useRelativeTime";

export interface TransactionSyncPillProps {
  syncState:
    | {
        status: "idle" | "loading" | "success" | "partial" | "error";
        source?: "network" | "cache" | "none" | undefined;
        accountsOk?: number | undefined;
        accountsTotal?: number | undefined;
      }
    | undefined;
  lastUpdated: Date | null | undefined;
}

/** Sync state and last update are plain facts in the controls row. */
export function TransactionSyncPill({
  syncState,
  lastUpdated,
}: TransactionSyncPillProps) {
  // Live relative label — re-renders on a ~30s tick so it never freezes at
  // an absolute "21:57" (mobile-audit A6). Called before the early return to
  // keep the hook order stable.
  const lastUpdatedLabel = useRelativeTime(lastUpdated ?? null);
  const showSyncRow = syncState?.status !== "idle" || lastUpdated;
  if (!showSyncRow) return null;

  const tone =
    syncState?.status === "error" ? "text-danger-strong" : "text-muted";
  const statusLabel =
    syncState?.status === "loading"
      ? "оновлення…"
      : syncState?.status === "success"
        ? "синхронізовано"
        : syncState?.status === "partial"
          ? "частково"
          : syncState?.status === "error"
            ? "не синхронізовано"
            : "";
  const sourceLabel =
    syncState?.source === "network"
      ? "мережа"
      : syncState?.source === "cache"
        ? "кеш"
        : "нема";
  return (
    <div className="flex items-center gap-2 flex-wrap text-style-caption">
      {syncState?.status !== "idle" && statusLabel && (
        <span
          className={cn("inline-flex items-center gap-1.5 tabular-nums", tone)}
          aria-label={`Стан синхронізації: ${statusLabel}, джерело: ${sourceLabel}, акаунтів: ${syncState?.accountsOk}/${syncState?.accountsTotal}`}
        >
          <span>{statusLabel}</span>
          <span className="text-line" aria-hidden>
            ·
          </span>
          <span>{sourceLabel}</span>
          <span className="text-line" aria-hidden>
            ·
          </span>
          <span>
            {syncState?.accountsOk}/{syncState?.accountsTotal}
          </span>
        </span>
      )}
      {lastUpdatedLabel && (
        <span className="text-subtle tabular-nums">
          оновлено · {lastUpdatedLabel}
        </span>
      )}
    </div>
  );
}
