/**
 * Last validated: 2026-09-13
 * Status: Active
 */
/**
 *
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

import { Button } from "@shared/components/ui/Button";
import { Card } from "@shared/components/ui/Card";
import { SectionHeading } from "@shared/components/ui/SectionHeading";
import { formatDayKeyUk } from "@shared/lib/time/dayKeyLabel";
import type { DashboardRecentWorkout } from "@sergeant/fizruk-domain/domain";
import { deviceDayKey, formatNumberUk } from "@sergeant/shared";

export interface RecentWorkoutsSectionProps {
  readonly recent: readonly DashboardRecentWorkout[];
  readonly onSeeAll: () => void;
}

function formatDateShort(iso: string | null): string {
  if (!iso) return "";
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return "";
  return formatDayKeyUk(deviceDayKey(ms), {
    todayKey: deviceDayKey(),
    relative: false,
  });
}

function formatDuration(sec: number): string {
  if (!Number.isFinite(sec) || sec <= 0) return "—";
  // Підлога в одну хвилину. Без неї тренування коротше за 30 с підписувалось
  // «0 хв» — запис існує, а тривалість у нього нульова (browser-QA
  // 2026-09-02). Той самий гард уже стоїть у `WorkoutsHome`, і тримати їх
  // різними не можна: обидві поверхні підписують ОДНЕ тренування, тож
  // чесніше «< 1 хв» тут дало б розбіжність у двох місцях замість нуля в
  // одному.
  const mins = Math.max(1, Math.round(sec / 60));
  if (mins < 60) return `${mins}\u202Fхв`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h}\u202Fгод` : `${h}\u202Fгод ${m}\u202Fхв`;
}

/**
 * PR-Z3 (аудит 2026-09-13, хвиля 6): раніше великі значення показувались
 * як «1,5 т» — реальні тонни тут ще менш чесні за голе «кг», бо ця
 * величина взагалі не маса, а `вага_кг × повторення`
 * (`computeWorkoutTonnageKg`). Канонічний підпис — "кг×повт", той самий,
 * що вже стояв у `WeeklyVolumeChart` і тепер уніфікований по всьому
 * модулю (`WorkoutSummaryView`, `WorkoutFinishSheets`). Абревіатуру до
 * тонн знято разом зі зняттям неоднозначної одиниці — жодна інша
 * поверхня fizruk не скорочує велике число так само.
 */
function formatTonnage(kg: number): string {
  if (!Number.isFinite(kg) || kg <= 0) return "—";
  return `${formatNumberUk(Math.round(kg))} кг×повт`;
}

export function RecentWorkoutsSection({
  recent,
  onSeeAll,
}: RecentWorkoutsSectionProps) {
  return (
    <Card as="section" padding="none" aria-label="Останні тренування">
      <div className="p-4">
        <div className="flex items-baseline justify-between gap-2 mb-3">
          <SectionHeading as="h2" size="lg">
            Останні тренування
          </SectionHeading>
          {recent.length > 0 ? (
            <Button
              variant="text"
              size="sm"
              onClick={onSeeAll}
              aria-label="Усі тренування"
            >
              Усі
            </Button>
          ) : null}
        </div>

        {recent.length === 0 ? (
          <div
            className="py-3 flex flex-col items-center text-center"
            data-testid="fizruk-dashboard-recent-empty"
          >
            <p className="text-style-label text-text">
              Ще жодного завершеного тренування
            </p>
            <p className="text-style-caption text-muted mt-1">
              Почни сесію, результати зʼявляться тут автоматично.
            </p>
          </div>
        ) : (
          <ul className="flex flex-col divide-y divide-line">
            {recent.map((row, idx) => (
              <li
                key={`${row.startedAt}-${idx}`}
                className="py-3 flex items-center justify-between gap-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-style-label text-text truncate">
                    {row.label}
                  </p>
                  <p className="text-style-caption text-muted mt-0.5">
                    {formatDateShort(row.endedAt)} ·{" "}
                    {formatDuration(row.durationSec)}
                  </p>
                </div>
                <div className="flex flex-col items-end shrink-0">
                  <span className="text-style-label text-text">
                    {formatTonnage(row.tonnageKg)}
                  </span>
                  {/* PR-Z3: назва метрики уніфікована з `WorkoutSummaryView`
                      / `WorkoutFinishSheets` — усюди "Обʼєм", не "тоннаж". */}
                  <span className="text-style-caption text-muted">Обʼєм</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}
