/**
 * Last validated: 2026-05-14
 * Status: Active
 */
import { Icon } from "@shared/components/ui/Icon";
import { Measure } from "@shared/components/ui/Measure";
interface FoodHitRowProduct {
  name?: string | null;
  brand?: string | null;
  per100?: {
    kcal?: number | null;
    protein_g?: number | null;
    fat_g?: number | null;
    carbs_g?: number | null;
  };
}

interface FoodHitRowProps {
  p: FoodHitRowProduct;
  /**
   * Підпис зовнішньої бази («Open Food Facts», «USDA», «Сільпо») — коли
   * заданий, рядок несе `Icon`-позначку зовнішнього джерела з цим
   * `title`. Раніше це був boolean `externalSource` із зашитим
   * OFF-підписом, але `FoodSearchProduct.source` тепер трьохзначний
   * (`off | usda | silpo`) — підпис приходить від викликача.
   */
  externalSourceLabel?: string | undefined;
  onPick: () => void;
}

export function FoodHitRow({
  p,
  externalSourceLabel,
  onPick,
}: FoodHitRowProps) {
  return (
    <li>
      <button
        type="button"
        className="w-full text-left px-3 py-2.5 hover:bg-panelHi/60 active:bg-panelHi transition-colors"
        onClick={onPick}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="text-style-label text-text truncate">
            {[p.name, p.brand].filter(Boolean).join(" · ")}
            {externalSourceLabel && (
              <Icon
                name="link"
                size="xs"
                className="ml-1 inline-block align-baseline text-subtle"
                title={externalSourceLabel}
              />
            )}
          </div>
          <Measure
            value={Math.round(p.per100?.kcal || 0)}
            unit="ккал"
            tone="inherit"
            className="text-style-caption text-nutrition-strong dark:text-nutrition shrink-0"
          />
        </div>
        <div className="text-style-caption text-subtle mt-0.5">
          Б <Measure value={Math.round(p.per100?.protein_g || 0)} unit="г" /> ·
          Ж <Measure value={Math.round(p.per100?.fat_g || 0)} unit="г" /> · В{" "}
          <Measure value={Math.round(p.per100?.carbs_g || 0)} unit="г" />{" "}
          <span className="opacity-60">на 100 г</span>
        </div>
      </button>
    </li>
  );
}
