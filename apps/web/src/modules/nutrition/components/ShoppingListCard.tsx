import { useState } from "react";
import { Card } from "@shared/components/ui/Card";
import { Button } from "@shared/components/ui/Button";
import { cn } from "@shared/lib/cn";
import { openHubModule } from "@shared/lib/hubNav";
import { getTotalCount } from "../lib/shoppingListStorage";
import type {
  PantryItem,
  ShoppingCategory,
  ShoppingItem,
  ShoppingList,
} from "@sergeant/nutrition-domain";
import type { NutritionWeekPlan } from "../hooks/useNutritionUiState";

const CATEGORY_ICONS: Record<string, string> = {
  "М'ясо та риба": "🥩",
  "Молочні продукти": "🥛",
  Овочі: "🥦",
  "Овочі та гриби": "🥦",
  Фрукти: "🍎",
  "Крупи та злаки": "🌾",
  "Хлібобулочні вироби": "🍞",
  Яйця: "🥚",
  "Олії та жири": "🫒",
  "Приправи та соуси": "🧂",
  Напої: "🥤",
  Інше: "🛒",
};

function getCategoryIcon(name: string): string {
  return CATEGORY_ICONS[name] || "🛒";
}

interface ShoppingListCardProps {
  recipes?: unknown[];
  weekPlan?: NutritionWeekPlan | null;
  pantryItems?: PantryItem[];
  shoppingList: ShoppingList | null;
  shoppingBusy?: boolean;
  onGenerate: (source: string) => void | Promise<void>;
  onToggleItem: (categoryName: string, itemId: string) => void;
  onClearChecked: () => void;
  onClearAll: () => void;
  onAddCheckedToPantry: () => void | Promise<void>;
  checkedItems: ShoppingItem[];
}

