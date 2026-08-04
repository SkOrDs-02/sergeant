/**
 * Last validated: 2026-05-14
 * Status: Active
 */
import { memo } from "react";
import { cn } from "@shared/lib/ui/cn";
import { ProgressBar } from "@shared/components/ui";

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
 * - `running`: shared `<ProgressBar variant="neutral">` (`accountsProcessed
 *   / accountsTotal`, exact `%`, ink fill so it stays status-neutral) +
 *   transactions counter + currently-processing account hint.
 * - `completed`: green check + total transactions backfilled.
 * - `failed`: red ! + truncated error message.
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
    ? "bg-danger/10 border-danger/30 text-danger-strong dark:text-danger"
    : isCompleted
      ? "bg-success/10 border-success/30 text-text"
      : "bg-panelHi border-line text-text";

  const dotTone = isFailed
    ? "bg-danger"
    : isCompleted
      ? "bg-success"
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
        <ProgressBar value={pct} max={100} size="sm" variant="neutral" />
      )}
    </div>
  );
});

export default BackfillProgressPill;
