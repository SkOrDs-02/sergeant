/**
 * `RecentWorkoutsSection` — bottom-of-dashboard list of the last few
 * completed workouts. Uses the pure `listRecentCompletedWorkouts`
 * selector from `@sergeant/fizruk-domain/domain/dashboard` so ordering,
 * duration and tonnage stay consistent with
 * `apps/mobile/src/modules/fizruk/components/dashboard/RecentWorkoutsSection.tsx`.
 *
 * Collapses gracefully to an empty-state card when there is nothing to
 * show. The "Усі" pill routes to the Workouts journal (`#workouts` with
 * `fizruk_workouts_mode=log`) — the same surface the resume-CTA uses.
 */

import { Card } from "@shared/components/ui/Card";
import { SectionHeading } from "@shared/components/ui/SectionHeading";
import type { DashboardRecentWorkout } from "@sergeant/fizruk-domain/domain";

export interface RecentWorkoutsSectionProps {
  readonly recent: readonly DashboardRecentWorkout[];
  readonly onSeeAll: () => void;
}

function formatDateShort(iso: string | null): string {
  if (!iso) return "";
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return "";
  try {
    return new Date(ms).toLocaleDateString("uk-UA", {
      day: "numeric",
      month: "short",
    });
  } catch {
    return "";
  }
}

function formatDuration(sec: number): string {
  if (!Number.isFinite(sec) || sec <= 0) return "—";
  const mins = Math.round(sec / 60);
  if (mins < 60) return `${mins} хв`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h} год` : `${h} год ${m} хв`;
}

function formatTonnage(kg: number): string {
  if (!Number.isFinite(kg) || kg <= 0) return "—";
  if (kg >= 1000) {
    const thousands = kg / 1000;
    const rounded =
      thousands >= 10 ? Math.round(thousands) : Math.round(thousands * 10) / 10;
    return `${rounded} т`;
  }
  return `${Math.round(kg)} кг`;
}

export function RecentWorkoutsSection({
  recent,
  onSeeAll,
}: RecentWorkoutsSectionProps) {
  return (
    <Card as="section" radius="lg" aria-label="Останні тренування">
      <div className="flex items-baseline justify-between gap-2 mb-3">
        <SectionHeading as="h2" size="sm">
          Останні тренування
        </SectionHeading>
        {recent.length > 0 ? (
          <button
            type="button"
            onClick={onSeeAll}
            className="text-xs font-semibold text-fizruk-strong hover:underline active:opacity-70"
            aria-label="Усі тренування"
          >
            Усі →
          </button>
        ) : null}
      </div>

      {recent.length === 0 ? (
        <div
          className="rounded-2xl border border-dashed border-line p-6 flex flex-col items-center text-center"
          data-testid="fizruk-dashboard-recent-empty"
        >
          <p className="text-style-label text-text">
            Ще жодного завершеного тренування
          </p>
          <p className="text-xs text-subtle mt-1">
            Почни сесію — результати з&apos;являться тут автоматично.
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {recent.map((row) => (
            <li
              key={`${row.startedAt}-${row.endedAt ?? "na"}`}
              className="rounded-2xl border border-line bg-bg p-3 flex items-center justify-between gap-3"
            >
              <div className="min-w-0 flex-1">
                <p className="text-style-label text-text truncate">
                  {row.label}
                </p>
                <p className="text-meta text-subtle mt-0.5">
                  {formatDateShort(row.endedAt)} ·{" "}
                  {formatDuration(row.durationSec)}
                </p>
              </div>
              <div className="flex flex-col items-end shrink-0">
                <span className="text-sm font-bold text-fizruk-strong">
                  {formatTonnage(row.tonnageKg)}
                </span>
                <span className="text-micro text-subtle">тоннаж</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
