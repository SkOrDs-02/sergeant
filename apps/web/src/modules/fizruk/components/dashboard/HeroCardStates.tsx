/**
 * Fizruk Dashboard — Hero card state renderers (web).
 *
 * Split out of `HeroCard.tsx` to stay under Hard Rule #18's 600-line cap
 * once the hero-kicker (серія/тиждень, спека рішення 3) and the recovery
 * bars (`HeroRecoveryBars.tsx`, спека рішення 1/5) landed alongside the
 * four existing states. `HeroCard.tsx` keeps the public type/props surface
 * and the state-selection switch; this file owns each state's own layout.
 */

import { useEffect, useRef, useState, type ReactNode } from "react";

import { pluralDays, pluralExercises, pluralUa } from "@sergeant/shared";
import type { HeroRecoveryRow } from "@sergeant/fizruk-domain";
import { Button } from "@shared/components/ui/Button";
import { Card } from "@shared/components/ui/Card";
import { SectionHeading } from "@shared/components/ui/SectionHeading";
import { useAnnounce } from "@shared/components/ui/ScreenReaderAnnouncer";
import { HeroRecoveryBars } from "./HeroRecoveryBars";
import type { HeroCardState } from "./HeroCard";

/**
 * Phase 2.3 v2 redesign (C4): chrome тепер через `<Card prominence="hero"
 * module="fizruk">` + decorative `--hero-grad-fizruk` wash overlay.
 * Замінив рукописний `bg-hero-teal` + dark gradient на orthogonal Card
 * primitive — module identity та dark-mode parity тепер тримаються
 * через `MODULE_PROMINENCE.fizruk.hero` у `Card.tsx`, без дублювання
 * gradient-літералів у feature-коді.
 */
