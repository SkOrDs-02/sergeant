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
import { messages } from "@shared/i18n/uk";
import { useAnnounce } from "@shared/components/ui/ScreenReaderAnnouncer";
import { HeroRecoveryBars } from "./HeroRecoveryBars";
import type { HeroCardState } from "./HeroCard";
import { formatDayMonth } from "@shared/lib/time/formatDate";

/** Мова H: один тинтований блок із даними, порожній план нейтральний. */
function HeroShell({
  ariaLabel,
  children,
  cornerSlot,
  tinted = true,
}: {
  readonly ariaLabel: string;
  readonly children: ReactNode;
  readonly cornerSlot?: ReactNode;
  readonly tinted?: boolean;
}) {
  return (
    <Card
      as="section"
      prominence={tinted ? "hero" : "panel"}
      tone="fizruk"
      aria-label={ariaLabel}
      className="space-y-3"
    >
      {children}
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

/**
 * День-ключ → «13 вересня». Раніше ця функція звалась `formatDateShort` — тобто
 * ІМЕНЕМ канонічного експорту, але з іншою семантикою (`month:"long"` без
 * року проти `month:"short"`). Канонічний імпорт у цей файл затінився б нею
 * мовчки, тож ім'я змінено на те, що описує фактичний формат.
 *
 * Обгортка лишається заради фолбеку на сирий ключ: на невалідній даті
 * `formatDayMonth` дає порожній рядок, а тут потрібен хоч якийсь підпис.
 */
function formatDayMonthFromKey(dateKey: string): string {
  const d = new Date(`${dateKey}T12:00:00`);
  return formatDayMonth(d) || dateKey;
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
 * Renders the `<день тижня, дата> · серія N тижнів · M тренувань` kicker
 * (zero segments are dropped, so a first-run hero shows just the date).
 * Shared across all states so the top of the hero always anchors "when am
 * I" — and, since the three-tile streak/week strip that used to render
 * below the hero is gone (спека рішення 3), now also carries that
 * streak/week readout. `greeting` dropped intentionally: the demo mock and
 * click-through checklist both show the kicker as `<дата> · серія N тижнів ·
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
  const weeksLabel = pluralUa(streakWeeks, {
    one: "тиждень",
    few: "тижні",
    many: "тижнів",
  });
  // Нулі не показуємо: «серія 0 тижн. · 0 тренувань» поруч із порожнім
  // планом: рівно те, що принцип «порожній стан, не нулі» (#17) прибирає.
  const parts = [
    today,
    streakWeeks > 0 ? `серія ${streakWeeks} ${weeksLabel}` : null,
    weeklyWorkoutsCount > 0 ? `${weeklyWorkoutsCount} ${workoutsLabel}` : null,
  ].filter(Boolean);
  return <p className="text-style-body text-muted">{parts.join(" · ")}</p>;
}

function HeroStateLabel({ children }: { readonly children: ReactNode }) {
  return (
    <p className="text-style-overline text-fizruk-tint-label">{children}</p>
  );
}

/**
 * Без власної кнопки «Продовжити»: під час активного тренування ту саму дію
 * вже несе кнопка в куті модуля, а дві однакові дії на екрані сперечались
 * за головну (інвентар v3.1, Б3).
 */
export function ActiveState({
  state,
  kicker,
  cornerSlot,
}: {
  readonly state: Extract<HeroCardState, { kind: "active" }>;
  readonly kicker: HeroKickerInfo;
  readonly cornerSlot?: ReactNode;
}) {
  const elapsedSec = useElapsedSec(state.startedAtIso);
  const { announce } = useAnnounce();
  const hasAnnouncedStartRef = useRef(false);
  useEffect(() => {
    if (hasAnnouncedStartRef.current) return;
    hasAnnouncedStartRef.current = true;
    announce(
      `${messages.fizruk.hero.activeLabel}, ${formatElapsed(elapsedSec)}`,
    );
  }, [announce, elapsedSec]);
  return (
    <HeroShell ariaLabel="Активне тренування" cornerSlot={cornerSlot}>
      <HeroKicker {...kicker} />
      <HeroStateLabel>{messages.fizruk.hero.activeLabel}</HeroStateLabel>
      <p
        className="text-style-display font-bold text-text tabular-nums"
        role="timer"
        aria-label="Тривалість активного тренування"
      >
        {formatElapsed(elapsedSec)}
      </p>
      <p className="text-style-body text-muted">
        {state.itemsCount != null && state.itemsCount > 0
          ? `${state.itemsCount} ${pluralExercises(state.itemsCount)} у сесії`
          : messages.fizruk.hero.openSession}
      </p>
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
  const metaParts = [
    `${state.exerciseCount} ${pluralExercises(state.exerciseCount)}`,
  ];
  if (state.estimatedMin) metaParts.push(`~${state.estimatedMin}\u202Fхв`);
  if (state.hint) metaParts.push(state.hint);
  return (
    <HeroShell ariaLabel="Сьогоднішнє тренування" cornerSlot={cornerSlot}>
      <HeroKicker {...kicker} />
      <HeroStateLabel>{messages.fizruk.hero.recovery}</HeroStateLabel>
      <HeroRecoveryBars
        rows={body.recoveryRows}
        recoverByDate={body.recoverByDate}
        onOpenAtlas={body.onOpenAtlas}
      />
      <p className="text-style-body text-muted">{metaParts.join(" · ")}</p>
      <Button
        variant="outline"
        tone="neutral"
        onClick={onStartToday}
        aria-label={`Почати тренування: ${state.label}`}
      >
        {messages.fizruk.hero.start} · {state.label}
      </Button>
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
  const metaParts = [
    state.label,
    formatDaysAway(state.daysFromNow),
    formatDayMonthFromKey(state.dateKey),
  ];
  if (state.exerciseCount != null && state.exerciseCount > 0)
    metaParts.push(
      `${state.exerciseCount} ${pluralExercises(state.exerciseCount)}`,
    );
  return (
    <HeroShell ariaLabel="Наступне тренування" cornerSlot={cornerSlot}>
      <HeroKicker {...kicker} />
      <HeroStateLabel>{messages.fizruk.hero.recovery}</HeroStateLabel>
      <HeroRecoveryBars
        rows={body.recoveryRows}
        recoverByDate={body.recoverByDate}
        onOpenAtlas={body.onOpenAtlas}
      />
      <p className="text-style-body text-muted">{metaParts.join(" · ")}</p>
      <Button
        variant="outline"
        tone="neutral"
        onClick={onOpenPlan}
        aria-label="Відкрити план тренувань"
      >
        {messages.fizruk.hero.openPlan}
      </Button>
    </HeroShell>
  );
}

export function EmptyState({
  state,
  kicker,
  body,
  onOpenTemplates,
  onOpenPrograms,
  onQuickStart,
  cornerSlot,
}: {
  readonly state: Extract<HeroCardState, { kind: "empty" }>;
  readonly kicker: HeroKickerInfo;
  readonly body: HeroBodyInfo;
  readonly onOpenTemplates: () => void;
  readonly onOpenPrograms: () => void;
  readonly onQuickStart?: (() => void) | undefined;
  readonly cornerSlot?: ReactNode;
}) {
  const templatesLabel = state.hasTemplates
    ? messages.fizruk.hero.chooseTemplate
    : messages.fizruk.hero.createTemplate;
  return (
    <HeroShell
      ariaLabel="План на сьогодні порожній"
      cornerSlot={cornerSlot}
      tinted={body.recoveryRows.length > 0}
    >
      <HeroKicker {...kicker} />
      <h2 className="text-style-title font-bold text-text">
        {messages.fizruk.hero.noPlan}
      </h2>
      <HeroRecoveryBars
        rows={body.recoveryRows}
        recoverByDate={body.recoverByDate}
        onOpenAtlas={body.onOpenAtlas}
      />
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          tone="neutral"
          onClick={onQuickStart ?? onOpenTemplates}
        >
          {onQuickStart ? messages.fizruk.hero.quickStart : templatesLabel}
        </Button>
        {onQuickStart && (
          <Button variant="outline" tone="neutral" onClick={onOpenTemplates}>
            {templatesLabel}
          </Button>
        )}
        <Button variant="outline" tone="neutral" onClick={onOpenPrograms}>
          {messages.fizruk.hero.programs}
        </Button>
      </div>
    </HeroShell>
  );
}
