/**
 * Fizruk Dashboard hero — «Смуги відновлення» rows.
 *
 * Split out of `HeroCard.tsx` to stay under Hard Rule #18's 600-line cap.
 * Presentational: `Dashboard.tsx` computes the `HeroRecoveryRow[]` (via
 * `selectHeroRecoveryRows`) and the red-row recovery-by forecast map (via
 * `forecastFullRecoveryByDate`), this component only formats and renders.
 *
 * Спека: `docs/90-work/planning/specs/fizruk-hero-recovery-bars.md` § Рішення
 * дизайну, пункти 1 і 5.
 */
import type { HeroRecoveryRow } from "@sergeant/fizruk-domain";
import { fatiguePercent } from "../../lib/atlasHeat";

export interface HeroRecoveryBarsProps {
  readonly rows: readonly HeroRecoveryRow[];
  /**
   * Domain `MuscleState.id` → forecasted full-recovery date key
   * (`YYYY-MM-DD`, device-local — ADR-0078), from
   * `forecastFullRecoveryByDate`. Only consulted for `status: "red"`
   * muscle rows; injury rows never look here.
   */
  readonly recoverByDate: Readonly<Record<string, string | null>>;
  /** Tap a row → `Dashboard` navigates to the atlas focused on `atlasId`. */
  readonly onOpenAtlas: (atlasId: string) => void;
}

/**
 * Genitive Ukrainian weekday names ("до понеділка") keyed by `Date#getDay()`
 * (0 = неділя … 6 = субота). A small fixed table beats hand-rolling
 * declension rules, and the on-screen caption itself stays the short
 * abbreviated form (`до пн`) — this table only feeds the full a11y sentence.
 */
const WEEKDAY_GENITIVE_UK: Record<number, string> = {
  0: "неділі",
  1: "понеділка",
  2: "вівторка",
  3: "середи",
  4: "четверга",
  5: "пʼятниці",
  6: "суботи",
};

/** Short weekday abbreviation ("пн", "вт", …) for the on-screen caption. */
function weekdayShortUk(dateKey: string): string | null {
  const d = new Date(`${dateKey}T12:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("uk-UA", { weekday: "short" });
}

function weekdayGenitiveUk(dateKey: string): string | null {
  const d = new Date(`${dateKey}T12:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  // eslint-disable-next-line sergeant-design/prefer-kyiv-time -- ADR-0078: `dateKey` already came from `forecastFullRecoveryByDate`'s device-local recovery forecast (personal, not a report) — reading the weekday off the same device clock keeps it consistent.
  return WEEKDAY_GENITIVE_UK[d.getDay()] ?? null;
}

interface RowCaption {
  /** Visible face — survives the row's tight width (decision 5). */
  readonly short: string;
  /** Full sentence fragment for the row's `aria-label`. */
  readonly long: string;
}

/**
 * `describeDayRecovery`-style short caption (decision 5): «свіжа» / «майже» /
 * «до пн» for muscle rows, «травма» for injury rows. Red rows resolve a
 * `forecastFullRecoveryByDate` hit through `domainMuscleId`; no hit (still
 * outside the 21-day forecast horizon) falls back to the plain status word.
 */
function captionFor(
  row: HeroRecoveryRow,
  recoverByDate: Readonly<Record<string, string | null>>,
): RowCaption {
  if (row.kind === "injury") return { short: "травма", long: "травма" };
  if (row.status === "green") return { short: "свіжа", long: "свіжа" };
  if (row.status === "yellow") return { short: "майже", long: "майже" };

  const dateKey = row.domainMuscleId
    ? (recoverByDate[row.domainMuscleId] ?? null)
    : null;
  if (!dateKey) return { short: "відновлюється", long: "відновлюється" };
  const short = weekdayShortUk(dateKey);
  const genitive = weekdayGenitiveUk(dateKey);
  return {
    short: short ? `до ${short}` : "відновлюється",
    long: genitive ? `відновлюється, до ${genitive}` : "відновлюється",
  };
}

/**
 * One row's fatigue smuga — fills right-to-left (decision 5): `red` reads as
 * (nearly) full, `green` as a sliver stuck to the right edge. Width alone
 * carries the state; colour stays a single `hero-ink` opacity for every
 * status (the red/yellow/green legend lives only in the atlas).
 */
function FatigueBar({ percent }: { readonly percent: number }) {
  return (
    <span
      aria-hidden
      className="flex h-1.5 w-16 shrink-0 justify-end overflow-hidden rounded-full bg-hero-ink/20"
    >
      <span
        className="h-full rounded-full bg-hero-ink/60"
        style={{ width: `${percent}%` }}
      />
    </span>
  );
}

function RecoveryRowButton({
  row,
  recoverByDate,
  onOpenAtlas,
}: {
  readonly row: HeroRecoveryRow;
  readonly recoverByDate: Readonly<Record<string, string | null>>;
  readonly onOpenAtlas: (atlasId: string) => void;
}) {
  const caption = captionFor(row, recoverByDate);
  const pct = row.kind === "muscle" ? fatiguePercent(row.fatigue) : 0;
  return (
    <button
      type="button"
      onClick={() => onOpenAtlas(row.atlasId)}
      className="flex min-h-[44px] w-full items-center gap-3 rounded-xl px-1 py-1.5 text-left transition-[background-color,transform] active:scale-[0.99] hover:bg-white/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-hero-ink/60 focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
      aria-label={`${row.label}: ${caption.long}. Відкрити в атласі`}
    >
      <span className="min-w-0 shrink truncate text-style-label text-hero-ink">
        {row.label}
      </span>
      <span className="min-w-0 flex-1" />
      {row.kind === "muscle" && <FatigueBar percent={pct} />}
      <span className="shrink-0 text-style-caption text-hero-ink/80">
        {caption.short}
      </span>
    </button>
  );
}

/**
 * Порожній стан — новий користувач без жодного тренування. Ще один текст,
 * не шоста порожня смуга (рішення 1 — «фіксовані 6 великих груп завжди»
 * відкинуто).
 */
function EmptyBody() {
  return (
    <p className="mt-4 text-style-caption text-hero-ink/80">
      Тіло ще не має історії. Перше тренування покаже, що відновлюється.
    </p>
  );
}

export function HeroRecoveryBars({
  rows,
  recoverByDate,
  onOpenAtlas,
}: HeroRecoveryBarsProps) {
  if (rows.length === 0) return <EmptyBody />;
  return (
    <div
      // `role="group"` тут не косметика: на голому `div` без ролі
      // `aria-label` не експонується в accessibility tree взагалі, тож
      // підпис «Стан тіла» скрінрідер просто не озвучив би.
      role="group"
      className="mt-4 flex flex-col divide-y divide-hero-ink/10"
      aria-label="Стан тіла"
    >
      {rows.map((row) => (
        <RecoveryRowButton
          key={row.atlasId}
          row={row}
          recoverByDate={recoverByDate}
          onOpenAtlas={onOpenAtlas}
        />
      ))}
    </div>
  );
}
