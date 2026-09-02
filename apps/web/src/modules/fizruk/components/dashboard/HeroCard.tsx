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
 *
 * Спека `docs/90-work/planning/specs/fizruk-hero-recovery-bars.md` added a
 * fifth cross-cutting concern in `today` / `upcoming` / `empty` (never
 * `active` — рішення 2): up to six "стан тіла" rows under the kicker
 * (`HeroRecoveryBars.tsx`), and folded the streak/week readout that used to
 * live in its own three-tile strip below the hero into the kicker itself
 * (`HeroKicker` in `HeroCardStates.tsx`).
 * The four state layouts + their shared chrome (`HeroShell`, `HeroKicker`,
 * timer helpers, …) live in `HeroCardStates.tsx` — this file only keeps the
 * public type surface and the state-selection switch, to stay under Hard
 * Rule #18's 600-line cap.
 */

import type { ReactNode } from "react";

import type { HeroRecoveryRow } from "@sergeant/fizruk-domain";
import {
  ActiveState,
  EmptyState,
  TodayState,
  UpcomingState,
  type HeroBodyInfo,
  type HeroKickerInfo,
} from "./HeroCardStates";

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
  /** Localized date label, e.g. "середа, 23 квітня". */
  readonly today: string;
  /**
   * Kicker streak/week readout (спека рішення 3 — заміняє тристрічковий
   * тайл-рядок, знятий разом із цим hero). Канон §7: `streakDays` тут
   * навмисно немає — стрік лише тижневий.
   */
  readonly streakWeeks: number;
  /** Тренувань цього тижня — те саме поле, що раніше рендерив тайл-рядок. */
  readonly weeklyWorkoutsCount: number;
  /**
   * До шести рядків «стан тіла» (рішення 1/5) — рендеряться в станах
   * `today` / `upcoming` / `empty`, відсутні в `active`. Порожній масив
   * рендерить порожній-тіла текст замість смуг.
   */
  readonly recoveryRows: readonly HeroRecoveryRow[];
  /** Domain `MuscleState.id` → forecast full-recovery date key, для `red`-підписів. */
  readonly recoverByDate: Readonly<Record<string, string | null>>;
  /** Тап по рядку групи → відкрити атлас, сфокусований на цій групі (рішення 4). */
  readonly onOpenAtlas: (atlasId: string) => void;
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
  /**
   * Optional top-right slot — Phase 6.7 mounts the persistent PR badge
   * here. Positioned by the slot itself (`absolute top-3 right-3`); the
   * shell only provides the relative wrapper. Pass `null` to keep the
   * corner empty.
   */
  readonly cornerSlot?: ReactNode;
}

/**
 * The Dashboard hero. State-driven (see `HeroCardState`) — callers
 * compute the state from their hooks and pass one of four shapes; the
 * component renders the right layout.
 */
export function HeroCard(props: HeroCardProps) {
  const {
    state,
    today,
    streakWeeks,
    weeklyWorkoutsCount,
    recoveryRows,
    recoverByDate,
    onOpenAtlas,
    cornerSlot,
  } = props;
  const kicker: HeroKickerInfo = { today, streakWeeks, weeklyWorkoutsCount };
  const body: HeroBodyInfo = { recoveryRows, recoverByDate, onOpenAtlas };
  switch (state.kind) {
    case "active":
      return (
        <ActiveState
          state={state}
          kicker={kicker}
          onResume={props.onResume}
          cornerSlot={cornerSlot}
        />
      );
    case "today":
      return (
        <TodayState
          state={state}
          kicker={kicker}
          body={body}
          onStartToday={props.onStartToday}
          cornerSlot={cornerSlot}
        />
      );
    case "upcoming":
      return (
        <UpcomingState
          state={state}
          kicker={kicker}
          body={body}
          onOpenPlan={props.onOpenPlan}
          cornerSlot={cornerSlot}
        />
      );
    case "empty":
      return (
        <EmptyState
          state={state}
          kicker={kicker}
          body={body}
          onOpenTemplates={props.onOpenTemplates}
          onOpenPrograms={props.onOpenPrograms}
          cornerSlot={cornerSlot}
        />
      );
  }
}
