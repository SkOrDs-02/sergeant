import { useEffect, useState } from "react";
import { cn } from "@shared/lib/ui/cn";
import { Badge } from "@shared/components/ui/Badge";
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
      className="w-10 h-10 rounded-xl object-cover shrink-0 border border-line"
    />
  );
}

interface MealRowProps {
  meal: Meal;
  onRemove?: () => void;
  onEdit?: () => void;
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
      ? "AI"
      : macroSource === "recipeAI"
        ? "AI-рецепт"
        : macroSource === "productDb"
          ? "DB"
          : "";
  return (
    <div className="flex items-center gap-3 bg-panelHi rounded-2xl px-3 py-2.5 group">
      <MealThumb mealId={meal.id} />
      <button
        type="button"
        onClick={onEdit}
        disabled={!onEdit}
        className={cn(
          "flex flex-col flex-1 min-w-0 text-left",
          onEdit ? "cursor-pointer" : "cursor-default",
        )}
        aria-label={onEdit ? "Редагувати запис" : undefined}
      >
        <div className="flex items-baseline gap-2">
          <span className="text-style-label text-text truncate">
            {meal.name}
          </span>
          {meal.time && (
            <span className="text-xs text-subtle shrink-0">{meal.time}</span>
          )}
          {sourceLabel && (
            <Badge
              variant="neutral"
              tone="soft"
              size="xs"
              className="shrink-0 rounded-full uppercase tracking-wider"
              title="Походження КБЖВ"
            >
              {sourceLabel}
            </Badge>
          )}
        </div>
        <div className="flex gap-2 mt-0.5 flex-wrap">
          {mac.kcal != null && (
            <span className="text-xs text-nutrition-strong dark:text-nutrition font-bold">
              {Math.round(mac.kcal)} ккал
            </span>
          )}
          {mac.protein_g != null && (
            <span className="text-xs text-subtle">
              Б {Math.round(mac.protein_g)}г
            </span>
          )}
          {mac.fat_g != null && (
            <span className="text-xs text-subtle">
              Ж {Math.round(mac.fat_g)}г
            </span>
          )}
          {mac.carbs_g != null && (
            <span className="text-xs text-subtle">
              В {Math.round(mac.carbs_g)}г
            </span>
          )}
        </div>
      </button>
      <button
        type="button"
        onClick={onRemove}
        className="w-8 h-8 flex items-center justify-center rounded-full text-muted hover:text-danger hover:bg-danger/10 transition-colors opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
        aria-label="Видалити запис"
      >
        ✕
      </button>
    </div>
  );
}
