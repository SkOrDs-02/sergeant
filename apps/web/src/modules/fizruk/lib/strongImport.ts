import {
  detectDelimiter,
  isBlankRow,
  tokenizeCsv,
} from "@sergeant/tabular-import";
import { FizrukData } from "@sergeant/fizruk-domain";
import { matchStrongExerciseName } from "./strongMatch";
import type { StrongExerciseMatch } from "./strongMatch";
import type {
  FizrukDualWriteState,
  FizrukItemSnapshot,
  FizrukMeasurementSnapshot,
  FizrukSetSnapshot,
  FizrukWorkoutSnapshot,
} from "./sqliteWriter/diff";
import {
  EMPTY_FIZRUK_DUAL_WRITE_STATE,
  peekFizrukDualWriteState,
} from "./fizrukDualWriteState";
import { triggerFizrukDualWrite } from "./sqliteWriter";

export { matchStrongExerciseName } from "./strongMatch";
export type { StrongExerciseMatch } from "./strongMatch";

export type StrongWeightUnit = "kg" | "lb";
export type StrongImportItemType = "strength" | "time" | "distance";

const WORKOUT_HEADER = [
  "Date",
  "Workout Name",
  "Duration",
  "Exercise Name",
  "Set Order",
  "Weight",
  "Reps",
  "Distance",
  "Seconds",
  "RPE",
] as const;

const WEIGHT_HEADER = ["Date", "Measurement Type", "Value", "Unit", "Source"];

const LB_TO_KG = 0.45359237;

export class StrongImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StrongImportError";
  }
}

export interface StrongImportSet {
  readonly setOrder: number;
  readonly weightKg: number;
  readonly reps: number;
  readonly distanceM: number;
  readonly seconds: number;
  readonly rpe: number | null;
}

export interface StrongImportItem {
  readonly strongName: string;
  readonly type: StrongImportItemType;
  readonly sets: readonly StrongImportSet[];
  readonly distanceM: number;
  readonly durationSec: number;
}

export interface StrongImportWorkout {
  readonly strongDate: string;
  readonly startedAt: string;
  readonly note: string;
  readonly items: readonly StrongImportItem[];
}

export interface StrongWorkoutImportDraft {
  readonly workouts: readonly StrongImportWorkout[];
  readonly skippedRestTimerRows: number;
  readonly setCount: number;
  readonly exerciseNames: readonly string[];
}

export interface StrongWeightImportDraft {
  readonly measurements: readonly FizrukMeasurementSnapshot[];
}

export type StrongImportSelection = Readonly<
  Record<string, string | null | undefined>
>;

export interface StrongImportBuildResult {
  readonly next: FizrukDualWriteState;
  readonly importedWorkoutCount: number;
  readonly importedSetCount: number;
  readonly skippedExerciseNames: readonly string[];
}

interface StrongRow {
  date: string;
  workoutName: string;
  exerciseName: string;
  setOrder: string;
  weight: string;
  reps: string;
  distance: string;
  seconds: string;
  rpe: string;
}

export function parseStrongWorkoutCsv(
  text: string,
  weightUnit: StrongWeightUnit,
): StrongWorkoutImportDraft {
  const rows = parseCsvRows(text);
  assertHeader(rows[0], WORKOUT_HEADER, "Strong workout CSV header is unknown");

  const workouts = new Map<
    string,
    {
      note: string;
      startedAt: string;
      items: Map<string, { rows: Map<number, StrongImportSet>; order: number }>;
    }
  >();
  let skippedRestTimerRows = 0;
  let setCount = 0;
  const exerciseNames = new Set<string>();

  rows.slice(1).forEach((raw, index) => {
    if (isBlankRow(raw)) return;
    const row = toWorkoutRow(raw);
    if (row.setOrder.trim() === "Rest Timer") {
      skippedRestTimerRows += 1;
      return;
    }

    const setOrder = parseRequiredInt(row.setOrder, index + 2, "Set Order");
    const date = row.date.trim();
    const exerciseName = row.exerciseName.trim();
    if (!date || !exerciseName) {
      throw new StrongImportError(`Strong row ${index + 2} is missing data`);
    }

    const workout = workouts.get(date) ?? {
      note: row.workoutName.trim(),
      startedAt: parseStrongDate(date, index + 2),
      items: new Map(),
    };
    const item = workout.items.get(exerciseName) ?? {
      rows: new Map<number, StrongImportSet>(),
      order: workout.items.size,
    };
    item.rows.set(setOrder, {
      setOrder,
      weightKg: weightToKg(parseNumber(row.weight), weightUnit),
      reps: Math.round(parseNumber(row.reps)),
      distanceM: parseNumber(row.distance),
      seconds: parseNumber(row.seconds),
      rpe: parseOptionalNumber(row.rpe),
    });
    workout.items.set(exerciseName, item);
    workouts.set(date, workout);
    exerciseNames.add(exerciseName);
    setCount += 1;
  });

  const parsedWorkouts = [...workouts.entries()].map(([date, workout]) => ({
    strongDate: date,
    startedAt: workout.startedAt,
    note: workout.note,
    items: [...workout.items.entries()]
      .sort((a, b) => a[1].order - b[1].order)
      .map(([strongName, item]) => {
        const sets = [...item.rows.values()].sort(
          (a, b) => a.setOrder - b.setOrder,
        );
        const distanceM = sum(sets.map((set) => set.distanceM));
        const durationSec = sum(sets.map((set) => set.seconds));
        return {
          strongName,
          type: itemType(sets),
          sets,
          distanceM,
          durationSec,
        };
      }),
  }));

  return {
    workouts: parsedWorkouts,
    skippedRestTimerRows,
    setCount,
    exerciseNames: [...exerciseNames].sort((a, b) => a.localeCompare(b)),
  };
}

