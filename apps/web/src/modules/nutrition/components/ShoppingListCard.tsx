/**
 * Last validated: 2026-08-18
 * Status: Active
 */
import { useMemo, useState } from "react";
import { pluralDays, pluralUa } from "@sergeant/shared";
import type {
  AtHomeShoppingItem,
  ShoppingItemWithCalc,
} from "@sergeant/nutrition-domain";
import { Card } from "@shared/components/ui/Card";
import { EmptyState } from "@shared/components/ui/EmptyState";
import { Button } from "@shared/components/ui/Button";
import { Input } from "@shared/components/ui/Input";
import { cn } from "@shared/lib/ui/cn";
import { openHubModule } from "@shared/lib/modules/hubNav";
import { messages } from "@shared/i18n/uk";
import { NAME_MAX_LEN } from "@shared/lib/text/limits";
import { getTotalCount } from "../lib/shoppingListStorage";
import {
  SHOPPING_RECIPES_MAX,
  buildRecipeOptions,
  pickSelectedRecipes,
} from "../lib/shoppingRecipes";
import type { SavedRecipe } from "../lib/recipeBook";
import { useShoppingListPantryMath } from "../hooks/useShoppingListPantryMath";
import { SilpoCartEntry } from "./SilpoCartEntry";
import { ShoppingRecipePicker } from "./ShoppingRecipePicker";
import type {
  AddShoppingItemInput,
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
const ma = messages.nutrition.shoppingListManualAdd;
const pk = messages.nutrition.shoppingRecipePicker;

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
            <Icon name="trending-down" size="xs" aria-hidden />
            {pm.lowStockBadge}
          </span>
        </div>
      </div>
    );
  }

  return (
    // `aria-pressed` — стан «куплено». Доти він жив ЛИШЕ у візуалі:
    // коло-індикатор нижче має `aria-hidden`, а `opacity-50` і
    // `line-through` скрінрідер не озвучує, тож куплений і некуплений
    // пункт звучали однаково (аудит 2026-09-16, WF-17). `aria-pressed`
    // на кнопці, а не `role="checkbox"`: роль лишається тією самою, тож
    // наявні локатори тестів не зсуваються.
    <button
      type="button"
      aria-pressed={item.checked}
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
                  size="xs"
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
  /** Згенеровані рецепти поточного сеансу. */
  recipes?: unknown[];
  /** Збережені («Мої рецепти»): разом зі згенерованими складають джерело «Рецепти». */
  savedRecipes?: SavedRecipe[];
  /** Збережені ще читаються з книги. */
  savedRecipesBusy?: boolean;
  /** Книгу збережених не вдалося прочитати. */
  savedRecipesError?: boolean;
  weekPlan?: NutritionWeekPlan | null;
  pantryItems?: PantryItem[];
  shoppingList: ShoppingList | null;
  shoppingBusy?: boolean;
  /**
   * `recipes` - позначені в переліку рецепти (лише для джерела «recipes»);
   * без нього хук бере всі згенеровані, як було до вибору.
   */
  onGenerate: (source: string, recipes?: unknown[]) => void | Promise<void>;
  onToggleItem: (categoryName: string, itemId: string) => void;
  onClearChecked: () => void;
  onClearAll: () => void;
  onAddCheckedToPantry: () => void | Promise<void>;
  onAddItem: (input: AddShoppingItemInput) => void;
  checkedItems: ShoppingItem[];
}

