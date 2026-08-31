/**
 * Автовибір продукту для позиції, взятої з чека Сільпо.
 *
 * Людина вже назвала цей продукт — у магазині, на касі. Просити її після
 * тапу ще й знайти той самий товар у списку означає просити ту саму роботу
 * вдруге, тому перший результат розгортається карткою сам. Нічого не
 * зберігається без згоди: `pickedFood` лише переводить аркуш на крок
 * «Заповнення», де КБЖУ видно, а запис вимагає явного тапу.
 *
 * Ручний набір цим шляхом НЕ йде. Намір живе рівно один запит: без цього
 * пошук смикав би на крок заповнення посеред набору слова.
 *
 * AI-CONTEXT: стан оновлюється під час рендеру, а не в `useEffect` — той
 * самий патерн, що й авто-перехід `source → fill` у `AddMealSheet`.
 * `useEffect` тут заборонений лінтом (`react-hooks/set-state-in-effect`) і
 * дав би зайвий каскадний рендер: рішення повністю виводиться з уже
 * відомого стану, зовнішньої системи для синхронізації немає.
 *
 * Status: Active
 */
import { useState, type Dispatch, type SetStateAction } from "react";
import type { UseFoodSearchResult } from "./useFoodSearch";

interface ReceiptAutoPickArgs<TPicked> {
  foodQuery: string;
  /** Результат `useFoodSearch` цілком — потрібні хіти й `searchSettled`. */
  search: UseFoodSearchResult;
  setFoodQuery: Dispatch<SetStateAction<string>>;
  setPickedFood: Dispatch<SetStateAction<TPicked | null>>;
}

/** @returns колбек «позицію чека обрано», який приймає очищений запит. */
export function useReceiptAutoPick<TPicked>({
  foodQuery,
  search,
  setFoodQuery,
  setPickedFood,
}: ReceiptAutoPickArgs<TPicked>): (query: string) => void {
  const [pendingQuery, setPendingQuery] = useState<string | null>(null);

  if (pendingQuery && foodQuery === pendingQuery && search.searchSettled) {
    const hit = search.foodHits[0] ?? search.offHits[0];
    // Намір гасне ДО виходу по «нічого не знайшлось»: інакше він пережив
    // би промах і смикнув на перший хіт наступного, уже ручного запиту.
    setPendingQuery(null);
    if (hit) {
      setPickedFood(hit as TPicked);
      // Вагу не чіпаємо: з чека вона вже стоїть і знає фактичне фасування,
      // а `defaultGrams` каталогу — лише типова порція.
      setFoodQuery("");
    }
  }

  return setPendingQuery;
}
