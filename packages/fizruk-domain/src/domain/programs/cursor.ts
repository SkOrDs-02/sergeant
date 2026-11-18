/**
 * Курсор програми: яку сесію робити наступною.
 *
 * Рішення власника 2026-11-18 (П-10 (Б), OD-32): програму просуває лише
 * повноцінне тренування за чинним правилом стріку (`isFullWorkout`, канон
 * § 7–8). Тренування знає свою сесію через `Workout.programRef` (міграції
 * 171 / клієнтська 009): `slot` — індекс запису в `schedule`, бо `sessionKey`
 * у розкладі повторюється (PPL push пн і чт).
 *
 * Курсор = слот після останнього повноцінного тренування активної програми,
 * незалежно від дня тижня: пропущене тренування стартує будь-коли (Фз-4 (б)).
 * Порожнє чи обірване тренування (легке за тим самим правилом) програму не
 * рухає. Без жодного такого тренування курсор падає на розклад: сьогоднішній
 * слот, а в день відпочинку наступний.
 */

import { deviceDayKey } from "@sergeant/shared";

import type { WorkoutProgramRef } from "../types.js";
import {
  isFullWorkout,
  type WorkoutWeightInput,
} from "../workouts/activityWeight.js";
import { resolveNextScheduledSession, weekdayIndex } from "./today.js";
import type {
  ProgramScheduleEntry,
  ProgramSessionDef,
  TrainingProgramDef,
} from "./types.js";

export interface ProgramCursorWorkout extends WorkoutWeightInput {
  readonly programRef?: WorkoutProgramRef | null | undefined;
}

export interface ProgramCursor {
  readonly programId: string;
  /** Індекс у `schedule`, з 0. */
  readonly slot: number;
  readonly schedule: ProgramScheduleEntry;
  readonly session: ProgramSessionDef;
  /**
   * Повноцінне тренування цієї програми вже є сьогодні (доба пристрою,
   * ADR-0078): день закрито, hero показує відпочинок, а не другу сесію.
   */
  readonly doneToday: boolean;
}

function slotInRange(program: TrainingProgramDef, slot: unknown): boolean {
  return (
    typeof slot === "number" &&
    Number.isInteger(slot) &&
    slot >= 0 &&
    slot < program.schedule.length
  );
}

/** Найпізніше за початком повноцінне тренування цієї програми з валідним слотом. */
export function lastFullProgramWorkout<W extends ProgramCursorWorkout>(
  program: TrainingProgramDef,
  workouts: readonly W[],
): W | null {
  let best: W | null = null;
  let bestMs = -Infinity;
  for (const w of workouts) {
    const ref = w?.programRef;
    if (!ref || ref.programId !== program.id) continue;
    if (!slotInRange(program, ref.slot)) continue;
    if (!isFullWorkout(w)) continue;
    const ms = Date.parse(w.startedAt ?? "");
    if (!Number.isFinite(ms) || ms <= bestMs) continue;
    best = w;
    bestMs = ms;
  }
  return best;
}

function cursorAt(
  program: TrainingProgramDef,
  slot: number,
  doneToday: boolean,
): ProgramCursor | null {
  const schedule = program.schedule[slot];
  if (!schedule) return null;
  const session = program.sessions[schedule.sessionKey];
  if (!session) return null;
  return { programId: program.id, slot, schedule, session, doneToday };
}

export function resolveProgramCursor(
  program: TrainingProgramDef | null | undefined,
  workouts: readonly ProgramCursorWorkout[],
  now: Date = new Date(),
): ProgramCursor | null {
  if (!program || program.schedule.length === 0) return null;
  const last = lastFullProgramWorkout(program, workouts);
  if (last?.programRef) {
    const next = (last.programRef.slot + 1) % program.schedule.length;
    const doneToday =
      deviceDayKey(new Date(last.startedAt ?? "")) === deviceDayKey(now);
    return cursorAt(program, next, doneToday);
  }
  const today = weekdayIndex(now);
  const todaySlot = program.schedule.findIndex((s) => s.day - 1 === today);
  if (todaySlot >= 0) return cursorAt(program, todaySlot, false);
  const upcoming = resolveNextScheduledSession(program, now);
  if (!upcoming) return null;
  return cursorAt(program, program.schedule.indexOf(upcoming.schedule), false);
}

/**
 * Пара колонок `program_id` / `program_slot` → ref. Обидві порожні = поза
 * програмою (`null`); половина пари, порожній id або слот не ціле ≥0 —
 * `"invalid"`. Той самий контракт перевіряє сервер у sync-хендлері.
 */
export function normalizeWorkoutProgramRef(
  programId: unknown,
  slot: unknown,
): WorkoutProgramRef | null | "invalid" {
  if (programId == null && slot == null) return null;
  if (typeof programId !== "string" || programId.trim() === "") {
    return "invalid";
  }
  if (typeof slot !== "number" || !Number.isInteger(slot) || slot < 0) {
    return "invalid";
  }
  return { programId, slot };
}

export interface ProgramDaySession {
  readonly programId: string;
  readonly slot: number;
  readonly schedule: ProgramScheduleEntry;
  readonly session: ProgramSessionDef;
}

export interface ProgramRestDay extends ProgramDaySession {
  /** Днів до наступного тренувального дня розкладу, `1` = завтра. */
  readonly daysFromNow: number;
  /** День тренувальний, але повноцінну сесію програми сьогодні вже закрито. */
  readonly doneToday: boolean;
}

export interface ProgramDay {
  /** Що стартувати сьогодні: курсор у тренувальний день розкладу. */
  readonly today: ProgramDaySession | null;
  /** День відпочинку (П-11) або закритий день: курсор і коли наступний день. */
  readonly rest: ProgramRestDay | null;
}

/**
 * Що програма каже про сьогодні. Розклад вирішує лише, чи день
 * тренувальний; ЯКУ сесію робити, вирішує курсор (П-10). Тренувальний день
 * без закритої сьогодні сесії → `today`; день відпочинку або вже закритий
 * день → `rest` з наступною сесією курсора.
 */
export function resolveProgramDay(
  program: TrainingProgramDef | null | undefined,
  workouts: readonly ProgramCursorWorkout[],
  now: Date = new Date(),
): ProgramDay {
  const none: ProgramDay = { today: null, rest: null };
  const cursor = resolveProgramCursor(program, workouts, now);
  if (!program || !cursor) return none;
  const { doneToday, ...session } = cursor;
  const today = weekdayIndex(now);
  const trainingDay = program.schedule.some((s) => s.day - 1 === today);
  if (trainingDay && !doneToday) return { today: session, rest: null };
  const upcoming = resolveNextScheduledSession(program, now);
  if (!upcoming) return none;
  return {
    today: null,
    rest: { ...session, daysFromNow: upcoming.daysFromNow, doneToday },
  };
}
