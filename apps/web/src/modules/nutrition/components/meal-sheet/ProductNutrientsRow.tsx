/**
 * ProductNutrientsRow — нутрієнти понад КБЖВ у картці звʼязаного продукту.
 *
 * ПЕРЕГЛЯД, І ТІЛЬКИ. Рішення власника 2026-09-11 (знахідка N9): показуємо
 * клітковину, цукри, насичені жири й сіль у картці продукту — без цілей по
 * них, без підсумку за день і без зміни моделі прийому їжі. Тому тут немає
 * жодного відсотка від норми: щойно зʼявиться цифра «12% денної норми»,
 * знадобиться і сама норма, і денний підсумок, а це вже етап 4 аудиту —
 * контрактна зміна `NullableMacros`, дуал-райту і бекапів.
 *
 * AI-DANGER: `nutrients` живе в `PickedFood` — ЛИШЕ у в'юмоделі аркуша, не
 * в `FoodProduct`. `FoodProduct` пишеться в локальну базу їжі і їде в
 * бекапи, тож поле там означало б міграцію локального сховища. Тут дані
 * транзитні: приїхали з відповіді на скан і живуть до закриття аркуша.
 * Не «підніми» їх у `FoodProduct` заради зручності.
 *
 * ДВА РІЗНІ «НЕМАЄ», і вони показуються по-різному:
 *   ключа `nutrients` немає   — джерело таких даних не віддає (Сільпо,
 *                               UPCitemdb). Рядок не рендериться взагалі.
 *   поле всередині `null`     — спитали, у цій картці немає. Стоїть тире.
 * Розбір різниці — у `ProductNutrientsSchema` (`@sergeant/shared/schemas`).
 *
 * Status: Active
 * Last validated: 2026-09-13
 */
import { Measure } from "@shared/components/ui/Measure";
import { messages } from "@shared/i18n/uk";
import type { ProductNutrients } from "@sergeant/shared";

const t = messages.nutrition.productNutrients;

/**
 * Спирт у списку відсутній навмисно: він приїжджає в тому самому обʼєкті,
 * але потрібен воротам Атвотера на сервері, а не людині в картці
 * (`productCatalog.ts`, AI-DANGER про `alcohol_100g`).
 *
 * «Сіль», а не «натрій»: саме сіль друкують на етикетці в ЄС і Україні, і
 * саме її віддає OFF. Показати натрій означало б перерахувати ÷2.5 і
 * розійтися з пачкою, яку людина тримає в руці.
 */
const NUTRIENT_FIELDS = [
  { key: "fiber_100g", label: t.fiber },
  { key: "sugars_100g", label: t.sugars },
  { key: "saturatedFat_100g", label: t.saturatedFat },
  { key: "salt_100g", label: t.salt },
] as const satisfies ReadonlyArray<{
  key: keyof ProductNutrients;
  label: string;
}>;

interface ProductNutrientsRowProps {
  nutrients: ProductNutrients;
}

export function ProductNutrientsRow({ nutrients }: ProductNutrientsRowProps) {
  // Рядок лише зі самих тире нічого не повідомляє, а місце в аркуші займає.
  // Спирт у цю перевірку не входить — його ми не показуємо, тож картка,
  // де є ТІЛЬКИ він, для людини порожня.
  const hasAny = NUTRIENT_FIELDS.some(({ key }) => nutrients[key] != null);
  if (!hasAny) return null;

  return (
    <div className="px-4 pb-3">
      <dl className="flex flex-wrap gap-x-3 gap-y-1 text-style-caption text-subtle">
        {NUTRIENT_FIELDS.map(({ key, label }) => {
          const value = nutrients[key];
          return (
            <div key={key} className="flex items-baseline gap-1">
              <dt>{label}</dt>
              <dd className="text-text">
                {value == null ? (
                  // `aria-label` окремо: саме тире скрінрідер читає як
                  // «тире» або мовчить залежно від рушія, і людина не
                  // дізнається, що дані просто відсутні.
                  <span aria-label={t.noData}>—</span>
                ) : (
                  <Measure value={value} unit={t.gram} />
                )}
              </dd>
            </div>
          );
        })}
        <div className="opacity-60">{t.per100}</div>
      </dl>
    </div>
  );
}
