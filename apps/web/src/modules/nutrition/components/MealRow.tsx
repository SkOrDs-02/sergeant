/**
 * Last validated: 2026-05-20
 * Status: Active
 */
import { useEffect, useState } from "react";
import { cn } from "@shared/lib/ui/cn";
import { Button } from "@shared/components/ui/Button";
import { Icon } from "@shared/components/ui/Icon";
import { Measure } from "@shared/components/ui/Measure";
import { type Meal } from "@sergeant/nutrition-domain";
import { getMealThumbnailBlob } from "../lib/mealPhotoStorage";

function MealThumb({ mealId }: { mealId: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let u: string | undefined;
    (async () => {
      const b = await getMealThumbnailBlob(mealId);
      if (b) {
        u = URL.createObjectURL(b);
        setUrl(u);
      }
    })();
    return () => {
      if (u) URL.revokeObjectURL(u);
    };
  }, [mealId]);
  if (!url) return null;
  return (
    <img
      src={url}
      alt=""
      loading="lazy"
      decoding="async"
      width="40"
      height="40"
      className="w-10 h-10 rounded-lg object-cover shrink-0"
    />
  );
}

interface MealRowProps {
  meal: Meal;
  onRemove?: (() => void) | undefined;
  onEdit?: (() => void) | undefined;
}

export function MealRow({ meal, onRemove, onEdit }: MealRowProps) {
  const mac = meal.macros ?? {
    kcal: null,
    protein_g: null,
    fat_g: null,
    carbs_g: null,
  };
  const macroSource = String(meal?.macroSource || "manual");
  const sourceLabel =
    macroSource === "photoAI"
      ? "Сержант"
      : macroSource === "recipeAI"
        ? "рецепт Сержанта"
        : macroSource === "productDb"
          ? "продукт"
          : macroSource === "recipe"
            ? "рецепт"
            : "";
  // Походження КБЖВ текстом у мета-рядку, без значка й гліфа Сержанта
  // (мова H: іконок у рядках немає).
  const meta = [
    meal.time,
    meal.amount_g != null && meal.amount_g > 0
      ? `${Math.round(meal.amount_g)} г`
      : null,
    sourceLabel || null,
  ].filter(Boolean);
  return (
    <div className="flex items-center gap-3 py-2.5 group">
      <MealThumb mealId={meal.id} />
      <button
        type="button"
        onClick={onEdit}
        disabled={!onEdit}
        className={cn(
          "flex flex-1 min-w-0 items-baseline gap-3 rounded-lg text-left focus-ring",
          onEdit ? "cursor-pointer" : "cursor-default",
        )}
        aria-label={onEdit ? "Редагувати запис" : undefined}
      >
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-style-body font-semibold text-text truncate">
            {meal.name}
          </span>
          <span className="flex flex-wrap gap-x-2 text-style-caption text-muted">
            {meta.map((part) => (
              <span
                key={part as string}
                title={part === sourceLabel ? "Походження КБЖВ" : undefined}
              >
                {part}
              </span>
            ))}
            {mac.protein_g != null && (
              <span>
                Б <Measure value={Math.round(mac.protein_g)} unit="г" />
              </span>
            )}
            {mac.fat_g != null && (
              <span>
                Ж <Measure value={Math.round(mac.fat_g)} unit="г" />
              </span>
            )}
            {mac.carbs_g != null && (
              <span>
                В <Measure value={Math.round(mac.carbs_g)} unit="г" />
              </span>
            )}
          </span>
        </span>
        {mac.kcal != null && (
          <Measure
            value={Math.round(mac.kcal)}
            unit="ккал"
            tone="inherit"
            className="shrink-0 text-style-body font-medium text-text tabular-nums"
          />
        )}
      </button>
      <Button
        variant="ghost"
        size="xs"
        iconOnly
        onClick={onRemove}
        aria-label="Видалити запис"
        className="text-muted hover:text-danger-strong sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-focus/45"
      >
        <Icon name="close" size="sm" aria-hidden />
      </Button>
    </div>
  );
}
