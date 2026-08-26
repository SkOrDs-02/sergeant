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
import { formatNumberUk, pluralUa } from "@sergeant/shared";
import { messages } from "@shared/i18n/uk";
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
  success: "text-success-strong dark:text-success",
  danger: "text-danger-strong dark:text-danger",
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
      radius="lg"
      padding="none"
      onClick={onClick}
      aria-label={ariaLabel}
      // V-4 fix: the value line is visually truncated (`truncate` below) on
      // narrow chips, so a hover/long-press title carries the same full
      // sentence the aria-label already gives screen readers — sighted
      // mouse users get the untruncated meaning too, not just AT users.
      title={ariaLabel}
      className="flex-1 min-w-0 active:scale-[0.99] hover:opacity-90 px-3 py-2.5 text-left transition-[opacity,transform] focus:outline-none focus-visible:ring-2 focus-visible:ring-focus/45 focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
    >
      {/* AI-CONTEXT: значення першим, підпис під ним. Чип читають заради
          числа, а не заради слова «Обʼєм»; підпис зверху змушував прочитати
          службове слово, перш ніж дійти до факту. Порядок у DOM = порядок
          читання, тож screen reader теж отримує спершу значення. */}
      <span
        className={`block text-style-label leading-tight truncate ${TONE_VALUE_CLASS[tone]}`}
      >
        {value}
      </span>
      <span className="block mt-0.5 text-style-caption text-muted truncate">
        {label}
      </span>
    </Card>
  );
}

function pluralWeeks(n: number): string {
  return `${n} ${pluralUa(n, { one: "тиждень", few: "тижні", many: "тижнів" })}`;
}

function pluralWorkouts(n: number): string {
  return `${n} ${pluralUa(n, { one: "тренування", few: "тренування", many: "тренувань" })}`;
}

/**
 * Full, untruncated sentence for 2+ fatigued groups — e.g. "3 групи
 * втомлені" / "5 груп втомлено". Only ever feeds the chip's accessible
 * name / hover title (`summariseReadiness.full`), never the visible chip
 * face — see `compactFatiguedGroups` for why.
 */
function pluralFatiguedGroups(n: number): string {
  return `${n} ${pluralUa(n, { one: "група втомлена", few: "групи втомлені", many: "груп втомлено" })}`;
}

/**
 * Fizruk audit V-4: the full sentence above (16+ characters at n≥2) does
 * not fit the readiness chip's face on a 390px viewport — the first KPI
 * cell rendered as «4 групи вто…», silently clipped by the `truncate` on
 * `Chip`'s value line. This compact form stays well under that budget
 * ("Втомлені: 10" tops out at 12 chars); the full sentence is still
 * reachable via `aria-label`/`title` (see `Chip`).
 */
function compactFatiguedGroups(n: number): string {
  return `${messages.fizruk.dashboard.fatiguedCompactPrefix}: ${n}`;
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
    // AI-CONTEXT: `${rounded}` давав КРАПКУ («−2.5 кг») посеред
    // інтерфейсу, де всюди кома. Компонент `Measure` сюди не стає —
    // це значення йде і в чип, і всередину `ariaLabel`-рядка, тобто
    // межа рядкового API (той самий виняток, що в таблиці `Money`).
    // Але локаль виправити можна й не змінюючи типу.
    value: `${sign}${formatNumberUk(rounded)} кг`,
    tone: delta < 0 ? "success" : "danger",
  };
}

interface ReadinessSummary {
  /** Short text rendered on the chip face — must survive `truncate` (V-4). */
  readonly value: string;
  readonly tone: ChipTone;
  /** Full, untruncated sentence — feeds the chip's aria-label/title. */
  readonly full: string;
}

function summariseReadiness(
  avoid: StatusStripRecoverySummary["avoid"],
): ReadinessSummary {
  if (avoid.length === 0) return { value: "ОК", tone: "success", full: "ОК" };
  if (avoid.length === 1) {
    const label = avoid[0]?.label?.trim();
    const value = label ? `${label} втомлені` : "1 група втомлена";
    return { value, tone: "danger", full: value };
  }
  return {
    value: compactFatiguedGroups(avoid.length),
    tone: "danger",
    full: pluralFatiguedGroups(avoid.length),
  };
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
  // Канон §7: стрік тижневий, не щоденний — щоденна логіка карала за
  // правильний день відпочинку. `kpis.streakDays` лишається в payload-і
  // для мобілки (поза скоупом), але веб його більше не показує.
  // V-4: на лице чипа йде рівно те, що переживе `truncate` (~67px на 320px),
  // повне речення — в `ariaLabel`/`title`. «1 з 2 цього тижня» цього правила
  // не тримало: потрібно 100px, різалось на 320 і 390px (браузерний аудит
  // 2026-08-26). Обличчя скорочене до «1 з 2», зміст не втрачено.
  const streakInProgress =
    kpis.streakWeeks === 0 &&
    kpis.currentWeekPending &&
    kpis.currentWeekWorkouts > 0;
  const streakValue =
    kpis.streakWeeks > 0
      ? pluralWeeks(kpis.streakWeeks)
      : streakInProgress
        ? `${kpis.currentWeekWorkouts} з ${kpis.streakTargetPerWeek}`
        : "0 тижнів";
  const streakFull = streakInProgress
    ? `${kpis.currentWeekWorkouts} з ${kpis.streakTargetPerWeek} цього тижня`
    : streakValue;
  const streakTone: ChipTone = kpis.streakWeeks > 0 ? "success" : "default";
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
        ariaLabel={`Готовність: ${readiness.full}. Відкрити «Тіло»`}
      />
      <Chip
        label="Серія"
        value={streakValue}
        tone={streakTone}
        onClick={onOpenProgress}
        ariaLabel={`Серія: ${streakFull}. Відкрити «Прогрес»`}
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
