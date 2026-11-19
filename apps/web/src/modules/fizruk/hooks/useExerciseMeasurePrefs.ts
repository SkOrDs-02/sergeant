/**
 * Памʼять людини про тип виміру вправи, що їде між пристроями (спека
 * `docs/work/specs/fizruk-exercise-measure-type.md`, рішення Р-2, зріз 5).
 *
 * Персист — SQLite-dual-write у `fizruk_exercise_prefs` (міграція 173 /
 * клієнтська 011), рядок на вправу. Вибір, що збігається з дефолтом
 * вправи (каталог чи власна вправа), прибирає рядок: soft-delete =
 * «повернути дефолт каталогу», окремої кнопки «скинути» немає.
 *
 * Пише лише перемикач у сесії: імпорт Strong і чат памʼять не чіпають, це
 * не вибір людини в інтерфейсі.
 */
import { useCallback } from "react";
import { useSqliteTickOverlay } from "@shared/hooks/useSqliteTickOverlay";
import {
  catalogMeasure,
  type ExerciseMeasure,
} from "@sergeant/fizruk-domain/domain";
import { findExerciseById } from "@sergeant/fizruk-domain/data";
import { triggerFizrukDualWrite } from "../lib/sqliteWriter/index";
import { extractExercisePrefSnapshots } from "../lib/fizrukDualWriteState";
import {
  fizrukDualWriteTransition,
  useFizrukIntendedSlice,
} from "../lib/fizrukDualWriteIntent";
import { getCachedFizrukSqliteState } from "../lib/sqliteReader";
import { useFizrukSqliteReadTick } from "../lib/sqliteReadGate";

export type ExerciseMeasurePrefMap = Readonly<Record<string, ExerciseMeasure>>;

export interface UseExerciseMeasurePrefsResult {
  /** id вправи → тип, обраний людиною. */
  prefs: ExerciseMeasurePrefMap;
  /** Запамʼятати вибір людини; дефолт вправи прибирає рядок памʼяті. */
  rememberMeasure: (exerciseId: string, measure: ExerciseMeasure) => void;
}

/** Дефолт вправи: каталог, а для власної — її поле `measure`. */
function exerciseDefault(exerciseId: string): ExerciseMeasure {
  const catalog = findExerciseById(exerciseId);
  if (catalog) return catalogMeasure(catalog);
  const custom = getCachedFizrukSqliteState().customExercises.find(
    (e) => e.id === exerciseId,
  );
  return catalogMeasure(custom ?? null);
}

export function useExerciseMeasurePrefs(): UseExerciseMeasurePrefsResult {
  const sqliteCacheTick = useFizrukSqliteReadTick();
  const [prefs, setPrefs] = useSqliteTickOverlay<ExerciseMeasurePrefMap>(
    sqliteCacheTick,
    () => {
      const cache = getCachedFizrukSqliteState();
      return cache.refreshedAt === null
        ? undefined
        : (cache.exercisePrefs ?? {});
    },
    () => {
      const cache = getCachedFizrukSqliteState();
      return cache.refreshedAt === null ? {} : (cache.exercisePrefs ?? {});
    },
  );

  const intended = useFizrukIntendedSlice<"exercisePrefs">(sqliteCacheTick);

  const rememberMeasure = useCallback(
    (exerciseId: string, measure: ExerciseMeasure) => {
      if (!exerciseId) return;
      const isDefault = measure === exerciseDefault(exerciseId);
      if (isDefault ? !(exerciseId in prefs) : prefs[exerciseId] === measure) {
        return;
      }
      const next: Record<string, ExerciseMeasure> = { ...prefs };
      if (isDefault) delete next[exerciseId];
      else next[exerciseId] = measure;
      setPrefs(next);
      const transition = fizrukDualWriteTransition(
        "exercisePrefs",
        intended,
        extractExercisePrefSnapshots(next),
      );
      try {
        triggerFizrukDualWrite(transition.prev, transition.next);
      } catch {
        /* trigger is fire-and-forget - never propagate */
      }
    },
    [prefs, intended, setPrefs],
  );

  return { prefs, rememberMeasure };
}
