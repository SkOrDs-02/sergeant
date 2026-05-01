import { memo } from "react";
import { cn } from "@shared/lib/cn";

function formatTs(ts) {
  if (!ts) return null;
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return null;
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

// Простий індикатор синхронізації. Рендериться в Overview, де багато
// стан-залежних значень змінюються часто — memo зменшує зайві рендери.
function SyncStatusBadgeComponent({
  syncState,
  lastUpdated,
  error,
  onRetry,
  loading,
}) {
  const status = syncState?.status || "idle";
  const isError = status === "error";
  const isPartial = status === "partial";
  const isLoading = status === "loading" || loading;
  const isSuccess = status === "success";

  const dotClass = isLoading
    ? "bg-amber-400 motion-safe:animate-pulse"
    : isError
      ? "bg-danger"
      : isPartial
        ? "bg-warning"
        : isSuccess
          ? "bg-success"
          : "bg-subtle/40";

  const label = isLoading
    ? "Синхронізація…"
    : isError
      ? "Помилка синхронізації"
      : isPartial
        ? "Часткова синхронізація"
        : isSuccess
          ? "Синхронізовано"
          : "Очікування";

  const ts = formatTs(lastUpdated);

  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-xl px-3 py-2 text-xs border",
        isError
          ? "bg-danger/10 border-danger/30"
          : isPartial
            ? "bg-warning/10 border-warning/30"
            : "bg-panel border-line",
      )}
    >
      <span className={cn("w-2 h-2 rounded-full shrink-0", dotClass)} />
      <span className="text-text font-medium">{label}</span>
      {ts && <span className="text-subtle ml-auto tabular-nums">{ts}</span>}
      {(isError || isPartial) && typeof onRetry === "function" && (
        <button
          type="button"
          onClick={onRetry}
          disabled={isLoading}
          className="ml-1 px-2 py-1 rounded-xl bg-panel border border-line text-xs font-semibold text-text hover:bg-panelHi transition-colors disabled:opacity-50"
        >
          Повторити
        </button>
      )}
      {error && !isLoading && (
        <span
          className="text-danger/80 text-2xs truncate max-w-[160px]"
          title={error}
        >
          {error}
        </span>
      )}
    </div>
  );
}

export const SyncStatusBadge = memo(SyncStatusBadgeComponent);
