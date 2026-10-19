import type { NutritionPhotoItem } from "@shared/api";
import { Button } from "@shared/components/ui/Button";
import { messages } from "@shared/i18n/uk";
import { sumMacrosNullable } from "@sergeant/shared";
import { fmtMacro } from "@sergeant/nutrition-domain";
import { PhotoItemsList } from "../PhotoItemsList";

/** The photo items are the saved rows; their sum is not a separate input. */
export function PhotoMealSummary({
  items,
  onEdit,
}: {
  items: NutritionPhotoItem[];
  onEdit: () => void;
}) {
  const copy = messages.nutrition.photoItems;
  const total = sumMacrosNullable(items.map((item) => item.macros));
  return (
    <section className="mb-4 border-y border-line py-3">
      <PhotoItemsList items={items} fmtMacro={fmtMacro} />
      <div className="mt-3 border-t border-line pt-3">
        <p className="text-style-label text-text">{copy.total}</p>
        <dl className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {(
            [
              [copy.kcalUnit, total.kcal],
              [copy.protein, total.protein_g],
              [copy.fat, total.fat_g],
              [copy.carbs, total.carbs_g],
            ] as const
          ).map(([label, value]) => (
            <div key={label}>
              <dt className="text-style-caption text-muted">{label}</dt>
              <dd className="text-style-body font-semibold tabular-nums text-text">
                {fmtMacro(value)}
              </dd>
            </div>
          ))}
        </dl>
      </div>
      <p className="mt-3 text-style-caption text-muted">{copy.saveHint}</p>
      <Button variant="outline" className="mt-3 w-full" onClick={onEdit}>
        {copy.editCta}
      </Button>
    </section>
  );
}
