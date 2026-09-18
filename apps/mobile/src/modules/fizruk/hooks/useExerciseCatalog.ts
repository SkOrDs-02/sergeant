/**
 * `useExerciseCatalog` — mobile hook for the Fizruk exercise catalogue.
 *
 * Port of `apps/web/src/modules/fizruk/hooks/useExerciseCatalog.ts`.
 * Static catalogue data comes from `@sergeant/fizruk-domain`; custom
 * (user-created) exercises are persisted in MMKV via `useCustomExercises`.
 */
import { useMemo } from "react";

import { FizrukData } from "@sergeant/fizruk-domain";
import type { RawExerciseDef } from "@sergeant/fizruk-domain/data";

import { useCustomExercises, type CustomExercise } from "./useCustomExercises";

function customToRaw(ex: CustomExercise): RawExerciseDef {
  return {
    id: ex.id,
    name: { uk: ex.nameUk },
    primaryGroup: ex.primaryGroup ?? "",
    muscles: {
      primary: ex.musclesPrimary,
      secondary: ex.musclesSecondary,
    },
    _custom: true,
  };
}

export function useExerciseCatalog() {
  const { exercises: customExercises } = useCustomExercises();

  const exercises = useMemo(
    () =>
      FizrukData.mergeExerciseCatalog(
        customExercises.map(customToRaw),
        FizrukData.EXERCISES,
      ),
    [customExercises],
  );

  const search = (query: string): RawExerciseDef[] =>
    FizrukData.searchExercises(query, exercises);

  return {
    catalog: FizrukData.EXERCISE_CATALOG,
    exercises,
    search,
    primaryGroupsUk: FizrukData.PRIMARY_GROUPS_UK,
    equipmentUk: FizrukData.EQUIPMENT_UK,
    musclesUk: FizrukData.MUSCLES_UK,
    musclesByPrimaryGroup: FizrukData.MUSCLES_BY_PRIMARY_GROUP,
    customExercises,
    catalogLoading: false as const,
  };
}