function HeroShell({
  ariaLabel,
  children,
  cornerSlot,
}: {
  readonly ariaLabel: string;
  readonly children: ReactNode;
  readonly cornerSlot?: ReactNode;
}) {
  return (
    <Card
      as="section"
      prominence="hero"
      module="fizruk"
      edge="rule"
      padding="none"
      className="relative overflow-hidden"
      aria-label={ariaLabel}
    >
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{
          background: "var(--hero-grad-fizruk)",
          opacity: 0.08,
        }}
      />
      <div className="relative p-6">{children}</div>
      {cornerSlot}
    </Card>
  );
}

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
  const [prevStartedAtIso, setPrevStartedAtIso] = useState(startedAtIso);
  if (startedAtIso !== prevStartedAtIso) {
    setPrevStartedAtIso(startedAtIso);
    setSec(diffSecFromNow(startedAtIso));
  }
  useEffect(() => {
    const id = setInterval(() => {
      setSec(diffSecFromNow(startedAtIso));
    }, 1000);
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        setSec(diffSecFromNow(startedAtIso));
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisibility);
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

function formatDaysAway(days: number): string {
  if (days === 0) return "Сьогодні";
  if (days === 1) return "Завтра";
  return `За ${days} ${pluralDays(days)}`;
}

/** Shared kicker inputs — bundled so every state threads one prop, not three. */
export interface HeroKickerInfo {
  /** Localized date label, e.g. "середа, 23 квітня". */
  readonly today: string;
  readonly streakWeeks: number;
  readonly weeklyWorkoutsCount: number;
}

/** Shared "стан тіла" bars inputs — forwarded as-is to `HeroRecoveryBars`. */
export interface HeroBodyInfo {
  readonly recoveryRows: readonly HeroRecoveryRow[];
  readonly recoverByDate: Readonly<Record<string, string | null>>;
  readonly onOpenAtlas: (atlasId: string) => void;
}

/**
 * Renders the `<день тижня, дата> · серія N тижн. · M тренувань` kicker.
 * Shared across all states so the top of the hero always anchors "when am
 * I" — and, since the three-tile streak/week strip that used to render
 * below the hero is gone (спека рішення 3), now also carries that
 * streak/week readout. `greeting` dropped intentionally: the demo mock and
 * click-through checklist both show the kicker as `<дата> · серія N тижн. ·
 * M тренувань`, no separate time-of-day greeting segment.
 */
function HeroKicker({
  today,
  streakWeeks,
  weeklyWorkoutsCount,
}: HeroKickerInfo) {
  const workoutsLabel = pluralUa(weeklyWorkoutsCount, {
    one: "тренування",
    few: "тренування",
    many: "тренувань",
  });
  return (
    // «Чорнило» v3.1 § 3: overrides the light `text-fizruk-strong` (now
    // invisible on the saturated hero gradient) with hero-ink;
    // `dark:text-fizruk-300/70` already reads fine on the dark hero.
    <SectionHeading as="p" size="xs" variant="fizruk" className="text-hero-ink">
      {today} · серія {streakWeeks} тижн. · {weeklyWorkoutsCount}{" "}
      {workoutsLabel}
    </SectionHeading>
  );
}

/**
 * Secondary eyebrow that labels each state ("Тренування триває", etc.)
 * Sits directly under the `HeroKicker` and uses the theme-invariant
 * `hero-ink/80` so it reads as an overlay label on the saturated fizruk
 * hero gradient («Чорнило» v3.1 § 3 — same treatment in both themes).
 */
function HeroStateLabel({ children }: { readonly children: ReactNode }) {
  return (
    <SectionHeading as="p" size="xs" className="mt-3 text-hero-ink">
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

export function ActiveState({
  state,
  kicker,
  onResume,
  cornerSlot,
}: {
  readonly state: Extract<HeroCardState, { kind: "active" }>;
  readonly kicker: HeroKickerInfo;
  readonly onResume: () => void;
  readonly cornerSlot?: ReactNode;
}) {
  const elapsedSec = useElapsedSec(state.startedAtIso);
  const { announce } = useAnnounce();
  const hasAnnouncedStartRef = useRef(false);
  // A11y (fixed 2026-08-08): this used to be `aria-live="polite"` plus an
  // `aria-label` embedding `elapsedSec` — i.e. a label that changes every
  // second inside a live region, so a screen reader read the elapsed
  // duration out loud continuously for the whole active session. The
  // visible digits still tick every second for sighted users; a screen
  // reader only needs the duration once, at the moment the card first
  // shows the active session (mount-only announce, deliberately `[]`
  // deps — see `RestTimerOverlay.tsx` for the same pattern).
  useEffect(() => {
    if (hasAnnouncedStartRef.current) return;
    hasAnnouncedStartRef.current = true;
    announce(`Тренування триває, ${formatElapsed(elapsedSec)}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only announce, see comment above.
  }, []);
  const meta =
    state.itemsCount != null && state.itemsCount > 0
      ? `${state.itemsCount} ${pluralExercises(state.itemsCount)} у сесії`
      : "Сесія відкрита, підходи й таймер чекають";
  return (
    <HeroShell ariaLabel="Активне тренування" cornerSlot={cornerSlot}>
      <HeroKicker {...kicker} />
      <HeroStateLabel>Тренування триває</HeroStateLabel>
      <p
        className="mt-1 text-hero font-black text-hero-ink leading-none tabular-nums"
        role="timer"
        aria-label="Тривалість активного тренування"
      >
        {formatElapsed(elapsedSec)}
      </p>
      <p className="mt-2 text-style-caption text-hero-ink">{meta}</p>
      <div className="mt-6">
        <button
          type="button"
          className="w-full py-4 px-5 rounded-2xl bg-fizruk-strong text-white transition-[background-color,box-shadow,opacity,transform] active:scale-[0.98] flex items-center gap-3 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-focus/45 focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
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
            <span className="block text-style-title leading-tight">
              Повернутись у сесію
            </span>
          </span>
        </button>
      </div>
    </HeroShell>
  );
}

export function TodayState({
  state,
  kicker,
  body,
  onStartToday,
  cornerSlot,
}: {
  readonly state: Extract<HeroCardState, { kind: "today" }>;
  readonly kicker: HeroKickerInfo;
  readonly body: HeroBodyInfo;
  readonly onStartToday: () => void;
  readonly cornerSlot?: ReactNode;
}) {
  const metaParts: string[] = [
    `${state.exerciseCount} ${pluralExercises(state.exerciseCount)}`,
  ];
  if (state.estimatedMin) metaParts.push(`~${state.estimatedMin} хв`);
  if (state.hint) metaParts.push(state.hint);
  return (
    <HeroShell ariaLabel="Сьогоднішнє тренування" cornerSlot={cornerSlot}>
      <HeroKicker {...kicker} />
      {/*
        Назви шаблону тут навмисно НЕМАЄ окремим заголовком: вона стоїть у
        CTA нижче («Почати · Ноги і спина»), і другий раз на тому самому
        екрані була б дублем. Hero тепер відповідає на «що з тілом», а не
        «що в розкладі» (спека § Проблема), тож смуги йдуть одразу під
        кікером, а обсяг тренування лишається одним рядком-підписом.
      */}
      <p className="mt-2 text-style-caption text-hero-ink truncate">
        {metaParts.join(" · ")}
      </p>
      <HeroRecoveryBars
        rows={body.recoveryRows}
        recoverByDate={body.recoverByDate}
        onOpenAtlas={body.onOpenAtlas}
      />
      <div className="mt-6">
        <button
          type="button"
          className="w-full py-4 px-5 rounded-2xl bg-fizruk-strong text-white transition-[background-color,box-shadow,opacity,transform] active:scale-[0.98] flex items-center gap-3 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-focus/45 focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
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
            <span className="block text-style-title truncate leading-tight">
              {state.label}
            </span>
          </span>
        </button>
      </div>
    </HeroShell>
  );
}

export function UpcomingState({
  state,
  kicker,
  body,
  onOpenPlan,
  cornerSlot,
}: {
  readonly state: Extract<HeroCardState, { kind: "upcoming" }>;
  readonly kicker: HeroKickerInfo;
  readonly body: HeroBodyInfo;
  readonly onOpenPlan: () => void;
  readonly cornerSlot?: ReactNode;
}) {
  // Назва шаблону йде першою в мета-рядок, а не окремим заголовком: на
  // відміну від стану `today`, тутешній CTA («Відкрити план») її не несе,
  // тож без цього рядка вона зникла б з екрана зовсім.
  const metaParts: string[] = [
    state.label,
    formatDaysAway(state.daysFromNow),
    formatDateShort(state.dateKey),
  ];
  if (state.exerciseCount != null && state.exerciseCount > 0) {
    metaParts.push(
      `${state.exerciseCount} ${pluralExercises(state.exerciseCount)}`,
    );
  }
  return (
    <HeroShell ariaLabel="Наступне тренування" cornerSlot={cornerSlot}>
      <HeroKicker {...kicker} />
      <p className="mt-2 text-style-caption text-hero-ink truncate">
        {metaParts.join(" · ")}
      </p>
      <HeroRecoveryBars
        rows={body.recoveryRows}
        recoverByDate={body.recoverByDate}
        onOpenAtlas={body.onOpenAtlas}
      />
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
    </HeroShell>
  );
}

export function EmptyState({
  state,
  kicker,
  body,
  onOpenTemplates,
  onOpenPrograms,
  cornerSlot,
}: {
  readonly state: Extract<HeroCardState, { kind: "empty" }>;
  readonly kicker: HeroKickerInfo;
  readonly body: HeroBodyInfo;
  readonly onOpenTemplates: () => void;
  readonly onOpenPrograms: () => void;
  readonly cornerSlot?: ReactNode;
}) {
  const primaryLabel = state.hasTemplates ? "Обрати шаблон" : "Створити шаблон";
  return (
    <HeroShell ariaLabel="План на сьогодні порожній" cornerSlot={cornerSlot}>
      <HeroKicker {...kicker} />
      <HeroStateLabel>План порожній</HeroStateLabel>
      <h2 className="text-hero font-black text-hero-ink mt-1 leading-tight text-balance">
        Обери шаблон або заплануй день
      </h2>
      <p className="mt-2 text-style-caption text-hero-ink">
        {state.hasTemplates
          ? "Нічого не заплановано, запусти готовий шаблон або відкрий програми."
          : "У тебе ще немає шаблонів. Створи свій перший або обери програму."}
      </p>
      <HeroRecoveryBars
        rows={body.recoveryRows}
        recoverByDate={body.recoverByDate}
        onOpenAtlas={body.onOpenAtlas}
      />
      <div className="mt-6 flex flex-col gap-3">
        {/*
          Primary CTA uses the raw `bg-fizruk-strong` surface (cyan-800,
          #155e75) rather than the `variant="fizruk"` default (cyan-700,
          #0e7490). The latter ships contrast 2.48:1 against white text —
          below WCAG AA — and so the axe-core check flags it. cyan-800 +
          white clears 4.5:1 comfortably.
        */}
        <button
          type="button"
          className="w-full py-4 rounded-full font-bold text-base bg-fizruk-strong text-white transition-[background-color,box-shadow,opacity,transform] active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-focus/45 focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
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
    </HeroShell>
  );
}
