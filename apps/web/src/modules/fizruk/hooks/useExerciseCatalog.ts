import { useCallback, useEffect, useMemo, useState } from "react";
import { FizrukData } from "@sergeant/fizruk-domain";
import { triggerFizrukDualWrite } from "../lib/dualWrite/index";
import {
  EMPTY_FIZRUK_DUAL_WRITE_STATE,
  extractCustomExerciseSnapshots,
  peekFizrukDualWriteState,
} from "../lib/fizrukDualWriteState";
import { getCachedFizrukSqliteState } from "../lib/sqliteReader";
import { useFizrukSqliteReadTick } from "../lib/sqliteReadGate";

type RawExerciseDef = FizrukData.RawExerciseDef;

function norm(s: unknown) {
  return (s || "").toString().trim().toLowerCase();
}

/**
 * Хук-обгортка над каталогом вправ із пакета `@sergeant/fizruk-domain`.
 *
 * Stage 8 PR #057f-tombstone: користувацькі вправи персистяться лише
 * через SQLite (`fizruk_custom_exercises`), а базові — беруться зі
 * статично імпортованого JSON-каталогу пакета. LS-сторінка
 * (`fizruk_custom_exercises_v1`) дренажиться у SQLite на першому boot
 * через `importFizrukResidualFromLs` і після того видаляється.
 */
export function useExerciseCatalog() {
  const catalogData = FizrukData.EXERCISE_CATALOG;
  const sqliteCacheTick = useFizrukSqliteReadTick();
  const [customExercises, setCustomExercises] = useState<RawExerciseDef[]>(
    () => {
      const cache = getCachedFizrukSqliteState();
      return cache.refreshedAt === null ? [] : cache.customExercises;
    },
  );

  const primaryGroupsUk = FizrukData.PRIMARY_GROUPS_UK;
  const equipmentUk = FizrukData.EQUIPMENT_UK;
  const musclesUk = FizrukData.MUSCLES_UK;
  const musclesByPrimaryGroup = FizrukData.MUSCLES_BY_PRIMARY_GROUP;

  // Stage 8 PR #057f-tombstone: overlay the user-added custom
  // exercises from the SQLite cache once it's warm. Built-in catalogue
  // entries always come from the static JSON.
  useEffect(() => {
    const cache = getCachedFizrukSqliteState();
    if (cache.refreshedAt === null) return;
    setCustomExercises(cache.customExercises);
  }, [sqliteCacheTick]);

  const persistCustom = useCallback((next: RawExerciseDef[]) => {
    setCustomExercises(next);
    const prevDualWrite =
      peekFizrukDualWriteState() ?? EMPTY_FIZRUK_DUAL_WRITE_STATE;
    const nextDualWrite = {
      ...prevDualWrite,
      customExercises: extractCustomExerciseSnapshots(next),
    };
    try {
      triggerFizrukDualWrite(prevDualWrite, nextDualWrite);
    } catch {
      /* trigger is fire-and-forget — never propagate */
    }
  }, []);

  const exercises = useMemo(
    () =>
      FizrukData.mergeExerciseCatalog(customExercises, FizrukData.EXERCISES),
    [customExercises],
  );

  const search = useCallback(
    (query: string) => {
      const q = norm(query);
      if (!q) return exercises;

      return exercises.filter((ex) => {
        const nameUk = norm(ex?.name?.uk);
        const nameEn = norm(ex?.name?.en);
        const aliases = (ex?.aliases || []).map(norm).join(" ");
        const desc = norm(ex?.description);
        const group = norm(ex?.primaryGroup);
        const groupUk = norm(ex?.primaryGroupUk);
        return (
          nameUk.includes(q) ||
          nameEn.includes(q) ||
          aliases.includes(q) ||
          desc.includes(q) ||
          group.includes(q) ||
          groupUk.includes(q)
        );
      });
    },
    [exercises],
  );

  const addExercise = useCallback(
    (ex: RawExerciseDef) => {
      if (!ex?.id) throw new Error("id is required");
      if (!ex?.name?.uk) throw new Error("name.uk is required");
      const next = [
        { ...ex, _custom: true },
        ...customExercises.filter((x) => x?.id !== ex.id),
      ];
      persistCustom(next);
    },
    [customExercises, persistCustom],
  );

  const removeExercise = useCallback(
    (id: string) => {
      if (!id) return false;
      const next = customExercises.filter((x) => x?.id !== id);
      if (next.length === customExercises.length) return false;
      persistCustom(next);
      return true;
    },
    [customExercises, persistCustom],
  );

  return {
    catalog: catalogData,
    exercises,
    search,
    primaryGroupsUk,
    equipmentUk,
    musclesUk,
    musclesByPrimaryGroup,
    addExercise,
    removeExercise,
    customExercises,
    catalogLoading: false,
  };
}
