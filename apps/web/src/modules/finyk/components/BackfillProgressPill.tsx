import { memo } from "react";
import { cn } from "@shared/lib/ui/cn";

import type { MonoBackfillProgress } from "@shared/api";

interface BackfillProgressPillProps {
  progress: MonoBackfillProgress | null;
  /**
   * Whether to keep rendering after the job finishes. Settings shows the
   * "Завершено · X транзакцій" line until the user dismisses or the page
   * reloads, while the Transactions screen prefers a transient pill that
   * disappears with the polling.
   */
  keepAfterComplete?: boolean;
  className?: string;
}

/**
 * Renders the live state of a Monobank backfill job.
 *
 * Visible whenever the underlying query has a non-`idle` snapshot. Hidden
 * for the resting state so the settings panel doesn't grow a permanent pill.
 *
 * - `running`: progress bar (`accountsProcessed / accountsTotal`) +
 *   transactions counter + currently-processing account hint.
 * - `completed`: green check + total transactions backfilled.
 * - `failed`: red ! + truncated error message.
 *
 * Per AGENTS.md hard rule #8 we stick to the registered Tailwind opacity
 * scale (10/20/30/…). The progress bar uses an inline `width: <pct>%` so
 * the value is always exact rather than discretised by Tailwind classes.
 */
export const BackfillProgressPill = memo(function BackfillProgressPill({
  progress,
  keepAfterComplete = true,
  className,
}: BackfillProgressPillProps) {
  if (!progress || progress.status === "idle") return null;
  if (!keepAfterComplete && progress.status !== "running") return null;

  const isRunning = progress.status === "running";
  const isCompleted = progress.status === "completed";
  const isFailed = progress.status === "failed";

  // Guard against `accountsTotal === 0`: emit 0 % rather than NaN so the bar
  // still renders as an empty track. Cap at 100 % for the "completed" state
  // even if counters disagree by one.
  const pct =
    progress.accountsTotal > 0
      ? Math.min(
          100,
          Math.round(
            (progress.accountsProcessed / progress.accountsTotal) * 100,
          ),
        )
      : 0;

  const tone = isFailed
    ? "bg-danger/10 border-danger/30 text-danger"
    : isCompleted
      ? "bg-green-500/10 border-green-500/30 text-text"
      : "bg-panelHi border-line text-text";

  const dotTone = isFailed
    ? "bg-danger"
    : isCompleted
      ? "bg-green-500"
      : "bg-primary motion-safe:animate-pulse";

  const headline = isRunning
    ? `Завантаження виписки · ${progress.accountsProcessed}/${progress.accountsTotal} рах.`
    : isCompleted
      ? "Завершено"
      : "Помилка backfill";

  const detail = isRunning
    ? `${progress.transactionsProcessed.toLocaleString("uk-UA")} тр.`
    : isCompleted
      ? `${progress.transactionsProcessed.toLocaleString("uk-UA")} транзакцій`
      : (progress.lastError ?? "невідома помилка");

  return (
    <div
      className={cn("rounded-xl border px-3 py-2.5 space-y-2", tone, className)}
      role={isRunning ? "status" : undefined}
      aria-live={isRunning ? "polite" : undefined}
      aria-label={`${headline} — ${detail}`}
    >
      <div className="flex items-center gap-2 text-style-caption">
        <span
          className={cn("inline-block w-2 h-2 rounded-full shrink-0", dotTone)}
          aria-hidden
        />
        <span className="flex-1 truncate">{headline}</span>
        <span className="tabular-nums text-subtle">{detail}</span>
      </div>
      {isRunning && (
        <div
          className="h-1.5 rounded-full bg-line/60 overflow-hidden"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
        >
          <div
            className="h-full bg-primary transition-[width] duration-300 ease-out"
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
    </div>
  );
});

export default BackfillProgressPill;