export function parseStrongWeightCsv(text: string): StrongWeightImportDraft {
  const rows = parseCsvRows(text);
  assertHeader(rows[0], WEIGHT_HEADER, "Strong weight CSV header is unknown");

  const measurements: FizrukMeasurementSnapshot[] = [];
  rows.slice(1).forEach((row, index) => {
    if (isBlankRow(row)) return;
    const measurementType = String(row[1] ?? "")
      .trim()
      .toLowerCase();
    if (measurementType !== "weight") return;
    const at = parseStrongDate(String(row[0] ?? ""), index + 2);
    const unit = normalizeWeightUnit(String(row[3] ?? ""));
    const weightKg = weightToKg(parseNumber(String(row[2] ?? "")), unit);
    measurements.push({
      id: `strong_m_${stableHash(String(row[0] ?? ""))}`,
      at,
      weightKg,
    });
  });

  return { measurements };
}

export function matchStrongExercises(
  draft: StrongWorkoutImportDraft,
  pool: readonly FizrukData.RawExerciseDef[] = FizrukData.EXERCISES,
): StrongExerciseMatch[] {
  return draft.exerciseNames.map((strongName) =>
    matchStrongExerciseName(strongName, pool),
  );
}

export function buildStrongImportState(
  prev: FizrukDualWriteState,
  draft: StrongWorkoutImportDraft,
  matches: readonly StrongExerciseMatch[],
  selection: StrongImportSelection,
  weightDraft: StrongWeightImportDraft = { measurements: [] },
  pool: readonly FizrukData.RawExerciseDef[] = FizrukData.EXERCISES,
): StrongImportBuildResult {
  const matchByName = new Map(
    matches.map((match) => [match.strongName, match]),
  );
  const exerciseById = new Map(pool.map((exercise) => [exercise.id, exercise]));
  const workouts = [...prev.workouts];
  const skippedExerciseNames = new Set<string>();
  let importedSetCount = 0;

  for (const workout of draft.workouts) {
    const importedItems: FizrukItemSnapshot[] = [];
    for (const item of workout.items) {
      const exerciseId =
        selection[item.strongName] ??
        matchByName.get(item.strongName)?.autoExerciseId ??
        null;
      const exercise = exerciseId ? exerciseById.get(exerciseId) : null;
      if (!exercise) {
        skippedExerciseNames.add(item.strongName);
        continue;
      }
      importedItems.push(toSnapshotItem(workout.strongDate, item, exercise));
      importedSetCount += item.sets.length;
    }
    if (importedItems.length === 0) continue;

    const snapshot: FizrukWorkoutSnapshot = {
      id: workoutId(workout.strongDate),
      startedAt: workout.startedAt,
      endedAt: null,
      items: importedItems,
      groups: [],
      warmup: null,
      cooldown: null,
      note: workout.note,
      wellbeing: null,
    };
    const existingIndex = workouts.findIndex(
      (w) => w.id === snapshot.id || w.startedAt === snapshot.startedAt,
    );
    if (existingIndex >= 0) workouts[existingIndex] = snapshot;
    else workouts.push(snapshot);
  }

  const measurements = mergeMeasurements(
    prev.measurements,
    weightDraft.measurements,
  );
  workouts.sort((a, b) => b.startedAt.localeCompare(a.startedAt));

  return {
    next: { ...prev, workouts, measurements },
    importedWorkoutCount: draft.workouts.length,
    importedSetCount,
    skippedExerciseNames: [...skippedExerciseNames].sort((a, b) =>
      a.localeCompare(b),
    ),
  };
}

export function commitStrongImport(
  draft: StrongWorkoutImportDraft,
  matches: readonly StrongExerciseMatch[],
  selection: StrongImportSelection,
  weightDraft?: StrongWeightImportDraft,
  pool?: readonly FizrukData.RawExerciseDef[],
): StrongImportBuildResult {
  const prev = peekFizrukDualWriteState() ?? EMPTY_FIZRUK_DUAL_WRITE_STATE;
  const result = buildStrongImportState(
    prev,
    draft,
    matches,
    selection,
    weightDraft,
    pool,
  );
  triggerFizrukDualWrite(prev, result.next);
  return result;
}

