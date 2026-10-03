/**
 * Last validated: 2026-09-11
 * Status: Active
 *
 * Вхід для колеса ваги: СТАЛИЙ список значень і число, яке колесо має
 * показувати. Обидва — про одну знахідку власника: «обираю через чек або
 * пошук, і колесо кілька разів стрибає туди-сюди».
 *
 * Дві причини того стрибання жили тут, у входах компонента.
 *
 * **Список виводився із самого значення.** `portionGramValues(pickedGrams)`
 * вставляв поточну вагу в масив і пересортовував його. Щойно вага «не по
 * сітці» (33 г з OFF, 150.5 з чека), масив ріс на один елемент; після
 * наступного коміту та вага переставала бути поточною, елемент зникав, і
 * всі індекси після нього зсувались назад. Колесо стрибало на рядок після
 * КОЖНОГО коміту. Тому довільні числа тут НАКОПИЧУЮТЬСЯ: те, що вже
 * потрапило в список, лишається в ньому, поки аркуш відкритий.
 *
 * **Порожнє поле кидало колесо на 100.** `Number(pickedGrams) || 100` дає
 * 100 і для порожнього рядка, і для «0» — тобто рівно тоді, коли людина
 * стерла значення, щоб набрати інше. Колесо смикалось на 100 посеред
 * набору. Тепер порожнє поле лишає колесо на місці: показується остання
 * дійсна вага.
 */
import { useMemo, useState } from "react";

import {
  MAX_PORTION_GRAMS,
  isPortionGramOnGrid,
  portionGramValues,
} from "./mealFormUtils";

/** Дефолт, поки жодної дійсної ваги ще не бачили. */
const FALLBACK_GRAMS = 100;

export interface WheelGrams {
  /** Сталий список значень колеса. */
  values: number[];
  /** Число, на якому стоїть колесо. */
  value: number;
}

function parseGrams(raw: string): number | null {
  const grams = Number(String(raw).trim().replace(",", "."));
  if (!Number.isFinite(grams) || grams <= 0 || grams > MAX_PORTION_GRAMS) {
    return null;
  }
  return grams;
}

export function useWheelGrams(raw: string): WheelGrams {
  // Довільні числа поза сіткою, які вже показувались. Множиною не беремо
  // навмисно: `useState` порівнює посиланням, тож новий масив — і є
  // сигналом «список змінився».
  const [extras, setExtras] = useState<number[]>([]);
  const [lastValid, setLastValid] = useState(FALLBACK_GRAMS);

  const parsed = parseGrams(raw);

  // Правка стану під час рендеру — канонічний React-патерн «derived state
  // adjustment», той самий, яким `AddMealSheet` ловить перехід `open`.
  // Ефект тут дав би зайвий кадр зі старим значенням, а це рівно той
  // кадр, який людина бачить як стрибок.
  if (parsed !== null && parsed !== lastValid) setLastValid(parsed);
  if (
    parsed !== null &&
    !isPortionGramOnGrid(parsed) &&
    !extras.includes(parsed)
  ) {
    setExtras([...extras, parsed]);
  }

  const values = useMemo(() => portionGramValues(extras), [extras]);

  return { values, value: parsed ?? lastValid };
}
