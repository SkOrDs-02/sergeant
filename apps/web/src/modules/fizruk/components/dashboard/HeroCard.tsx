/**
 * Fizruk Dashboard — Hero card (web).
 *
 * Mirrors the mobile `apps/mobile/.../HeroCard.tsx` composition, adapted
 * to the web stack (Tailwind utilities, shared `Button` component, the
 * existing `bg-hero-teal` dashboard hero surface). Four mutually
 * exclusive states keep the hero informative instead of always
 * reading the same marketing slogan:
 *
 *   1. `active`   — a workout is open; surface the live elapsed timer
 *                   and a "Продовжити" CTA so the user can jump back
 *                   into the session without hunting for it in the
 *                   journal.
 *   2. `today`    — the monthly plan / active program schedules a
 *                   session for today; surface the template name,
 *                   exercise count, est. duration, and a primary
 *                   "Почати" CTA.
 *   3. `upcoming` — the next scheduled session falls in the lookahead
 *                   window but is not today; surface "За N днів",
 *                   the date, and a softer "Відкрити план" CTA.
 *   4. `empty`    — nothing scheduled; nudge the user toward a template
 *                   or the programs catalogue.
 *
 * State selection lives in the Dashboard page (it has all the inputs);
 * this component stays pure/presentational so it can be storybooked and
 * unit-tested in isolation.
 */

import { useEffect, useState, type ReactNode } from "react";

import { Button } from "@shared/components/ui/Button";
import { SectionHeading } from "@shared/components/ui/SectionHeading";

/**
 * Discriminated union for the four hero states. Keeping each state's
 * inputs explicit (instead of a single optional-everything props bag)
 * makes it impossible to render e.g. `elapsedSec` on a non-active card
 * or `daysFromNow` on the empty state.
 */
export type HeroCardState =
  | {
      readonly kind: "active";
      /**
       * ISO timestamp of `workout.startedAt`. The hero ticks a local
       * 1-second timer off of this so the rest of the Dashboard doesn't
       * re-render every second just to keep the elapsed counter live.
       */
      readonly startedAtIso: string;
      /** Optional count of exercises already logged in the session. */
      readonly itemsCount?: number | null;
    }
  | {
      readonly kind: "today";
      /** Template name (or program session name). */
      readonly label: string;
      /** Exercises in the session. */
      readonly exerciseCount: number;
      /** Heuristic duration estimate in minutes, or `null` to hide. */
      readonly estimatedMin?: number | null;
      /** Context line, e.g. "З місячного плану" or program name. */
      readonly hint?: string | null;
    }
  | {
      readonly kind: "upcoming";
      /** Template name of the next scheduled session. */
      readonly label: string;
      /** Days from today. `1` = tomorrow. */
      readonly daysFromNow: number;
      /** Local `YYYY-MM-DD` date key. */
      readonly dateKey: string;
      /** Exercises in the template, or `null` when catalogue doesn't know. */
      readonly exerciseCount: number | null;
    }
  | {
      readonly kind: "empty";
      /** When `true`, "Обрати шаблон" opens templates instead of plan. */
      readonly hasTemplates: boolean;
    };

export interface HeroCardProps {
  readonly state: HeroCardState;
  /** Localized greeting, e.g. "Доброго дня". */
  readonly greeting: string;
  /** Localized date label, e.g. "середа, 23 квітня". */
  readonly today: string;
  /** Invoked for the primary CTA on the `active` state. */
  readonly onResume: () => void;
  /** Invoked for the primary CTA on the `today` state. */
  readonly onStartToday: () => void;
  /** Invoked for the primary CTA on the `upcoming` state. */
  readonly onOpenPlan: () => void;
  /** Invoked for the empty state's "Обрати шаблон" CTA. */
  readonly onOpenTemplates: () => void;
  /** Invoked for the empty state's secondary "Програми" CTA. */
  readonly onOpenPrograms: () => void;
}

