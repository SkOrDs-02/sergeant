/**
 * `KpiRow` — dashboard KPI strip (streak / weekly volume / weight Δ).
 *
 * Purely presentational: the `DashboardKpis` payload is computed by
 * `@sergeant/fizruk-domain/domain/dashboard`'s `computeDashboardKpis`,
 * so the aggregation stays platform-neutral and shared with
 * `apps/mobile/src/modules/fizruk/components/dashboard/KpiRow.tsx`.
 *
 * Three tiles side-by-side on a compact Card. Numbers are formatted
 * for Ukrainian pluralisation (`1 день` / `2 дні` / `5 днів` and
 * `1 тренування` / `2 тренування` / `5 тренувань`). Weight delta
 * swaps tone — a drop is reported as `text-success`, a gain as
 * `text-danger` — so the strip reads as progress towards a recomp
 * goal out of the box. (Callers who are bulking can still ignore the
 * colour and just read the number.)
 */

import { Card } from "@shared/components/ui/Card";
import { SectionHeading } from "@shared/components/ui/SectionHeading";
import type { DashboardKpis } from "@sergeant/fizruk-domain/domain";

export interface KpiRowProps {
  readonly kpis: DashboardKpis;
  readonly className?: string;
}

type TileTone = "default" | "positive" | "negative";

interface TileProps {
  readonly label: string;
  readonly value: string;
  readonly hint?: string;
  readonly tone?: TileTone;
}

const TONE_CLASS: Record<TileTone, string> = {
  default: "text-text",
  positive: "text-success",
  negative: "text-danger",
};

function Tile({ label, value, hint, tone = "default" }: TileProps) {
  return (
    <div className="flex-1 min-w-0 rounded-2xl border border-line bg-panel p-3 flex flex-col">
      <SectionHeading as="p" size="xs">
        {label}
      </SectionHeading>
      <p
        className={`mt-1 text-style-title leading-tight truncate ${TONE_CLASS[tone]}`}
      >
        {value}
      </p>
      {hint ? (
        <p className="mt-0.5 text-meta text-subtle truncate">{hint}</p>
      ) : null}
    </div>
  );
}

function formatVolumeKg(kg: number): string {
  if (kg <= 0) return "0 кг";
  if (kg >= 1000) {
    const thousands = kg / 1000;
    const rounded =
      thousands >= 10 ? Math.round(thousands) : Math.round(thousands * 10) / 10;
    return `${rounded} т`;
  }
  return `${Math.round(kg)} кг`;
}

function formatWeightDelta(delta: number | null): {
  readonly value: string;
  readonly tone: TileTone;
} {
  if (delta == null) return { value: "—", tone: "default" };
  if (delta === 0) return { value: "0 кг", tone: "default" };
  const sign = delta > 0 ? "+" : "−";
  const abs = Math.abs(delta);
  const rounded = Math.round(abs * 10) / 10;
  return {
    value: `${sign}${rounded} кг`,
    tone: delta < 0 ? "positive" : "negative",
  };
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

export function KpiRow({ kpis, className }: KpiRowProps) {
  const streakLabel =
    kpis.streakDays > 0 ? pluralDays(kpis.streakDays) : "0 днів";
  const weeklyLabel = formatVolumeKg(kpis.weeklyVolumeKg);
  const weeklyHint = pluralWorkouts(kpis.weeklyWorkoutsCount);
  const delta = formatWeightDelta(kpis.weightChangeKg);

  return (
    <Card
      as="section"
      radius="lg"
      padding="sm"
      aria-label="Ключові показники тренувань"
      className={className}
    >
      <div className="flex flex-row gap-2">
        <Tile
          label="Серія"
          value={streakLabel}
          hint={kpis.streakDays === 0 ? "Почни сьогодні або вчора" : "підряд"}
        />
        <Tile label="Цей тиждень" value={weeklyLabel} hint={weeklyHint} />
        <Tile
          label={`Вага · ${kpis.weightWindowDays}д`}
          value={delta.value}
          hint={kpis.weightChangeKg == null ? "Додай заміри" : "дельта"}
          tone={delta.tone}
        />
      </div>
    </Card>
  );
}
