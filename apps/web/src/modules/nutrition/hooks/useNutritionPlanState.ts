/**
 * Last validated: 2026-08-13
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
import {
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";

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
  /**
   * Коли денний план згенеровано (unix ms), `null` — якщо плану немає або
   * запис зі старої версії без мітки. Картка підписує ним несьогоднішній
   * план: план не протухає, тож мусить чесно казати свій вік.
   */
  dayPlanSavedAt: number | null;
}

interface NutritionPlanSnapshot {
  dayPlan: NutritionDayPlan | null;
  dayPlanSavedAt: number | null;
  weekPlan: NutritionWeekPlan | null;
  weekPlanRaw: string;
}

function loadSnapshot(
  ownerId: string | null,
  claimAnonymous: boolean,
): NutritionPlanSnapshot {
  const day = loadDayPlan(ownerId, claimAnonymous);
  const week = loadWeekPlan(ownerId, claimAnonymous);
  return {
    dayPlan: day?.plan ?? null,
    dayPlanSavedAt: day?.savedAt ?? null,
    weekPlan: week?.plan ?? null,
    weekPlanRaw: week?.raw ?? "",
  };
}

export function useNutritionPlanState(
  ownerId: string | null,
  claimAnonymous = false,
): UseNutritionPlanStateResult {
  const [initialSnapshot] = useState(() =>
    loadSnapshot(ownerId, claimAnonymous),
  );
  const [dayPlan, setDayPlan] = useState<NutritionDayPlan | null>(
    initialSnapshot.dayPlan,
  );
  const [dayPlanSavedAt, setDayPlanSavedAt] = useState<number | null>(
    initialSnapshot.dayPlanSavedAt,
  );

  const [weekPlan, setWeekPlan] = useState<NutritionWeekPlan | null>(
    initialSnapshot.weekPlan,
  );
  const [weekPlanRaw, setWeekPlanRaw] = useState<string>(
    initialSnapshot.weekPlanRaw,
  );

  const activeOwnerRef = useRef(ownerId);
  const pendingDayHydrationRef = useRef<{
    ownerId: string | null;
    value: NutritionDayPlan | null;
  } | null>({ ownerId, value: dayPlan });
  const pendingWeekHydrationRef = useRef<{
    ownerId: string | null;
    plan: NutritionWeekPlan | null;
    raw: string;
  } | null>({ ownerId, plan: weekPlan, raw: weekPlanRaw });

  useEffect(() => {
    if (activeOwnerRef.current === ownerId) return;
    const next = loadSnapshot(ownerId, claimAnonymous);
    activeOwnerRef.current = ownerId;
    pendingDayHydrationRef.current = { ownerId, value: next.dayPlan };
    pendingWeekHydrationRef.current = {
      ownerId,
      plan: next.weekPlan,
      raw: next.weekPlanRaw,
    };
    setDayPlan(next.dayPlan);
    setDayPlanSavedAt(next.dayPlanSavedAt);
    setWeekPlan(next.weekPlan);
    setWeekPlanRaw(next.weekPlanRaw);
  }, [claimAnonymous, ownerId]);

  // Перший прогін ефекту пропускається — і це не мікрооптимізація. Стан на
  // маунті вже дорівнює тому, що лежить у сховищі (його звідти й прочитали),
  // тож запис був би не просто зайвим: `saveDayPlan` штампує новий `savedAt`,
  // і кожне перемонтування «омолоджувало» б план, який ніхто не генерував.
  // Мітка часу перестала б означати те, для чого існує.
  useEffect(() => {
    const pending = pendingDayHydrationRef.current;
    if (pending?.ownerId === ownerId) {
      if (Object.is(pending.value, dayPlan)) {
        pendingDayHydrationRef.current = null;
      }
      return;
    }
    // Мітка йде зі сховища, а не з окремого `Date.now()` тут — інакше вони
    // розійшлися б, і підпис у картці показував би не те, що збережено.
    setDayPlanSavedAt(saveDayPlan(dayPlan, ownerId));
  }, [dayPlan, ownerId]);

  // Обидва поля тижневого плану пишуться одним записом: `plan` і `raw` — це
  // два представлення однієї відповіді LLM, і розʼїхавшись вони дали б картку,
  // де структура з одного покоління, а сирий текст із іншого.
  useEffect(() => {
    const pending = pendingWeekHydrationRef.current;
    if (pending?.ownerId === ownerId) {
      if (Object.is(pending.plan, weekPlan) && pending.raw === weekPlanRaw) {
        pendingWeekHydrationRef.current = null;
      }
      return;
    }
    saveWeekPlan(weekPlan, weekPlanRaw, ownerId);
  }, [ownerId, weekPlan, weekPlanRaw]);

  const ownerMatchesSnapshot = activeOwnerRef.current === ownerId;

  return {
    // Never expose one owner's snapshot during the render before the
    // owner-change hydration effect runs. The setters stay stable; the UI
    // sees an empty transition frame instead of account A's health data.
    weekPlan: ownerMatchesSnapshot ? weekPlan : null,
    setWeekPlan,
    weekPlanRaw: ownerMatchesSnapshot ? weekPlanRaw : "",
    setWeekPlanRaw,
    dayPlan: ownerMatchesSnapshot ? dayPlan : null,
    setDayPlan,
    dayPlanSavedAt: ownerMatchesSnapshot ? dayPlanSavedAt : null,
  };
}
