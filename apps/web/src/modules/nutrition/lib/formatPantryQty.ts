/**
 * Last validated: 2026-08-29
 * Status: Active
 *
 * Кількість позиції комори у ПОБУТОВІЙ одиниці: «1,87 л» замість «1874 мл»,
 * «1,5 кг» замість «1500 г».
 *
 * Живе в модулі, а не в `@shared/lib/format`: спільний шар не має знати про
 * комору й одиниці Харчування. `formatReceiptQty` лишається у shared, бо
 * позиції чека показує ще й Фінік.
 */
import { formatNumberUk } from "@sergeant/shared";
import {
  displayDecimalsFor,
  pantryQtyNatural,
} from "@sergeant/nutrition-domain";
import { formatReceiptQty } from "@shared/lib/format/receiptQty";

/** Нерозривний — «1,87 л» не має ламатись на два рядки. */
const NBSP = "\u00a0";

/**
 * Навіщо окремо від `formatReceiptQty`: базова одиниця зручна для
 * арифметики (сума варіантів — це просто сума чисел), але не для читання.
 * Місячна закупівля молока в базовій одиниці це «20 000 мл» — число, яке
 * читається як помилка вводу. Поріг переходу — 1000, той самий, що вже
 * показує список покупок (`fromBaseNatural`), тож дві поверхні на тих самих
 * даних не малюють різні числа.
 *
 * Одне правило працює на обох рівнях картки продукту без окремої гілки:
 * сума виїжджає в літри, а окремі покупки (зазвичай менші за літр)
 * лишаються в мілілітрах — рівно те, що потрібно, щоб їх було видно як
 * доданки суми зверху.
 *
 * Точність — до сотих для `кг`/`л` (як у списку покупок) і ціле для
 * `г`/`мл`/`шт`. Хвостові нулі прибирає `formatNumberUk`: «1,5 л», не
 * «1,50 л».
 *
 * Фолбек на `formatReceiptQty` — не запобіжник, а нормальний шлях: у полі
 * `unit` позиції з чека без варіантів лежить ФАСУВАННЯ («0,25л»), а не
 * одиниця виміру, і зводити його до побутової шкали не можна.
 */
export function formatPantryQty(
  qty: number | null | undefined,
  unit: string | null | undefined,
): string | null {
  const natural = pantryQtyNatural(qty, unit);
  if (!natural) return formatReceiptQty(qty, unit);
  const amount = formatNumberUk(natural.value, {
    maximumFractionDigits: displayDecimalsFor(natural.unit),
  });
  return `${amount}${NBSP}${natural.unit}`;
}
