/**
 * `StatusStrip` — replacement for `KpiRow` on the Fizruk Dashboard.
 *
 * Three (or four) tappable chips in a single horizontal strip that
 * answer the questions «can I train», «am I keeping up», «how is the
 * week going» — and optionally «is the weight moving». Each chip
 * navigates to the page that owns the underlying surface, so the
 * Dashboard stays an index instead of a dead-end summary:
 *
 *   - Готовність → Тіло
 *   - Серія      → Прогрес
 *   - Тиждень    → Тренування
 *   - Δ вага     → Тіло (only rendered when the user has measurements)
 *
 * Pure / presentational — `DashboardKpis` is computed by
 * `@sergeant/fizruk-domain/domain/dashboard`'s `computeDashboardKpis`,
 * the recovery summary is computed by `useRecovery`. Both shapes are
 * passed in so this component can be storybooked and tested in
 * isolation.
 */

import { Card } from "@shared/components/ui/Card";
import type { DashboardKpis } from "@sergeant/fizruk-domain/domain";
import type { MuscleState } from "@sergeant/fizruk-domain";

export interface StatusStripRecoverySummary {
  /** Muscle groups currently in the «red» recovery state. */
  readonly avoid: readonly Pick<MuscleState, "id" | "label" | "status">[];
}

export interface StatusStripProps {
  readonly kpis: DashboardKpis;
  readonly recovery: StatusStripRecoverySummary;
  readonly onOpenBody: () => void;
  readonly onOpenProgress: () => void;
  readonly onOpenWorkouts: () => void;
  readonly className?: string;
}

type ChipTone = "default" | "success" | "danger";

const TONE_VALUE_CLASS: Record<ChipTone, string> = {
  default: "text-text",
  success: "text-success",
  danger: "text-danger",
};

interface ChipProps {
  readonly label: string;
  readonly value: string;
  readonly tone: ChipTone;
  readonly onClick: () => void;
  readonly ariaLabel: string;
}

function Chip({ label, value, tone, onClick, ariaLabel }: ChipProps) {
  return (
    <Card
      as="button"
      prominence="glass"
      radius="r-xl"
      padding="none"
      onClick={onClick}
      aria-label={ariaLabel}
      className="flex-1 min-w-0 active:scale-[0.99] hover:opacity-90 px-3 py-2.5 text-left transition-[opacity,transform]"
    >
      <span className="block text-meta text-subtle truncate">{label}</span>
      <span
        className={`block mt-0.5 text-style-label leading-tight truncate ${TONE_VALUE_CLASS[tone]}`}
      >
        {value}
      </span>
    </Card>
  );
}

function pluralDays(n: number): string {
  const mod100 = n % 100;
  const mod10 = n % 10;
  if (mod100 >= 11 && mod100 <= 14) return `${n} днів`;
  if (mod10 === 1) return `${n} день`;
  if (mod10 >= 2 && mod10 <= 4) return `${n} дні`;
  return `${n} днів`;
}

function pluralWorkouts(n: number): string {
  const mod100 = n % 100;
  const mod10 = n % 10;
  if (mod100 >= 11 && mod100 <= 14) return `${n} тренувань`;
  if (mod10 === 1) return `${n} тренування`;
  if (mod10 >= 2 && mod10 <= 4) return `${n} тренування`;
  return `${n} тренувань`;
}

function pluralFatiguedGroups(n: number): string {
  const mod100 = n % 100;
  const mod10 = n % 10;
  if (mod100 >= 11 && mod100 <= 14) return `${n} груп втомлено`;
  if (mod10 === 1) return `${n} група втомлена`;
  if (mod10 >= 2 && mod10 <= 4) return `${n} групи втомлені`;
  return `${n} груп втомлено`;
}

function formatWeightDelta(delta: number): {
  readonly value: string;
  readonly tone: ChipTone;
} {
  if (delta === 0) return { value: "0 кг", tone: "default" };
  const sign = delta > 0 ? "+" : "−";
  const abs = Math.abs(delta);
  const rounded = Math.round(abs * 10) / 10;
  return {
    value: `${sign}${rounded} кг`,
    tone: delta < 0 ? "success" : "danger",
  };
}

interface ReadinessSummary {
  readonly value: string;
  readonly tone: ChipTone;
}

function summariseReadiness(
  avoid: StatusStripRecoverySummary["avoid"],
): ReadinessSummary {
  if (avoid.length === 0) return { value: "ОК", tone: "success" };
  if (avoid.length === 1) {
    const label = avoid[0]?.label?.trim();
    return {
      value: label ? `${label} втомлені` : "1 група втомлена",
      tone: "danger",
    };
  }
  return { value: pluralFatiguedGroups(avoid.length), tone: "danger" };
}

export function StatusStrip({
  kpis,
  recovery,
  onOpenBody,
  onOpenProgress,
  onOpenWorkouts,
  className,
}: StatusStripProps) {
  const readiness = summariseReadiness(recovery.avoid);
  const streakValue =
    kpis.streakDays > 0 ? pluralDays(kpis.streakDays) : "0 днів";
  const streakTone: ChipTone = kpis.streakDays > 0 ? "success" : "default";
  const weeklyValue = pluralWorkouts(kpis.weeklyWorkoutsCount);
  const weeklyTone: ChipTone =
    kpis.weeklyWorkoutsCount > 0 ? "default" : "default";

  const showWeight = kpis.weightChangeKg != null;
  const weight = showWeight
    ? formatWeightDelta(kpis.weightChangeKg as number)
    : null;

  return (
    <section
      aria-label="Статус: готовність, серія, тиждень"
      className={`flex flex-row gap-2 ${className ?? ""}`.trim()}
    >
      <Chip
        label="Готовність"
        value={readiness.value}
        tone={readiness.tone}
        onClick={onOpenBody}
        ariaLabel={`Готовність: ${readiness.value}. Відкрити «Тіло»`}
      />
      <Chip
        label="Серія"
        value={streakValue}
        tone={streakTone}
        onClick={onOpenProgress}
        ariaLabel={`Серія: ${streakValue}. Відкрити «Прогрес»`}
      />
      <Chip
        label="Тиждень"
        value={weeklyValue}
        tone={weeklyTone}
        onClick={onOpenWorkouts}
        ariaLabel={`Цей тиждень: ${weeklyValue}. Відкрити «Тренування»`}
      />
      {weight ? (
        <Chip
          label={`Вага · ${kpis.weightWindowDays}д`}
          value={weight.value}
          tone={weight.tone}
          onClick={onOpenBody}
          ariaLabel={`Зміна ваги за ${kpis.weightWindowDays} днів: ${weight.value}. Відкрити «Тіло»`}
        />
      ) : null}
    </section>
  );
}
