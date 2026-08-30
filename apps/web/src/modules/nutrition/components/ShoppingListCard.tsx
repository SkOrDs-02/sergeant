/**
 * Last validated: 2026-08-18
 * Status: Active
 */
import { useState } from "react";
import { pluralDays } from "@sergeant/shared";
import type {
  AtHomeShoppingItem,
  ShoppingItemWithCalc,
} from "@sergeant/nutrition-domain";
import { Card } from "@shared/components/ui/Card";
import { Button } from "@shared/components/ui/Button";
import { cn } from "@shared/lib/ui/cn";
import { openHubModule } from "@shared/lib/modules/hubNav";
import { messages } from "@shared/i18n/uk";
import { getTotalCount } from "../lib/shoppingListStorage";
import { useShoppingListPantryMath } from "../hooks/useShoppingListPantryMath";
import { SilpoCartEntry } from "./SilpoCartEntry";
import type {
  PantryItem,
  ShoppingItem,
  ShoppingList,
} from "@sergeant/nutrition-domain";
import type { NutritionWeekPlan } from "../hooks/useNutritionUiState";
import { Icon, type IconName } from "@shared/components/ui/Icon";
import { foldApostrophes } from "@sergeant/shared";

// Іконка групи в списку покупок. До 2026-08-03 тут лежали emoji, які
// малювалися системним шрифтом: «🫒» на Windows деградувало в порожній
// прямокутник, а «🥦» на старому Android — у чорно-білий гліф.
const CATEGORY_ICONS: Record<string, IconName> = {
  "Мʼясо та риба": "utensils",
  "Молочні продукти": "droplet",
  Овочі: "leaf",
  "Овочі та гриби": "leaf",
  Фрукти: "leaf",
  "Крупи та злаки": "package",
  "Хлібобулочні вироби": "package",
  Яйця: "egg",
  "Олії та жири": "droplet",
  "Приправи та соуси": "utensils",
  Напої: "coffee",
  Інше: "shopping-cart",
  "Закінчується вдома": "trending-down",
};

function getCategoryIcon(name: string): IconName {
  // Назву категорії віддає модель за промптом сервера
  // (`shopping-list.ts`), тобто апостроф у ній не гарантований. Ключі тут
  // канонічні (§1.10), тож звіряємо згорнутими формами — інакше
  // «М'ясо та риба» з ASCII-апострофом мовчки падає у дефолтний кошик.
  const folded = foldApostrophes(name);
  const key = Object.keys(CATEGORY_ICONS).find(
    (k) => foldApostrophes(k) === folded,
  );
  return (key && CATEGORY_ICONS[key]) || "shopping-cart";
}

const pm = messages.nutrition.shoppingListPantryMath;

interface ShoppingItemRowProps {
  item: ShoppingItemWithCalc;
  categoryName: string;
  onToggleItem: (categoryName: string, itemId: string) => void;
}

/** Активна позиція — клікабельна, як і раніше; довлита low-stock позиція — інформаційна. */
function ShoppingItemRow({
  item,
  categoryName,
  onToggleItem,
}: ShoppingItemRowProps) {
  const isLowStockSuggestion = item.calcSource === "pantry-low-stock";

  if (isLowStockSuggestion) {
    return (
      <div className="w-full px-3 py-2.5 flex items-start gap-3 text-left min-h-[44px]">
        <span
          className="shrink-0 w-5 h-5 mt-0.5 rounded-full border-2 border-dashed border-line/60"
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          <span className="text-style-label text-subtle">{item.name}</span>
          <span className="ml-1.5 inline-flex items-center gap-1 text-style-caption text-warning-strong dark:text-warning">
            <Icon name="trending-down" size={12} aria-hidden />
            {pm.lowStockBadge}
          </span>
        </div>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => onToggleItem(categoryName, item.id)}
      className={cn(
        "w-full px-3 py-2.5 flex items-start gap-3 text-left transition-colors min-h-[44px]",
        "hover:bg-nutrition/5 active:bg-nutrition/10",
        item.checked && "opacity-50",
      )}
    >
      <span
        className={cn(
          "shrink-0 w-5 h-5 mt-0.5 rounded-full border-2 flex items-center justify-center transition-colors",
          item.checked ? "bg-nutrition border-nutrition" : "border-line",
        )}
        aria-hidden
      >
        {item.checked && (
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
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
            "text-style-label text-text",
            item.checked && "line-through",
          )}
        >
          {item.name}
        </span>
        {item.quantity && (
          <span className="ml-1.5 text-style-caption text-muted">
            {item.quantity}
          </span>
        )}
        {item.note && (
          <div className="text-style-caption text-muted mt-0.5">
            {item.note}
          </div>
        )}
        {item.calcNote && (
          <div className="text-style-caption text-subtle mt-0.5">
            {item.calcNote}
          </div>
        )}
      </div>
    </button>
  );
}

