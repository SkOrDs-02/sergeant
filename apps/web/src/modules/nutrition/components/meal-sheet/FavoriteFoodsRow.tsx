/**
 * Last validated: 2026-11-19
 * Status: Active
 *
 * Блок «Улюблені» на вкладці «Пошук» (OD-27 Х-3 б, рішення власника
 * 2026-11-19): згорнутий, нижче за «Нещодавні», лише поки запит порожній.
 * Перші 8 позначених продуктів у порядку позначення (новіші першими) — те
 * саме число, що в «Моїх рецептах» (`RecipesFromBookRow`). Решта не
 * ховається мовчки: підпис згорнутого блоку каже, скільки їх, а підказка —
 * що в пошуку вони стоять першими. Немає позначених — блоку немає.
 *
 * Тап — той самий шлях, що хіт пошуку (`startPickedFood`): картка «скільки
 * зʼїв» із побутовою порцією і вагою минулого запису; одним тапом у журнал
 * нічого не пишеться.
 */
import { pluralUa } from "@sergeant/shared";
import { CollapsibleSection } from "@shared/components/ui/CollapsibleSection";
import { nutritionFavoritesMessages as COPY } from "@shared/i18n/uk.nutritionFavorites";
import type { FoodProduct } from "../../lib/foodDb/foodDb";
import { ADD_MEAL_SECTION_KEYS } from "./addMealSections";
import { FoodHitRow } from "./FoodHitRow";

const SHOWN_FAVORITES = 8;

export function FavoriteFoodsRow({
  foods,
  onPick,
}: {
  foods: readonly FoodProduct[];
  onPick: (food: FoodProduct) => void;
}) {
  if (foods.length === 0) return null;
  return (
    <CollapsibleSection
      storageKey={ADD_MEAL_SECTION_KEYS.favorites}
      title={COPY.section}
      headingSize="md"
      defaultOpen={false}
      collapsedSubtitle={pluralUa(foods.length, COPY.sectionCount).replace(
        "{n}",
        String(foods.length),
      )}
      className="mb-4 min-w-0"
    >
      <ul
        aria-label={COPY.listAria}
        className="divide-y divide-line border-y border-line"
      >
        {foods.slice(0, SHOWN_FAVORITES).map((f) => (
          <FoodHitRow key={f.id} p={f} onPick={() => onPick(f)} />
        ))}
      </ul>
      {foods.length > SHOWN_FAVORITES && (
        <p className="mt-2 text-style-caption text-muted">
          {COPY.moreInSearch}
        </p>
      )}
    </CollapsibleSection>
  );
}
