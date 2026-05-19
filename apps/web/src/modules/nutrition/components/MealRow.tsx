/**
 * Last validated: 2026-05-20
 * Status: Active
 */
import { useEffect, useState } from "react";
import { cn } from "@shared/lib/ui/cn";
import { Badge } from "@shared/components/ui/Badge";
import { Button } from "@shared/components/ui/Button";
import { Icon } from "@shared/components/ui/Icon";
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
  // 6.4: AI-sourced entries (photoAI / recipeAI) get the nutrition-tinted
  // sparkles badge — same recipe as Finyk tx-rows (#3048 / 6.1). `productDb`
  // is a deterministic lookup, not AI inference, so it keeps the neutral
  // soft tone without the sparkles icon.
  const isAiSourced = macroSource === "photoAI" || macroSource === "recipeAI";
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
              variant={isAiSourced ? "nutrition" : "neutral"}
              tone="soft"
              size="xs"
              className="shrink-0 inline-flex items-center gap-1 rounded-full uppercase tracking-wider"
              title="Походження КБЖВ"
            >
              {isAiSourced && <Icon name="sparkles" size={10} aria-hidden />}
              <span>{sourceLabel}</span>
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
      <Button
        variant="ghost"
        size="xs"
        iconOnly
        onClick={onRemove}
        aria-label="Видалити запис"
        className="text-muted hover:text-danger hover:bg-danger/10 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-focus/45"
      >
        ✕
      </Button>
    </div>
  );
}