const HERO_CARD_CLASS =
  "rounded-3xl p-6 overflow-hidden bg-hero-teal dark:bg-panel dark:border dark:border-teal-800/30 dark:bg-[linear-gradient(135deg,rgba(20,184,166,0.18)_0%,rgba(20,184,166,0.05)_100%)]";

function formatElapsed(sec: number): string {
  if (!Number.isFinite(sec) || sec <= 0) return "0:00";
  const total = Math.floor(sec);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * Seconds between now and `startedAtIso`. Guarded so malformed ISO
 * strings (or a future-dated `startedAt` from clock skew) produce `0`
 * instead of NaN / negatives in the rendered "00:00".
 */
function diffSecFromNow(startedAtIso: string): number {
  const start = Date.parse(startedAtIso);
  if (!Number.isFinite(start)) return 0;
  const diffMs = Date.now() - start;
  if (!Number.isFinite(diffMs) || diffMs <= 0) return 0;
  return Math.floor(diffMs / 1000);
}

/**
 * Ticks a 1-second elapsed counter for the active-workout hero without
 * pulling the rest of the Dashboard into a 1Hz re-render loop. Returns
 * `0` on the server / before mount so SSR and first paint stay stable.
 */
function useElapsedSec(startedAtIso: string): number {
  const [sec, setSec] = useState<number>(() => diffSecFromNow(startedAtIso));
  useEffect(() => {
    setSec(diffSecFromNow(startedAtIso));
    const id = setInterval(() => {
      setSec(diffSecFromNow(startedAtIso));
    }, 1000);
    return () => {
      clearInterval(id);
    };
  }, [startedAtIso]);
  return sec;
}

function formatDateShort(dateKey: string): string {
  try {
    const d = new Date(`${dateKey}T12:00:00`);
    if (Number.isNaN(d.getTime())) return dateKey;
    return d.toLocaleDateString("uk-UA", { day: "numeric", month: "long" });
  } catch {
    return dateKey;
  }
}

/**
 * Ukrainian pluralization for "N днів / день / дні" etc. Mirrors the
 * mobile helper so identical dates render identically on both clients.
 */
function formatDaysAway(days: number): string {
  if (days === 0) return "Сьогодні";
  if (days === 1) return "Завтра";
  const mod100 = days % 100;
  const mod10 = days % 10;
  if (mod100 >= 11 && mod100 <= 14) return `За ${days} днів`;
  if (mod10 === 1) return `За ${days} день`;
  if (mod10 >= 2 && mod10 <= 4) return `За ${days} дні`;
  return `За ${days} днів`;
}

/**
 * Renders the `greeting · today` kicker. Shared across all states so
 * the top of the hero always anchors "when am I".
 */
function HeroKicker({
  greeting,
  today,
}: {
  readonly greeting: string;
  readonly today: string;
}) {
  return (
    <SectionHeading as="p" size="sm" variant="fizruk">
      {greeting} · {today}
    </SectionHeading>
  );
}

/**
 * Secondary eyebrow that labels each state ("Тренування триває", etc.)
 * Sits directly under the `HeroKicker` and uses the lighter `white/80`
 * ink so it reads as an overlay label on the teal hero background.
 */
function HeroStateLabel({ children }: { readonly children: ReactNode }) {
  return (
    <SectionHeading
      as="p"
      size="sm"
      className="mt-3 text-teal-800 dark:text-white/80"
    >
      {children}
    </SectionHeading>
  );
}

/**
 * "Play" icon that headlines the primary CTA. Inlined (rather than an
 * `Icon name="play"` call) so the hero stays self-contained and zero
 * extra import surfaces get dragged in.
 */
function PlayIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
    >
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}