export function ShoppingListCard({
  recipes,
  weekPlan,
  pantryItems: _pantryItems,
  shoppingList,
  shoppingBusy,
  onGenerate,
  onToggleItem,
  onClearChecked,
  onClearAll,
  onAddCheckedToPantry,
  checkedItems,
}: ShoppingListCardProps) {
  const [source, setSource] = useState("recipes");
  const { total, checked } = getTotalCount(shoppingList);
  const hasItems = total > 0;

  const hasRecipes = Array.isArray(recipes) && recipes.length > 0;
  const hasWeekPlan = (weekPlan?.days?.length ?? 0) > 0;

  const canGenerate =
    (source === "recipes" && hasRecipes) ||
    (source === "weekplan" && hasWeekPlan);

  return (
    <Card className="p-4">
      <div className="text-sm font-semibold text-text">Список покупок</div>
      <div className="text-xs text-subtle mt-0.5">
        AI складає список з рецептів або тижневого плану, автоматично виключаючи
        продукти зі складу.
      </div>

      <div className="mt-4 space-y-3">
        <div>
          <div className="text-xs text-subtle mb-2">Джерело для списку</div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setSource("recipes")}
              disabled={shoppingBusy}
              className={cn(
                "flex-1 py-2 px-3 rounded-xl text-xs font-semibold border transition-[background-color,border-color,color,opacity]",
                source === "recipes"
                  ? "bg-nutrition-strong text-white border-nutrition"
                  : "border-line text-text hover:border-nutrition/50",
              )}
            >
              <div>Рецепти</div>
              <div className="text-2xs opacity-70 mt-0.5">
                {hasRecipes ? `${recipes.length} рецептів` : "немає рецептів"}
              </div>
            </button>
            <button
              type="button"
              onClick={() => setSource("weekplan")}
              disabled={shoppingBusy}
              className={cn(
                "flex-1 py-2 px-3 rounded-xl text-xs font-semibold border transition-[background-color,border-color,color,opacity]",
                source === "weekplan"
                  ? "bg-nutrition-strong text-white border-nutrition"
                  : "border-line text-text hover:border-nutrition/50",
              )}
            >
              <div>Тижневий план</div>
              <div className="text-2xs opacity-70 mt-0.5">
                {hasWeekPlan
                  ? `${weekPlan?.days?.length ?? 0} днів`
                  : "немає плану"}
              </div>
            </button>
          </div>

          {!canGenerate && (
            <div className="mt-2 text-xs text-subtle text-center">
              {source === "recipes"
                ? "Спершу згенеруй рецепти у Меню → Рецепти"
                : "Спершу згенеруй тижневий план у Меню → План на день"}
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={() => onGenerate(source)}
          disabled={shoppingBusy || !canGenerate}
          className={cn(
            "w-full h-11 rounded-2xl text-sm font-semibold",
            "bg-nutrition-strong text-white hover:bg-nutrition-hover disabled:opacity-50 transition-colors",
          )}
        >
          {shoppingBusy ? "Генерую список…" : "Згенерувати список покупок"}
        </button>

        {hasItems && (
          <>
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm font-semibold text-text">
                Список ({checked}/{total} ✓)
              </div>
              <div className="flex gap-2">
                {checkedItems.length > 0 && (
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-8 text-xs text-nutrition-strong dark:text-nutrition"
                    onClick={onAddCheckedToPantry}
                  >
                    + До складу
                  </Button>
                )}
                {checked > 0 && (
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-8 text-xs text-subtle"
                    onClick={onClearChecked}
                  >
                    Видалити ✓
                  </Button>
                )}
                <Button
                  type="button"
                  variant="ghost"
                  className="h-8 text-xs text-muted"
                  onClick={onClearAll}
                >
                  Очистити
                </Button>
              </div>
            </div>

            {total > 0 && (
              <div className="h-1.5 rounded-full bg-line overflow-hidden">
                <div
                  className="h-full rounded-full bg-nutrition transition-[width,background-color]"
                  style={{ width: `${Math.round((checked / total) * 100)}%` }}
                />
              </div>
            )}

            <div className="space-y-3">
              {shoppingList!.categories.map((cat: ShoppingCategory) => (
                <div
                  key={cat.name}
                  className="rounded-2xl border border-line bg-bg/30 overflow-hidden"
                >
                  <div className="px-3 py-2 border-b border-line/40 bg-panel/40">
                    <div className="flex items-center gap-1.5">
                      <span className="text-base leading-none" aria-hidden>
                        {getCategoryIcon(cat.name)}
                      </span>
                      <span className="text-xs font-semibold text-text">
                        {cat.name}
                      </span>
                      <span className="text-xs text-muted ml-auto">
                        {
                          cat.items.filter((i: ShoppingItem) => i.checked)
                            .length
                        }
                        /{cat.items.length}
                      </span>
                    </div>
                  </div>
                  <div className="divide-y divide-line/30">
                    {cat.items.map((item: ShoppingItem) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => onToggleItem(cat.name, item.id)}
                        className={cn(
                          "w-full px-3 py-2.5 flex items-start gap-3 text-left transition-colors",
                          "hover:bg-nutrition/5 active:bg-nutrition/10",
                          item.checked && "opacity-50",
                        )}
                      >
                        <span
                          className={cn(
                            "shrink-0 w-5 h-5 mt-0.5 rounded-full border-2 flex items-center justify-center transition-colors",
                            item.checked
                              ? "bg-nutrition border-nutrition"
                              : "border-line",
                          )}
                          aria-hidden
                        >
                          {item.checked && (
                            <svg
                              width="10"
                              height="10"
                              viewBox="0 0 10 10"
                              fill="none"
                            >
                              <path
                                d="M2 5l2.5 2.5L8 2.5"
                                stroke="white"
                                strokeWidth="1.5"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            </svg>
                          )}
                        </span>
                        <div className="min-w-0 flex-1">
                          <span
                            className={cn(
                              "text-sm text-text",
                              item.checked && "line-through",
                            )}
                          >
                            {item.name}
                          </span>
                          {item.quantity && (
                            <span className="ml-1.5 text-xs text-subtle">
                              {item.quantity}
                            </span>
                          )}
                          {item.note && (
                            <div className="text-xs text-muted mt-0.5">
                              {item.note}
                            </div>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {!hasItems && !shoppingBusy && (
          <div className="rounded-2xl border border-line bg-panel p-4 text-sm text-subtle text-center">
            Список покупок порожній. Вибери джерело і натисни кнопку генерації.
          </div>
        )}

        <button
          type="button"
          onClick={() => openHubModule("finyk", "/analytics")}
          className="w-full text-xs text-muted hover:text-text transition-colors pt-1 flex items-center justify-center gap-1.5"
        >
          <span aria-hidden>💸</span>
          <span>Скільки витратив на їжу цього місяця?</span>
          <span aria-hidden>→</span>
        </button>
      </div>
    </Card>
  );
}