export function ShoppingListCard({
  recipes,
  savedRecipes,
  savedRecipesBusy,
  savedRecipesError,
  weekPlan,
  pantryItems,
  shoppingList,
  shoppingBusy,
  onGenerate,
  onToggleItem,
  onClearChecked,
  onClearAll,
  onAddCheckedToPantry,
  onAddItem,
  checkedItems,
}: ShoppingListCardProps) {
  const [source, setSource] = useState("recipes");
  const [manualItemName, setManualItemName] = useState("");
  const trimmedManualName = manualItemName.trim();
  const handleAddManualItem = () => {
    if (!trimmedManualName) return;
    onAddItem({ name: manualItemName });
    setManualItemName("");
  };
  const { total, checked } = getTotalCount(shoppingList);
  const pantryMath = useShoppingListPantryMath(shoppingList, pantryItems);
  const { calculated } = pantryMath;
  const calculatedCount =
    calculated.categories.reduce((n, c) => n + c.items.length, 0) +
    calculated.athome.length;
  const hasItems = total > 0 || calculatedCount > 0;
  // `calculatedCount` залежить від самого тумблера: вимкнув на порожньому
  // сирому списку → довлиті «Закінчується» зникли → `hasItems` став `false`.
  // Тумблер у стані «вимкнено» мусить лишатись видимим незалежно від цього,
  // інакше стан, збережений у LS, не повернути. Увімкнений тумблер без
  // списку нічого не міняє, тож його ховаємо, як і раніше.
  const showPantryToggle =
    pantryMath.available && (hasItems || !pantryMath.enabled);

  // Джерело «Рецепти» - збережені («Мої рецепти») і згенеровані разом;
  // список складається з усіх ПОЗНАЧЕНИХ. Раніше картка бачила лише
  // згенеровані в памʼяті й казала «немає рецептів» при повній книзі.
  const recipeOptions = useMemo(
    () => buildRecipeOptions(savedRecipes ?? [], recipes ?? []),
    [savedRecipes, recipes],
  );
  const allRecipeOptions = useMemo(
    () => [...recipeOptions.saved, ...recipeOptions.generated],
    [recipeOptions],
  );
  const [selectedKeys, setSelectedKeys] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const selectedRecipes = pickSelectedRecipes(allRecipeOptions, selectedKeys);
  const toggleRecipe = (key: string) =>
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else if (
        pickSelectedRecipes(allRecipeOptions, prev).length <
        SHOPPING_RECIPES_MAX
      )
        next.add(key);
      return next;
    });
  const hasRecipes = allRecipeOptions.length > 0;
  const hasWeekPlan = (weekPlan?.days?.length ?? 0) > 0;

  const canGenerate =
    (source === "recipes" && selectedRecipes.length > 0) ||
    (source === "weekplan" && hasWeekPlan);
  const generateHint =
    source === "weekplan"
      ? "Спершу згенеруй тижневий план у Меню → Тижневий план"
      : hasRecipes
        ? pk.pickHint
        : null;

  return (
    <Card className="p-4">
      <div className="text-style-label text-text">Список покупок</div>
      {/* AI-NOTE: caption тут навмисно — це підзаголовок у парі з
          заголовком картки, а не текст, який читають окремо. */}
      <div className="text-style-caption text-muted mt-0.5">
        AI складає список з рецептів або тижневого плану, автоматично виключаючи
        продукти з комори.
      </div>

      <div className="mt-4 space-y-3">
        <div className="flex gap-2 items-center">
          <Input
            value={manualItemName}
            onChange={(e) => setManualItemName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && trimmedManualName) {
                handleAddManualItem();
              }
            }}
            placeholder={ma.placeholder}
            aria-label={ma.inputLabel}
            maxLength={NAME_MAX_LEN}
          />
          <button
            type="button"
            onClick={handleAddManualItem}
            disabled={!trimmedManualName}
            className={cn(
              // `h-11` = 2.75rem; на 320px корінний шрифт 15px дає ~41.25px і
              // провалює 44px-флор, тож pointer-coarse-варіант тримає його
              // явно — той самий патерн, що й «Додати» у `PantryCard`.
              "text-style-label px-4 h-11 pointer-coarse:min-h-[44px] rounded-2xl shrink-0",
              "bg-nutrition-strong text-white hover:bg-nutrition-hover disabled:opacity-50 transition-colors dark:bg-nutrition dark:text-bg dark:hover:bg-nutrition/90",
            )}
          >
            {ma.addCta}
          </button>
        </div>

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
                  ? "bg-nutrition-strong text-white border-nutrition dark:bg-nutrition dark:text-bg"
                  : "border-line text-text hover:border-nutrition/50",
              )}
            >
              <div>Рецепти</div>
              <div className="text-style-caption opacity-80 mt-0.5">
                {hasRecipes
                  ? `${allRecipeOptions.length} ${pluralUa(
                      allRecipeOptions.length,
                      { one: "рецепт", few: "рецепти", many: "рецептів" },
                    )}`
                  : "немає рецептів"}
              </div>
            </button>
            <button
              type="button"
              onClick={() => setSource("weekplan")}
              disabled={shoppingBusy}
              className={cn(
                "flex-1 py-2 px-3 rounded-xl text-style-caption border transition-[background-color,border-color,color,opacity]",
                source === "weekplan"
                  ? "bg-nutrition-strong text-white border-nutrition dark:bg-nutrition dark:text-bg"
                  : "border-line text-text hover:border-nutrition/50",
              )}
            >
              <div>Тижневий план</div>
              <div className="text-style-caption opacity-80 mt-0.5">
                {hasWeekPlan
                  ? `${weekPlan?.days?.length ?? 0} ${pluralDays(
                      weekPlan?.days?.length ?? 0,
                    )}`
                  : "немає плану"}
              </div>
            </button>
          </div>

          {source === "recipes" && (
            <div className="mt-2">
              <ShoppingRecipePicker
                saved={recipeOptions.saved}
                generated={recipeOptions.generated}
                savedBusy={savedRecipesBusy}
                savedError={savedRecipesError}
                selectedKeys={selectedKeys}
                onToggle={toggleRecipe}
                onSelectAll={() =>
                  setSelectedKeys(
                    new Set(
                      allRecipeOptions
                        .slice(0, SHOPPING_RECIPES_MAX)
                        .map((o) => o.key),
                    ),
                  )
                }
                onClear={() => setSelectedKeys(new Set())}
                disabled={shoppingBusy}
              />
            </div>
          )}

          {!canGenerate && generateHint && (
            <div className="mt-2 text-style-caption text-muted text-center">
              {generateHint}
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={() =>
            source === "recipes"
              ? onGenerate(
                  source,
                  selectedRecipes.map((o) => o.source),
                )
              : onGenerate(source)
          }
          disabled={shoppingBusy || !canGenerate}
          className={cn(
            "text-style-label w-full h-11 rounded-2xl",
            "bg-nutrition-strong text-white hover:bg-nutrition-hover disabled:opacity-50 transition-colors dark:bg-nutrition dark:text-bg dark:hover:bg-nutrition/90",
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
                    variant="outline"
                    size="sm"
                    onClick={onAddCheckedToPantry}
                  >
                    + До комори
                  </Button>
                )}
                {checked > 0 && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={onClearChecked}
                  >
                    Видалити позначені
                  </Button>
                )}
                <Button
                  type="button"
                  variant="outline"
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
          </>
        )}

        {showPantryToggle && (
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

        {hasItems && (
          <>
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
          <EmptyState
            compact
            module="nutrition"
            icon={<Icon name="shopping-cart" size="lg" />}
            title="Список покупок порожній"
            description="Вибери джерело і натисни кнопку генерації."
          />
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
