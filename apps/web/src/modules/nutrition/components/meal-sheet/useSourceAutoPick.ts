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

export interface SourceAutoPick<TPicked> {
  /** «Позицію обрано»: запит і, за потреби, дія над знайденим продуктом. */
  schedule: (query: string, onPick?: (hit: TPicked) => void) => void;
  /**
   * Знімає намір, який ще чекає на пошук.
   *
   * Потрібен, бо тап по коморі переводить аркуш на «Заповнення» ДО того,
   * як пошук устигне відповісти. Якщо людина за цей час вийшла назад,
   * відкладений результат інакше поставив би `pickedFood` і сам смикнув
   * її назад на «Заповнення» — з продуктом, від якого вона щойно
   * відмовилась.
   */
  cancel: () => void;
}

export function useSourceAutoPick<TPicked>({
  foodQuery,
  search,
  setFoodQuery,
  setPickedFood,
}: SourceAutoPickArgs<TPicked>): SourceAutoPick<TPicked> {
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

  const schedule = useCallback(
    (query: string, onPick?: (hit: TPicked) => void) =>
      setPending({ query, onPick }),
    [],
  );
  const cancel = useCallback(() => setPending(null), []);

  return { schedule, cancel };
}
