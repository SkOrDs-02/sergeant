/**
 * Last validated: 2026-11-18
 * Status: Active
 *
 * Єдина точка засіву бази продуктів для пошуку. Раніше засів кликав лише
 * аркуш «Додати прийом їжі» на відкритті, тож конструктор страви на
 * свіжому пристрої шукав у порожній базі й казав «Не знайшов «банан»»
 * (зйомка 2026-11-18). Тепер його чекає сам локальний пошук
 * (`useFoodSearch`), тобто будь-який екран із пошуком продуктів.
 *
 * Один прогін на сесію: `ensureSeedFoods` на непорожній базі читає до 5000
 * записів, тож запускати його на кожен запит дорого. Невдалий прогін
 * (`false`, база недоступна) не кешується: наступний пошук спробує знову.
 */
import { ensureSeedFoods } from "./foodDb";

let run: Promise<boolean> | null = null;

export function ensureSeedFoodsOnce(): Promise<boolean> {
  if (!run) {
    run = ensureSeedFoods().then(
      (ok) => {
        if (!ok) run = null;
        return ok;
      },
      () => {
        run = null;
        return false;
      },
    );
  }
  return run;
}

/** Лише для тестів: забути, що засів уже був. */
export function resetSeedFoodsOnceForTests(): void {
  run = null;
}