function ActiveState({
  state,
  greeting,
  today,
  onResume,
}: {
  readonly state: Extract<HeroCardState, { kind: "active" }>;
  readonly greeting: string;
  readonly today: string;
  readonly onResume: () => void;
}) {
  const elapsedSec = useElapsedSec(state.startedAtIso);
  const meta =
    state.itemsCount != null && state.itemsCount > 0
      ? `${state.itemsCount} вправ у сесії`
      : "Сесія відкрита — підходи й таймер чекають";
  return (
    <section className={HERO_CARD_CLASS} aria-label="Активне тренування">
      <HeroKicker greeting={greeting} today={today} />
      <HeroStateLabel>Тренування триває</HeroStateLabel>
      <p
        className="mt-1 text-hero font-black text-teal-900 dark:text-white leading-none tabular-nums"
        aria-live="polite"
        aria-label={`Час тренування ${formatElapsed(elapsedSec)}`}
      >
        {formatElapsed(elapsedSec)}
      </p>
      <p className="mt-2 text-sm text-teal-700 dark:text-white/75">{meta}</p>
      <div className="mt-6">
        <button
          type="button"
          className="w-full py-4 px-5 rounded-2xl bg-fizruk-strong text-white transition-[background-color,box-shadow,opacity,transform] active:scale-[0.98] flex items-center gap-3 text-left"
          onClick={onResume}
          aria-label="Повернутись до активного тренування"
        >
          <span
            className="shrink-0 w-11 h-11 rounded-full bg-white/15 flex items-center justify-center"
            aria-hidden
          >
            <PlayIcon />
          </span>
          <span className="min-w-0 flex-1">
            <SectionHeading as="span" size="xs" className="block text-white/70">
              Продовжити
            </SectionHeading>
            <span className="block text-base font-black leading-tight">
              Повернутись у сесію
            </span>
          </span>
        </button>
      </div>
    </section>
  );
}

function TodayState({
  state,
  greeting,
  today,
  onStartToday,
}: {
  readonly state: Extract<HeroCardState, { kind: "today" }>;
  readonly greeting: string;
  readonly today: string;
  readonly onStartToday: () => void;
}) {
  const metaParts: string[] = [`${state.exerciseCount} вправ`];
  if (state.estimatedMin) metaParts.push(`~${state.estimatedMin} хв`);
  if (state.hint) metaParts.push(state.hint);
  return (
    <section className={HERO_CARD_CLASS} aria-label="Сьогоднішнє тренування">
      <HeroKicker greeting={greeting} today={today} />
      <HeroStateLabel>Сьогоднішнє тренування</HeroStateLabel>
      <h1 className="text-hero font-black text-teal-900 dark:text-white mt-1 leading-tight truncate">
        {state.label}
      </h1>
      <p className="mt-2 text-sm text-teal-700 dark:text-white/75 truncate">
        {metaParts.join(" · ")}
      </p>
      <div className="mt-6">
        <button
          type="button"
          className="w-full py-4 px-5 rounded-2xl bg-fizruk-strong text-white transition-[background-color,box-shadow,opacity,transform] active:scale-[0.98] flex items-center gap-3 text-left"
          onClick={onStartToday}
          aria-label={`Почати тренування: ${state.label}`}
        >
          <span
            className="shrink-0 w-11 h-11 rounded-full bg-white/15 flex items-center justify-center"
            aria-hidden
          >
            <PlayIcon />
          </span>
          <span className="min-w-0 flex-1">
            <SectionHeading as="span" size="xs" className="block text-white/70">
              Почати
            </SectionHeading>
            <span className="block text-base font-black truncate leading-tight">
              {state.label}
            </span>
          </span>
        </button>
      </div>
    </section>
  );
}

