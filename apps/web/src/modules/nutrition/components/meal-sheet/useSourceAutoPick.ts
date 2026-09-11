/**
 * Автовибір продукту для позиції, яку людина вже назвала в іншому місці —
 * у чеку Сільпо або у власній коморі.
 *
 * Вона вже зробила цю роботу: назвала товар на касі або поклала його на
 * полицю. Просити після тапу ще й знайти той самий продукт у списку
 * означає просити те саме вдруге, тому перший результат розгортається
 * карткою сам. Нічого не зберігається без згоди: `pickedFood` лише
 * переводить аркуш на крок «Заповнення», де КБЖУ видно, а запис вимагає
 * явного тапу.
 *
 * Ручний набір цим шляхом НЕ йде. Намір живе рівно один запит: без цього
 * пошук смикав би на крок заповнення посеред набору слова.
 *
 * **Чому це важливо для комори (N1, 2026-09-11).** Доти вибір позиції
 * комори ставив лише рядок-назву: `pickedFood` лишався `null`, тож
 * картка продукту не монтувалась, редактор КБЖУ відкривався порожнім, і
 * прийом зберігався **без макросів узагалі**. Порція 100 г при цьому
 * служила рівно списанню. Пошук за назвою навіть запускався
 * (`setFoodQuery`), але його результат нікуди не йшов — крок `source`
 * уже був розмонтований авто-переходом. Тобто робота робилась і
 * викидалась; тут вона доходить до кінця.
 *
 * AI-CONTEXT: стан оновлюється під час рендеру, а не в `useEffect` — той
 * самий патерн, що й авто-перехід `source → fill` у `AddMealSheet`.
 * `useEffect` тут заборонений лінтом (`react-hooks/set-state-in-effect`) і
 * дав би зайвий каскадний рендер: рішення повністю виводиться з уже
 * відомого стану, зовнішньої системи для синхронізації немає.
 *
 * Last validated: 2026-09-11
 * Status: Active
 */
import {
  useCallback,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import type { UseFoodSearchResult } from "./useFoodSearch";

interface SourceAutoPickArgs<TPicked> {
  foodQuery: string;
  /** Результат `useFoodSearch` цілком — потрібні хіти й `searchSettled`. */
  search: UseFoodSearchResult;
  setFoodQuery: Dispatch<SetStateAction<string>>;
  setPickedFood: Dispatch<SetStateAction<TPicked | null>>;
}

interface PendingPick<TPicked> {
  query: string;
  /**
   * Що зробити з хітом понад сам вибір. Джерела різняться саме тут:
   * чек уже знає фактичне фасування й вагу не чіпає, комора ваги не знає
   * і бере типову порцію каталогу.
   */
  onPick?: ((hit: TPicked) => void) | undefined;
}

/**
 * @returns колбек «позицію обрано»: приймає очищений запит і, за потреби,
 * дію над знайденим продуктом.
 */
export function useSourceAutoPick<TPicked>({
  foodQuery,
  search,
  setFoodQuery,
  setPickedFood,
}: SourceAutoPickArgs<TPicked>): (
  query: string,
  onPick?: (hit: TPicked) => void,
) => void {
  const [pending, setPending] = useState<PendingPick<TPicked> | null>(null);

  if (pending && foodQuery === pending.query && search.searchSettled) {
    const hit = search.foodHits[0] ?? search.offHits[0];
    const { onPick } = pending;
    // Намір гасне ДО виходу по «нічого не знайшлось»: інакше він пережив
    // би промах і смикнув на перший хіт наступного, уже ручного запиту.
    setPending(null);
    if (hit) {
      setPickedFood(hit as TPicked);
      onPick?.(hit as TPicked);
      setFoodQuery("");
    }
  }

  return useCallback(
    (query: string, onPick?: (hit: TPicked) => void) =>
      setPending({ query, onPick }),
    [],
  );
}
