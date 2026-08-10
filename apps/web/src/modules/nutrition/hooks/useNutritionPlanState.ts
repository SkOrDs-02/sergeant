/**
 * Last validated: 2026-08-10
 * Status: Active
 * Стан денного і тижневого планів + їхня персистенція.
 *
 * Винесено з `useNutritionUiState`, бо це єдиний шматок того хука, який
 * має власне сховище — решта полів там справді ефемерні (busy-прапорці,
 * відкриті діалоги). Історія і межі рішення — у `../lib/planStorage`.
 *
 * **Чому lazy-ініціалізація `useState`, а не гідрація в `useEffect`.**
 * Ефект гідрації відпрацював би ПІСЛЯ першого прогону ефекту запису, і
 * той записав би початковий `null` поверх збереженого плану. Вийшло б
 * вікно (нехай і в один кадр), у якому сховище вже порожнє — тобто той
 * самий баг, тільки рідший і тому гірший для дебагу. Ініціалізатор
 * `useState` читає сховище ще до першого рендера, тож перший запис
 * збігається з тим, що вже лежить у сховищі, і жодного вікна немає.
 */
import { useEffect, useState, type Dispatch, type SetStateAction } from "react";

import {
  loadDayPlan,
  loadWeekPlan,
  saveDayPlan,
  saveWeekPlan,
} from "../lib/planStorage";
import type {
  NutritionDayPlan,
  NutritionWeekPlan,
} from "./useNutritionUiState";

export interface UseNutritionPlanStateResult {
  weekPlan: NutritionWeekPlan | null;
  setWeekPlan: Dispatch<SetStateAction<NutritionWeekPlan | null>>;
  weekPlanRaw: string;
  setWeekPlanRaw: Dispatch<SetStateAction<string>>;
  dayPlan: NutritionDayPlan | null;
  setDayPlan: Dispatch<SetStateAction<NutritionDayPlan | null>>;
}

export function useNutritionPlanState(): UseNutritionPlanStateResult {
  const [dayPlan, setDayPlan] = useState<NutritionDayPlan | null>(
    () => loadDayPlan()?.plan ?? null,
  );

  const [weekPlan, setWeekPlan] = useState<NutritionWeekPlan | null>(
    () => loadWeekPlan()?.plan ?? null,
  );
  const [weekPlanRaw, setWeekPlanRaw] = useState<string>(
    () => loadWeekPlan()?.raw ?? "",
  );

  useEffect(() => {
    saveDayPlan(dayPlan);
  }, [dayPlan]);

  // Обидва поля тижневого плану пишуться одним записом: `plan` і `raw` — це
  // два представлення однієї відповіді LLM, і розʼїхавшись вони дали б картку,
  // де структура з одного покоління, а сирий текст із іншого.
  useEffect(() => {
    saveWeekPlan(weekPlan, weekPlanRaw);
  }, [weekPlan, weekPlanRaw]);

  return {
    weekPlan,
    setWeekPlan,
    weekPlanRaw,
    setWeekPlanRaw,
    dayPlan,
    setDayPlan,
  };
}