function UpcomingState({
  state,
  greeting,
  today,
  onOpenPlan,
}: {
  readonly state: Extract<HeroCardState, { kind: "upcoming" }>;
  readonly greeting: string;
  readonly today: string;
  readonly onOpenPlan: () => void;
}) {
  const metaParts: string[] = [
    formatDaysAway(state.daysFromNow),
    formatDateShort(state.dateKey),
  ];
  if (state.exerciseCount != null && state.exerciseCount > 0) {
    metaParts.push(`${state.exerciseCount} вправ`);
  }
  return (
    <section className={HERO_CARD_CLASS} aria-label="Наступне тренування">
      <HeroKicker greeting={greeting} today={today} />
      <HeroStateLabel>Наступне тренування</HeroStateLabel>
      <h1 className="text-hero font-black text-teal-900 dark:text-white mt-1 leading-tight truncate">
        {state.label}
      </h1>
      <p className="mt-2 text-sm text-teal-700 dark:text-white/75 truncate">
        {metaParts.join(" · ")}
      </p>
      <div className="mt-6">
        <Button
          variant="fizruk-soft"
          className="w-full h-12 min-h-[44px]"
          onClick={onOpenPlan}
          aria-label="Відкрити план тренувань"
        >
          Відкрити план
        </Button>
      </div>
    </section>
  );
}

function EmptyState({
  state,
  greeting,
  today,
  onOpenTemplates,
  onOpenPrograms,
}: {
  readonly state: Extract<HeroCardState, { kind: "empty" }>;
  readonly greeting: string;
  readonly today: string;
  readonly onOpenTemplates: () => void;
  readonly onOpenPrograms: () => void;
}) {
  const primaryLabel = state.hasTemplates ? "Обрати шаблон" : "Створити шаблон";
  return (
    <section className={HERO_CARD_CLASS} aria-label="План на сьогодні порожній">
      <HeroKicker greeting={greeting} today={today} />
      <HeroStateLabel>План порожній</HeroStateLabel>
      <h1 className="text-hero font-black text-teal-900 dark:text-white mt-1 leading-tight">
        Обери шаблон або <br />
        заплануй день
      </h1>
      <p className="mt-2 text-sm text-teal-700 dark:text-white/75">
        {state.hasTemplates
          ? "Нічого не заплановано — запусти готовий шаблон або відкрий програми."
          : "У тебе ще немає шаблонів. Створи свій перший або обери програму."}
      </p>
      <div className="mt-6 flex flex-col gap-3">
        {/*
          Primary CTA uses the raw `bg-fizruk-strong` surface (teal-600,
          #0d9488) rather than the `variant="fizruk"` default (teal-500,
          #14b8a6). The latter ships contrast 2.48:1 against white text —
          below WCAG AA — and so the axe-core check flags it. teal-600 +
          white clears 4.5:1 comfortably.
        */}
        <button
          type="button"
          className="w-full py-4 rounded-full font-bold text-base bg-fizruk-strong text-white transition-[background-color,box-shadow,opacity,transform] active:scale-[0.98]"
          onClick={onOpenTemplates}
        >
          {primaryLabel}
        </button>
        <Button
          variant="fizruk-soft"
          className="w-full h-12 min-h-[44px]"
          onClick={onOpenPrograms}
        >
          До програм
        </Button>
      </div>
    </section>
  );
}

/**
 * The Dashboard hero. State-driven (see `HeroCardState`) — callers
 * compute the state from their hooks and pass one of four shapes; the
 * component renders the right layout.
 */
export function HeroCard(props: HeroCardProps) {
  const { state, greeting, today } = props;
  switch (state.kind) {
    case "active":
      return (
        <ActiveState
          state={state}
          greeting={greeting}
          today={today}
          onResume={props.onResume}
        />
      );
    case "today":
      return (
        <TodayState
          state={state}
          greeting={greeting}
          today={today}
          onStartToday={props.onStartToday}
        />
      );
    case "upcoming":
      return (
        <UpcomingState
          state={state}
          greeting={greeting}
          today={today}
          onOpenPlan={props.onOpenPlan}
        />
      );
    case "empty":
      return (
        <EmptyState
          state={state}
          greeting={greeting}
          today={today}
          onOpenTemplates={props.onOpenTemplates}
          onOpenPrograms={props.onOpenPrograms}
        />
      );
  }
}
