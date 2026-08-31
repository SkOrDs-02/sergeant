/**
 * Last validated: 2026-05-14
 * Status: Active
 */
import { useState } from "react";
import { SectionHeading } from "@shared/components/ui/SectionHeading";
import { Button } from "@shared/components/ui/Button";
import { messages } from "@shared/i18n/uk";
import { cn } from "@shared/lib/ui/cn";
import { captureException } from "../../../core/observability/sentry";
import { useExerciseCatalog } from "../hooks/useExerciseCatalog";
import {
  BUILTIN_PROGRAMS,
  weekdayIndex,
  type FizrukData,
  type ProgramScheduleEntry,
  type ProgramSessionDef,
  type TrainingProgramDef,
} from "@sergeant/fizruk-domain";

type RawExerciseDef = FizrukData.RawExerciseDef;

const DAY_LABELS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Нд"];

interface ProgramsProps {
  onStartWorkout?: (
    session: ProgramSessionDef,
    prog: TrainingProgramDef,
  ) => void;
  activeProgramId: string | null;
  activeProgram: TrainingProgramDef | null;
  activateProgram: (id: string) => void;
  deactivateProgram: () => void;
}

export function Programs({
  onStartWorkout,
  activeProgramId,
  activeProgram,
  activateProgram,
  deactivateProgram,
}: ProgramsProps) {
  const { exercises } = useExerciseCatalog();
  const [expandedProgram, setExpandedProgram] = useState<string | null>(null);

  // Monday-anchored "today" index in DEVICE-local time (ADR-0078): the
  // personal day boundary belongs to the user's own clock, not Kyiv — same
  // regime the rest of fizruk (Body, Measurements, monthly plan) already
  // uses. A Kyiv-anchored index used to disagree with the device near
  // midnight, so "Розпочати сьогодні" could open the wrong day's session.
  // `weekdayIndex()` is the canonical fizruk-domain helper (already wired
  // into the mobile Programs screen) — no local re-implementation.
  const todayDayIndex = weekdayIndex();

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-4xl mx-auto px-4 pt-4 page-tabbar-pad space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-style-title text-text">
              {messages.fizruk.programs.title}
            </h1>
            <p className="text-style-caption text-subtle mt-0.5">
              {activeProgram
                ? `${messages.fizruk.programs.activeProgramPrefix} ${activeProgram.name}`
                : messages.fizruk.programs.subtitleDefault}
            </p>
          </div>
          {activeProgram && (
            <Button
              variant="secondary"
              size="sm"
              onClick={deactivateProgram}
              className="text-style-caption text-subtle hover:text-text"
            >
              {messages.fizruk.programs.stop}
            </Button>
          )}
        </div>

        <div className="space-y-3">
          {BUILTIN_PROGRAMS.map((prog: TrainingProgramDef) => {
            const isActive = activeProgramId === prog.id;
            const isExpanded = expandedProgram === prog.id;
            const todaySession = prog.schedule.find(
              (s: ProgramScheduleEntry) => s.day - 1 === todayDayIndex,
            );
            // WCAG 1.3.1: gives the `aria-expanded` toggle below an
            // `aria-controls` target so the disclosed region is
            // programmatically tied to it, not just visually adjacent.
            const detailsId = `program-details-${prog.id}`;

            return (
              <div
                key={prog.id}
                className={cn(
                  "bg-panel border rounded-2xl shadow-card overflow-hidden transition-[background-color,border-color,box-shadow,opacity]",
                  isActive ? "border-success/60" : "border-line",
                )}
              >
                <div className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h2 className="text-style-label text-text">
                          {prog.name}
                        </h2>
                        {isActive && (
                          <span className="text-style-caption font-bold px-2 py-0.5 rounded-full bg-success/15 text-success-strong dark:text-success border border-success/25">
                            {messages.fizruk.programs.active}
                          </span>
                        )}
                        <span className="text-style-caption text-subtle border border-line rounded-full px-2 py-0.5">
                          {prog.days}{" "}
                          {messages.fizruk.programs.daysPerWeekSuffix}
                        </span>
                      </div>
                      <p className="text-style-caption text-subtle mt-1.5 leading-relaxed">
                        {prog.description}
                      </p>
                    </div>
                  </div>

                  <div
                    className="flex items-center gap-1.5 mt-3"
                    role="img"
                    aria-label={`${messages.fizruk.programs.scheduleAriaPrefix} ${prog.name}: ${prog.schedule
                      .map((s: ProgramScheduleEntry) => DAY_LABELS[s.day - 1])
                      .filter(Boolean)
                      .join(
                        ", ",
                      )} ${messages.fizruk.programs.scheduleAriaSuffix}`}
                  >
                    {Array.from({ length: 7 }, (_, i) => {
                      const hasSession = prog.schedule.some(
                        (s: ProgramScheduleEntry) => s.day - 1 === i,
                      );
                      const isToday = i === todayDayIndex;
                      return (
                        <div
                          key={i}
                          className={cn(
                            // CONTROL tier (12px) — `rounded` (4px) has no
                            // slot on the canonical radius scale (see
                            // `packages/design-tokens/tailwind-preset.js`).
                            "flex-1 text-center rounded-xl py-1 text-style-caption font-bold transition-colors",
                            hasSession
                              ? isToday && isActive
                                ? "bg-success-strong text-white"
                                : "bg-success/15 text-success-strong dark:text-success"
                              : "bg-line/30 text-subtle/40",
                          )}
                        >
                          {DAY_LABELS[i]}
                        </div>
                      );
                    })}
                  </div>

                  <div className="flex gap-2 mt-3">
                    {!isActive ? (
                      <button
                        type="button"
                        className="focus-ring flex-1 py-2.5 rounded-xl bg-fizruk-strong text-white text-style-label transition-[background-color,opacity,transform] active:scale-[0.98]"
                        onClick={() => activateProgram(prog.id)}
                      >
                        {messages.fizruk.programs.activate}
                      </button>
                    ) : (
                      <>
                        {todaySession && onStartWorkout && (
                          <button
                            type="button"
                            className="focus-ring flex-1 py-2.5 rounded-xl bg-fizruk-strong text-white text-style-label transition-[background-color,opacity,transform] active:scale-[0.98]"
                            onClick={() => {
                              const session =
                                prog.sessions[todaySession.sessionKey];
                              if (!session) {
                                // Schedule references a sessionKey missing
                                // from `sessions` — silent data drift in
                                // BUILTIN_PROGRAMS. Don't crash the workout
                                // screen with a non-null assertion (07 F6).
                                captureException(
                                  new Error(
                                    `Fizruk program "${prog.id}" schedule references missing session "${todaySession.sessionKey}"`,
                                  ),
                                );
                                return;
                              }
                              onStartWorkout(session, prog);
                            }}
                          >
                            {messages.fizruk.programs.startToday}
                          </button>
                        )}
                        {!todaySession && (
                          <div className="flex-1 py-2.5 rounded-xl bg-panelHi text-subtle text-style-label text-center">
                            {messages.fizruk.programs.restToday}
                          </div>
                        )}
                        <button
                          type="button"
                          // `text-style-label` (not raw `text-sm`): this
                          // button shares the row with the primary CTA
                          // above, which already carries the same role —
                          // a raw size here would drift from it for no
                          // reason (contrast the intentional raw-size
                          // precedent in `WorkoutItemCard.tsx`, where the
                          // control sits next to an input of matching
                          // height, not another labelled button).
                          className="focus-ring py-2.5 px-4 rounded-xl border border-line text-subtle text-style-label hover:text-text hover:bg-panelHi transition-colors"
                          onClick={deactivateProgram}
                        >
                          {messages.fizruk.programs.stop}
                        </button>
                      </>
                    )}
                    <button
                      type="button"
                      className="focus-ring py-2.5 px-4 rounded-xl border border-line text-subtle text-style-label hover:text-text hover:bg-panelHi transition-colors"
                      onClick={() =>
                        setExpandedProgram(isExpanded ? null : prog.id)
                      }
                      aria-expanded={isExpanded}
                      aria-controls={detailsId}
                    >
                      {isExpanded
                        ? messages.fizruk.programs.collapseDetails
                        : messages.fizruk.programs.details}
                    </button>
                  </div>
                </div>

                {isExpanded && (
                  <ProgramDetails
                    id={detailsId}
                    prog={prog}
                    exercises={exercises}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

interface ProgramDetailsProps {
  id: string;
  prog: TrainingProgramDef;
  exercises: RawExerciseDef[];
}

function ProgramDetails({ id, prog, exercises }: ProgramDetailsProps) {
  return (
    <div
      id={id}
      className="border-t border-line px-4 pb-4 pt-3 space-y-3 bg-bg/50"
    >
      <SectionHeading as="div" size="xs" variant="fizruk">
        {messages.fizruk.programs.scheduleHeading}
      </SectionHeading>
      {prog.schedule.map((schedEntry: ProgramScheduleEntry) => {
        const session = prog.sessions[schedEntry.sessionKey];
        if (!session) return null;
        const exList: RawExerciseDef[] = (session.exerciseIds || [])
          .map((exId: string) =>
            exercises.find((e: RawExerciseDef) => e.id === exId),
          )
          .filter((e): e is RawExerciseDef => Boolean(e));
        return (
          <div
            key={`${schedEntry.day}_${schedEntry.sessionKey}`}
            className="rounded-xl bg-panel border border-line/40 p-3"
          >
            <div className="flex items-center gap-2 mb-2">
              {/* Fizruk module accent throughout — was mixing the cyan
                  fill with the emerald `success` text/border pair. */}
              <span className="text-style-caption font-bold px-2 py-0.5 rounded-full bg-fizruk/15 text-fizruk-strong dark:text-fizruk border border-fizruk/30">
                {messages.fizruk.programs.daysPrefix} {schedEntry.day}
              </span>
              <span className="text-style-label text-text">
                {schedEntry.name}
              </span>
            </div>
            <div className="flex items-center gap-3 mb-2 text-style-caption text-subtle">
              <span>
                {messages.fizruk.programs.restLabel}{" "}
                <span className="font-semibold text-text">
                  {session.defaultRestSec}
                  {messages.fizruk.secondsUnit}
                </span>
              </span>
              {/* Програма з власною вагою не має чого «додавати» — «+0 кг»
                  було б підписом ні про що. */}
              {session.progressionKg > 0 && (
                <span>
                  {messages.fizruk.programs.progressionLabel}{" "}
                  <span className="font-semibold text-text">
                    +{session.progressionKg} {messages.fizruk.kgUnit}
                  </span>
                </span>
              )}
            </div>
            {exList.length > 0 ? (
              <div className="flex flex-wrap gap-1">
                {exList.map((ex: RawExerciseDef) => (
                  <span
                    key={ex.id}
                    className="text-xs px-2 py-0.5 rounded-full bg-panelHi border border-line text-subtle"
                  >
                    {ex.name?.uk || ex.name?.en || ex.id}
                  </span>
                ))}
              </div>
            ) : (
              <div className="text-style-caption text-muted italic">
                {messages.fizruk.programs.missingExercises}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
