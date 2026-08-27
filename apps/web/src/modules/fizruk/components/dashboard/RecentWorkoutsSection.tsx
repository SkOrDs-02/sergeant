/**
 * Last validated: 2026-05-14
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

import { Card } from "@shared/components/ui/Card";
import { Icon } from "@shared/components/ui/Icon";
import { SectionHeading } from "@shared/components/ui/SectionHeading";
import type { DashboardRecentWorkout } from "@sergeant/fizruk-domain/domain";
import { formatNumberUk } from "@sergeant/shared";

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
    // Кома, а не крапка: `${rounded}` дає «1.5 т» посеред українського
    // набору. Рядок тут лишається рядком свідомо — див. `StatusStrip`.
    return `${formatNumberUk(rounded)} т`;
  }
  return `${Math.round(kg)} кг`;
}

export function RecentWorkoutsSection({
  recent,
  onSeeAll,
}: RecentWorkoutsSectionProps) {
  return (
    // П3 «край і зріз»: список завершених тренувань — це журнал звітів
    // (дата, тривалість, тоннаж), тест «існує як аркуш» проходить, тож
    // `edge="stub"`. Скло (`prominence="glass"`) прибрано навмисно: скло й
    // документ — дві різні мови для тієї самої поверхні (прозора площина
    // проти паперового аркуша), і вони конфліктують. Обрано документ —
    // саме він несе продуктовий смисл цієї секції; прозорість тут була
    // суто декоративною.
    <Card
      as="section"
      edge="stub"
      padding="none"
      aria-label="Останні тренування"
    >
      <div className="p-4">
        <div className="flex items-baseline justify-between gap-2 mb-3">
          <SectionHeading as="h2" size="xs" variant="fizruk">
            Останні тренування
          </SectionHeading>
          {recent.length > 0 ? (
            <button
              type="button"
              onClick={onSeeAll}
              className="inline-flex items-center gap-0.5 text-style-caption text-fizruk-strong dark:text-fizruk hover:underline active:opacity-70 rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-focus/45 focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
              aria-label="Усі тренування"
            >
              {/* Без гліфа «→»: типографічна стрілка бралася з системного
                  шрифта — власна метрика й базова лінія на кожній ОС, повз
                  розмірний токен. Той самий прохід, що зняв 30 гліфів зі
                  слотів іконок. */}
              Усі
              <Icon name="chevron-right" size="xs" />
            </button>
          ) : null}
        </div>

        {recent.length === 0 ? (
          <div
            className="rounded-2xl border border-dashed border-surface-line p-6 flex flex-col items-center text-center"
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
          <ul className="flex flex-col gap-2">
            {recent.map((row, idx) => (
              <li
                key={`${row.startedAt}-${idx}`}
                className="rounded-2xl p-3 flex items-center justify-between gap-3"
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
                  <span className="text-style-label text-fizruk-strong dark:text-fizruk">
                    {formatTonnage(row.tonnageKg)}
                  </span>
                  <span className="text-style-caption text-muted">тоннаж</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}
