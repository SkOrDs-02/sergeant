import { cn } from "@shared/lib/cn";

export interface TransactionSyncPillProps {
  syncState:
    | {
        status: "idle" | "loading" | "success" | "partial" | "error";
        source?: "network" | "cache" | "none";
        accountsOk?: number;
        accountsTotal?: number;
      }
    | undefined;
  lastUpdated: Date | null | undefined;
}

/**
 * Compact sync + last-updated meta row.
 *
 * Floating "✓ синхронізовано · мережа · 6/6 акаунтів" + bare "Оновлено:
 * 10:55" used to read as two stray grey lines under the action cluster.
 * Collapsed into one pill chip + inline timestamp so the panel reads as
 * a single controls tray.
 */
export function TransactionSyncPill({
  syncState,
  lastUpdated,
}: TransactionSyncPillProps) {
  const showSyncRow = syncState?.status !== "idle" || lastUpdated;
  if (!showSyncRow) return null;

  // Sync-meta pill: tone follows status, dot mirrors `text-*` colour so the
  // pill remains a single-glance status chip even without reading the label.
  const tone =
    syncState?.status === "error"
      ? "text-danger border-danger/30 bg-danger/10"
      : syncState?.status === "partial"
        ? "text-warning border-warning/30 bg-warning/10"
        : syncState?.status === "loading"
          ? "text-subtle border-line/60 bg-panelHi/60"
          : "text-subtle border-line/60 bg-panelHi/60";
  const dot =
    syncState?.status === "error"
      ? "bg-danger"
      : syncState?.status === "partial"
        ? "bg-warning"
        : syncState?.status === "loading"
          ? "bg-muted motion-safe:animate-pulse"
          : "bg-success";
  const statusLabel =
    syncState?.status === "loading"
      ? "оновлення…"
      : syncState?.status === "success"
        ? "синхронізовано"
        : syncState?.status === "partial"
          ? "частково"
          : syncState?.status === "error"
            ? "помилка"
            : "";
  const sourceLabel =
    syncState?.source === "network"
      ? "мережа"
      : syncState?.source === "cache"
        ? "кеш"
        : "нема";
  const lastUpdatedLabel = lastUpdated
    ? lastUpdated.toLocaleTimeString("uk-UA", {
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  return (
    <div className="flex items-center gap-2 flex-wrap text-2xs">
      {syncState?.status !== "idle" && statusLabel && (
        <span
          className={cn(
            "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border tabular-nums",
            tone,
          )}
          aria-label={`Стан синхронізації: ${statusLabel}, джерело: ${sourceLabel}, акаунтів: ${syncState?.accountsOk}/${syncState?.accountsTotal}`}
        >
          <span
            className={cn(
              "inline-block w-1.5 h-1.5 rounded-full shrink-0",
              dot,
            )}
            aria-hidden
          />
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