function parseCsvRows(text: string): string[][] {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  const delimiter = detectDelimiter(firstLine);
  const rows = tokenizeCsv(text, delimiter).filter((row) => !isBlankRow(row));
  if (rows.length === 0) throw new StrongImportError("Strong CSV is empty");
  return rows;
}

function assertHeader(
  row: readonly string[] | undefined,
  expected: readonly string[],
  message: string,
): void {
  if (!row || row.length !== expected.length) {
    throw new StrongImportError(`${message}. Expected: ${expected.join(",")}`);
  }
  const ok = expected.every((header, index) => row[index] === header);
  if (!ok)
    throw new StrongImportError(`${message}. Expected: ${expected.join(",")}`);
}

function toWorkoutRow(row: readonly string[]): StrongRow {
  return {
    date: String(row[0] ?? ""),
    workoutName: String(row[1] ?? ""),
    exerciseName: String(row[3] ?? ""),
    setOrder: String(row[4] ?? ""),
    weight: String(row[5] ?? ""),
    reps: String(row[6] ?? ""),
    distance: String(row[7] ?? ""),
    seconds: String(row[8] ?? ""),
    rpe: String(row[9] ?? ""),
  };
}

function parseRequiredInt(raw: string, row: number, field: string): number {
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    throw new StrongImportError(`Strong row ${row} has invalid ${field}`);
  }
  return Math.round(value);
}

function parseNumber(raw: string): number {
  if (!raw.trim()) return 0;
  const value = Number(raw.trim());
  return Number.isFinite(value) ? value : 0;
}

function parseOptionalNumber(raw: string): number | null {
  if (!raw.trim()) return null;
  const value = Number(raw.trim());
  return Number.isFinite(value) ? value : null;
}

function parseStrongDate(raw: string, row: number): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/.exec(
    raw.trim(),
  );
  if (!match) throw new StrongImportError(`Strong row ${row} has invalid Date`);
  const [, y, m, d, hh, mm, ss] = match;
  const date = new Date(
    Number(y),
    Number(m) - 1,
    Number(d),
    Number(hh),
    Number(mm),
    Number(ss),
  );
  if (Number.isNaN(date.getTime())) {
    throw new StrongImportError(`Strong row ${row} has invalid Date`);
  }
  return date.toISOString();
}

function normalizeWeightUnit(raw: string): StrongWeightUnit {
  const unit = raw.trim().toLowerCase();
  if (unit === "kg" || unit === "kilogram" || unit === "kilograms") return "kg";
  if (
    unit === "lb" ||
    unit === "lbs" ||
    unit === "pound" ||
    unit === "pounds"
  ) {
    return "lb";
  }
  throw new StrongImportError("Strong weight CSV has unknown weight unit");
}

function weightToKg(value: number, unit: StrongWeightUnit): number {
  return unit === "lb" ? value * LB_TO_KG : value;
}

function itemType(sets: readonly StrongImportSet[]): StrongImportItemType {
  if (sets.some((set) => set.distanceM > 0)) return "distance";
  if (
    sets.some((set) => set.seconds > 0) &&
    sets.every((set) => set.weightKg === 0)
  ) {
    return "time";
  }
  return "strength";
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function toSnapshotItem(
  strongDate: string,
  item: StrongImportItem,
  exercise: FizrukData.RawExerciseDef,
): FizrukItemSnapshot {
  const sets = item.sets.map((set): FizrukSetSnapshot => ({
    weightKg: set.weightKg,
    reps: set.reps,
    ...(set.rpe != null ? { rpe: set.rpe } : {}),
  }));
  const snapshot: FizrukItemSnapshot = {
    id: itemId(strongDate, item.strongName),
    exerciseId: exercise.id,
    nameUk: exercise.name?.uk || exercise.name?.en || exercise.id,
    primaryGroup: exercise.primaryGroup,
    musclesPrimary: exercise.muscles?.primary ?? [],
    musclesSecondary: exercise.muscles?.secondary ?? [],
    type: item.type,
    sets,
    ...(item.durationSec > 0 ? { durationSec: item.durationSec } : {}),
    ...(item.distanceM > 0 ? { distanceM: item.distanceM } : {}),
  };
  return snapshot;
}

function mergeMeasurements(
  current: readonly FizrukMeasurementSnapshot[],
  imported: readonly FizrukMeasurementSnapshot[],
): FizrukMeasurementSnapshot[] {
  const byId = new Map(current.map((entry) => [entry.id, entry]));
  for (const entry of imported) byId.set(entry.id, entry);
  return [...byId.values()].sort((a, b) => b.at.localeCompare(a.at));
}

function workoutId(strongDate: string): string {
  return `strong_w_${stableHash(strongDate)}`;
}

function itemId(strongDate: string, strongName: string): string {
  return `strong_i_${stableHash(`${strongDate}|${strongName}`)}`;
}

function stableHash(value: string): string {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}
