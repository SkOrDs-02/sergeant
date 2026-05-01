import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CUSTOM_EXERCISES_KEY,
  FizrukData,
  parseCustomExercisesFromStorage,
  serializeCustomExercisesToStorage,
} from "@sergeant/fizruk-domain";
import { safeReadStringLS, safeWriteLS } from "@shared/lib/storage";

type RawExerciseDef = FizrukData.RawExerciseDef;

function norm(s: unknown) {
  return (s || "").toString().trim().toLowerCase();
}

/**
 * Хук-обгортка над каталогом вправ із пакета `@sergeant/fizruk-domain`.
 * Користувацькі вправи персистяться в localStorage, базові — беруться зі
 * статично імпортованого JSON-каталогу пакета.
 */
export function useExerciseCatalog() {
  const catalogData = FizrukData.EXERCISE_CATALOG;
  const [customExercises, setCustomExercises] = useState<RawExerciseDef[]>([]);

  const primaryGroupsUk = FizrukData.PRIMARY_GROUPS_UK;
  const equipmentUk = FizrukData.EQUIPMENT_UK;
  const musclesUk = FizrukData.MUSCLES_UK;
  const musclesByPrimaryGroup = FizrukData.MUSCLES_BY_PRIMARY_GROUP;

  useEffect(() => {
    const raw = safeReadStringLS(CUSTOM_EXERCISES_KEY);
    const parsed = parseCustomExercisesFromStorage(raw);
    if (Array.isArray(parsed)) setCustomExercises(parsed as RawExerciseDef[]);
  }, []);

  const persistCustom = useCallback((next: RawExerciseDef[]) => {
    setCustomExercises(next);
    safeWriteLS(CUSTOM_EXERCISES_KEY, serializeCustomExercisesToStorage(next));
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