interface AtHomeSectionProps {
  items: AtHomeShoppingItem[];
}

/** Секція «Вже вдома» — коморі вистачає, купувати не треба; згорнута за замовчуванням. */
function AtHomeSection({ items }: AtHomeSectionProps) {
  const [open, setOpen] = useState(false);
  if (items.length === 0) return null;
  return (
    <div className="rounded-2xl border border-line bg-bg/30 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full px-3 py-2 min-h-[44px] flex items-center gap-1.5 border-b border-line/40 bg-panel/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/45 focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
        aria-expanded={open}
      >
        <Icon
          name="chevron-right"
          size="sm"
          className={cn("transition-transform shrink-0", open && "rotate-90")}
          aria-hidden
        />
        <Icon
          name="check-circle"
          size="md"
          className="text-nutrition shrink-0"
          aria-hidden
        />
        <span className="text-style-caption text-text">
          {pm.athomeSectionLabel}
        </span>
        <span className="text-style-caption text-muted ml-auto">
          {items.length}
        </span>
      </button>
      {open && (
        <div className="divide-y divide-line/30">
          <div className="px-3 py-2 text-style-caption text-subtle">
            {pm.athomeSectionHint}
          </div>
          {items.map((item) => (
            <div
              key={item.id}
              className="w-full px-3 py-2.5 flex items-start gap-3 text-left opacity-60 min-h-[44px]"
            >
              <span
                className="shrink-0 w-5 h-5 mt-0.5 rounded-full bg-nutrition/20 flex items-center justify-center"
                aria-hidden
              >
                <Icon
                  name="check-circle"
                  size={12}
                  className="text-nutrition"
                  aria-hidden
                />
              </span>
              <div className="min-w-0 flex-1">
                <span className="text-style-label text-text">{item.name}</span>
                {item.quantity && (
                  <span className="ml-1.5 text-style-caption text-muted">
                    {item.quantity}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
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
  pantryItems,
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
  const pantryMath = useShoppingListPantryMath(shoppingList, pantryItems);
  const { calculated } = pantryMath;
  const calculatedCount =
    calculated.categories.reduce((n, c) => n + c.items.length, 0) +
    calculated.athome.length;
  const hasItems = total > 0 || calculatedCount > 0;

  const hasRecipes = Array.isArray(recipes) && recipes.length > 0;
  const hasWeekPlan = (weekPlan?.days?.length ?? 0) > 0;

  const canGenerate =
    (source === "recipes" && hasRecipes) ||
    (source === "weekplan" && hasWeekPlan);

  return (
    <Card className="p-4">
      <div className="text-style-label text-text">Список покупок</div>
      <div className="text-style-caption text-muted mt-0.5">
        AI складає список з рецептів або тижневого плану, автоматично виключаючи
        продукти з комори.
      </div>

      <div className="mt-4 space-y-3">
        <div>
          <div className="text-style-caption text-muted mb-2">
            Джерело для списку
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setSource("recipes")}
              disabled={shoppingBusy}
              className={cn(
                "flex-1 py-2 px-3 rounded-xl text-style-caption border transition-[background-color,border-color,color,opacity]",
                source === "recipes"
                  ? "bg-nutrition-strong text-white border-nutrition"
                  : "border-line text-text hover:border-nutrition/50",
              )}
            >
              <div>Рецепти</div>
              <div className="text-style-caption opacity-70 mt-0.5">
                {hasRecipes ? `${recipes.length} рецептів` : "немає рецептів"}
              </div>
            </button>
            <button
              type="button"
              onClick={() => setSource("weekplan")}
              disabled={shoppingBusy}
              className={cn(
                "flex-1 py-2 px-3 rounded-xl text-style-caption border transition-[background-color,border-color,color,opacity]",
                source === "weekplan"
                  ? "bg-nutrition-strong text-white border-nutrition"
                  : "border-line text-text hover:border-nutrition/50",
              )}
            >
              <div>Тижневий план</div>
              <div className="text-style-caption opacity-70 mt-0.5">
                {hasWeekPlan
                  ? `${weekPlan?.days?.length ?? 0} ${pluralDays(
                      weekPlan?.days?.length ?? 0,
                    )}`
                  : "немає плану"}
              </div>
            </button>
          </div>

          {!canGenerate && (
            <div className="mt-2 text-style-caption text-muted text-center">
              {source === "recipes"
                ? "Спершу згенеруй рецепти у Меню → Рецепти"
                : "Спершу згенеруй тижневий план у Меню → Тижневий план"}
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={() => onGenerate(source)}
          disabled={shoppingBusy || !canGenerate}
          className={cn(
            "text-style-label w-full h-11 rounded-2xl",
            "bg-nutrition-strong text-white hover:bg-nutrition-hover disabled:opacity-50 transition-colors",
          )}
        >
          {shoppingBusy ? "Генерую список…" : "Згенерувати список покупок"}
        </button>

        {hasItems && (
          <>
            <div className="flex items-center justify-between gap-2">
              <div className="text-style-label text-text">
                Список ({checked}/{total})
              </div>
              <div className="flex flex-wrap gap-2 justify-end">
                <SilpoCartEntry shoppingList={shoppingList} />
                {checkedItems.length > 0 && (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={onAddCheckedToPantry}
                  >
                    + До комори
                  </Button>
                )}
                {checked > 0 && (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={onClearChecked}
                  >
                    Видалити позначені
                  </Button>
                )}
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
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

            {pantryMath.available && (
              <button
                type="button"
                onClick={() => pantryMath.setEnabled(!pantryMath.enabled)}
                aria-pressed={pantryMath.enabled}
                className={cn(
                  "w-full min-h-[44px] px-3 py-2 rounded-xl border text-style-caption",
                  "flex items-center justify-between gap-2 transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/45 focus-visible:ring-offset-2 focus-visible:ring-offset-bg",
                  pantryMath.enabled
                    ? "bg-nutrition/10 border-nutrition/40 text-nutrition-strong dark:text-nutrition"
                    : "border-line text-muted",
                )}
              >
                <span>{pm.toggleLabel}</span>
                <span
                  className={cn(
                    "relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors",
                    pantryMath.enabled ? "bg-nutrition-strong" : "bg-line",
                  )}
                  aria-hidden
                >
                  <span
                    className={cn(
                      "absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform",
                      pantryMath.enabled ? "translate-x-4" : "translate-x-0.5",
                    )}
                  />
                </span>
              </button>
            )}

            <div className="space-y-3">
              {calculated.categories.map((cat) => (
                <div
                  key={cat.name}
                  className="rounded-2xl border border-line bg-bg/30 overflow-hidden"
                >
                  <div className="px-3 py-2 border-b border-line/40 bg-panel/40">
                    <div className="flex items-center gap-1.5">
                      <Icon
                        name={getCategoryIcon(cat.name)}
                        size="md"
                        className="text-nutrition shrink-0"
                        aria-hidden
                      />
                      <span className="text-style-caption text-text">
                        {cat.name}
                      </span>
                      <span className="text-style-caption text-muted ml-auto">
                        {cat.items.filter((i) => i.checked).length}/
                        {cat.items.length}
                      </span>
                    </div>
                  </div>
                  <div className="divide-y divide-line/30">
                    {cat.items.map((item) => (
                      <ShoppingItemRow
                        key={item.id}
                        item={item}
                        categoryName={cat.name}
                        onToggleItem={onToggleItem}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <AtHomeSection items={calculated.athome} />
          </>
        )}

        {!hasItems && !shoppingBusy && (
          <div className="rounded-2xl border border-line bg-panel p-4 text-style-label text-muted text-center">
            Список покупок порожній. Вибери джерело і натисни кнопку генерації.
          </div>
        )}

        <button
          type="button"
          onClick={() => openHubModule("finyk", "/analytics")}
          className="w-full text-style-caption text-muted hover:text-text transition-colors pt-1 flex items-center justify-center gap-1.5"
        >
          <Icon name="wallet" size="sm" aria-hidden />
          <span>Скільки витратив на їжу цього місяця?</span>
          <span aria-hidden>→</span>
        </button>
      </div>
    </Card>
  );
}
