import type { ExerciseMeasurePrefs } from "@sergeant/fizruk-domain/domain";

import { getCachedFizrukSqliteState } from "./sqliteReader";

/**
 * Памʼять типу виміру з SQLite-кешу для шляхів старту вправи (додати вправу,
 * шаблон, план, програма): читання в момент дії, без підписки. Пріоритет
 * при старті — памʼять людини → дефолт вправи → вага × повтори
 * (`resolveExerciseMeasure`, спека типу виміру, Р-2).
 */
export function currentExerciseMeasurePrefs(): ExerciseMeasurePrefs {
  return getCachedFizrukSqliteState().exercisePrefs ?? {};
}
