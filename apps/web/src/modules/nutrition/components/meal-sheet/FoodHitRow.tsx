/**
 * Last validated: 2026-05-14
 * Status: Active
 */
import { Icon } from "@shared/components/ui/Icon";
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
   * Позначка «продукт із зовнішньої бази Open Food Facts». Раніше сюди
   * передавали emoji-рядок «🌍»; тепер це прапорець, а гліф малює `Icon`,
   * тож він тематизується й не залежить від системного emoji-шрифту.
   */
  externalSource?: boolean;
  onPick: () => void;
}

export function FoodHitRow({ p, externalSource, onPick }: FoodHitRowProps) {
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
            {externalSource && (
              <Icon
                name="link"
                size="xs"
                className="ml-1 inline-block align-baseline text-subtle"
                title="Open Food Facts"
              />
            )}
          </div>
          <div className="text-style-caption text-nutrition-strong dark:text-nutrition shrink-0">
            {Math.round(p.per100?.kcal || 0)} ккал
          </div>
        </div>
        <div className="text-xs text-subtle mt-0.5">
          Б {Math.round(p.per100?.protein_g || 0)}г · Ж{" "}
          {Math.round(p.per100?.fat_g || 0)}г · В{" "}
          {Math.round(p.per100?.carbs_g || 0)}г{" "}
          <span className="opacity-60">на 100г</span>
        </div>
      </button>
    </li>
  );
}
