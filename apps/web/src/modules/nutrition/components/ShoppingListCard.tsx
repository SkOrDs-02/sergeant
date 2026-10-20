/**
 * Last validated: 2026-08-18
 * Status: Active
 */
import { MorphChevron } from "@shared/components/ui/MorphChevron";
import { useId, useMemo, useState } from "react";
import { pluralDays, pluralUa } from "@sergeant/shared";
import type {
  AtHomeShoppingItem,
  ShoppingItemWithCalc,
} from "@sergeant/nutrition-domain";
import { Card } from "@shared/components/ui/Card";
import { EmptyState } from "@shared/components/ui/EmptyState";
import { SectionHeading } from "@shared/components/ui/SectionHeading";
import { Button } from "@shared/components/ui/Button";
import { ChoiceGroup } from "@shared/components/ui/Choice";
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
      <div className="w-full py-2.5 flex items-start gap-3 text-left min-h-[44px]">
        <span
          className="shrink-0 w-5 h-5 mt-0.5 rounded-[5px] border border-dashed border-border-strong"
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          <span className="text-style-body font-semibold text-subtle">
            {item.name}
          </span>
          <div className="text-style-caption text-muted">
            {pm.lowStockBadge}
          </div>
        </div>
      </div>
    );
  }

  return (
    // `aria-pressed` — стан «куплено». Доти він жив ЛИШЕ у візуалі:
    // чекбокс-індикатор нижче має `aria-hidden`, а `opacity-50` і
    // `line-through` скрінрідер не озвучує, тож куплений і некуплений
    // пункт звучали однаково (аудит 2026-09-16, WF-17). `aria-pressed`
    // на кнопці, а не `role="checkbox"`: роль лишається тією самою, тож
    // наявні локатори тестів не зсуваються.
    <button
      type="button"
      aria-pressed={item.checked}
      onClick={() => onToggleItem(categoryName, item.id)}
      className={cn(
        "w-full py-2.5 flex items-start gap-3 text-left transition-colors min-h-[44px]",
        "hover:bg-line/40 focus-ring",
        item.checked && "opacity-50",
      )}
    >
      <span
        className={cn(
          "shrink-0 w-5 h-5 mt-0.5 rounded-[5px] border-2 flex items-center justify-center transition-colors",
          item.checked ? "bg-text border-text text-bg" : "border-border-strong",
        )}
        aria-hidden
      >
        {item.checked && (
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <path
              d="M2 5l2.5 2.5L8 2.5"
              stroke="currentColor"
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
            "text-style-body font-semibold text-text",
            item.checked && "line-through",
          )}
        >
          {item.name}
        </span>
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
      {item.quantity && (
        <span className="shrink-0 text-style-body font-medium text-text tabular-nums">
          {item.quantity}
        </span>
      )}
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
    <section>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full min-h-[44px] flex items-baseline gap-2 rounded-lg focus-ring text-left"
        aria-expanded={open}
      >
        <SectionHeading as="span" size="md" variant="muted">
          {pm.athomeSectionLabel}
        </SectionHeading>
        <span className="text-style-caption text-subtle tabular-nums ml-auto">
          {items.length}
        </span>
        <MorphChevron open={open} className="text-subtle" />
      </button>
      {open && (
        <div className="divide-y divide-line border-t border-line">
          <div className="py-2 text-style-caption text-subtle">
            {pm.athomeSectionHint}
          </div>
          {items.map((item) => (
            <div
              key={item.id}
              className="w-full py-2.5 flex items-start gap-3 text-left opacity-60 min-h-[44px]"
            >
              <span className="min-w-0 flex-1 text-style-body font-semibold text-text">
                {item.name}
              </span>
              {item.quantity && (
                <span className="shrink-0 text-style-body font-medium text-text tabular-nums">
                  {item.quantity}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
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
  const [source, setSource] = useState<"recipes" | "weekplan">("recipes");
  const sourceLabelId = useId();
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
      <SectionHeading as="h2" size="lg">
        Список покупок
      </SectionHeading>
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
          <Button
            type="button"
            variant="solid"
            onClick={handleAddManualItem}
            disabled={!trimmedManualName}
            // `h-11` = 2.75rem; на 320px корінний шрифт 15px дає ~41.25px і
            // провалює 44px-флор, тож pointer-coarse-варіант тримає його
            // явно — той самий патерн, що й «Додати» у `PantryCard`.
            className="shrink-0 pointer-coarse:min-h-[44px]"
          >
            {ma.addCta}
          </Button>
        </div>

        <div>
          <div id={sourceLabelId} className="text-style-label text-muted mb-1">
            Джерело для списку
          </div>
          <ChoiceGroup
            variant="rows"
            ariaLabelledBy={sourceLabelId}
            className="border-y border-line"
            value={source}
            onChange={setSource}
            disabled={shoppingBusy}
            items={[
              {
                value: "recipes",
                label: "Рецепти",
                description: hasRecipes
                  ? `${allRecipeOptions.length} ${pluralUa(
                      allRecipeOptions.length,
                      { one: "рецепт", few: "рецепти", many: "рецептів" },
                    )}`
                  : "немає рецептів",
              },
              {
                value: "weekplan",
                label: "Тижневий план",
                description: hasWeekPlan
                  ? `${weekPlan?.days?.length ?? 0} ${pluralDays(
                      weekPlan?.days?.length ?? 0,
                    )}`
                  : "немає плану",
              },
            ]}
          />

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

        <Button
          type="button"
          variant="solid"
          onClick={() =>
            source === "recipes"
              ? onGenerate(
                  source,
                  selectedRecipes.map((o) => o.source),
                )
              : onGenerate(source)
          }
          disabled={shoppingBusy || !canGenerate}
          className="w-full pointer-coarse:min-h-[44px]"
        >
          {shoppingBusy ? "Генерую список…" : "Згенерувати список покупок"}
        </Button>

        {hasItems && (
          <>
            <div className="flex items-center justify-between gap-2">
              <SectionHeading as="div" size="md">
                Список ({checked}/{total})
              </SectionHeading>
              <div className="flex flex-wrap gap-2 justify-end">
                <SilpoCartEntry shoppingList={shoppingList} />
                {checkedItems.length > 0 && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={onAddCheckedToPantry}
                  >
                    До комори
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
              <div className="h-[5px] rounded-[3px] bg-line overflow-hidden">
                <div
                  className="h-full rounded-[3px] bg-chart-nutrition transition-[width,background-color]"
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
              "w-full min-h-[44px] px-3 py-2 rounded-lg border border-border-strong text-style-label",
              "flex items-center justify-between gap-2 transition-colors hover:bg-line/40 focus-ring",
              // Увімкнено: нейтральна заливка, не hue модуля.
              pantryMath.enabled ? "bg-line/60 text-text" : "text-muted",
            )}
          >
            <span>{pm.toggleLabel}</span>
            <span
              className={cn(
                "relative inline-flex h-5 w-9 shrink-0 rounded-[7px] transition-colors",
                pantryMath.enabled ? "bg-text" : "bg-control",
              )}
              aria-hidden
            >
              <span
                className={cn(
                  "absolute top-0.5 h-4 w-4 rounded-[5px] bg-bg transition-transform",
                  pantryMath.enabled ? "translate-x-4" : "translate-x-0.5",
                )}
              />
            </span>
          </button>
        )}

        {hasItems && (
          <>
            <div className="space-y-5">
              {calculated.categories.map((cat) => (
                <section key={cat.name}>
                  <SectionHeading
                    as="div"
                    size="md"
                    className="pb-1"
                    meta={
                      <span className="text-style-caption">
                        {cat.items.filter((i) => i.checked).length}/
                        {cat.items.length}
                      </span>
                    }
                  >
                    {cat.name}
                  </SectionHeading>
                  <div className="divide-y divide-line border-t border-line">
                    {cat.items.map((item) => (
                      <ShoppingItemRow
                        key={item.id}
                        item={item}
                        categoryName={cat.name}
                        onToggleItem={onToggleItem}
                      />
                    ))}
                  </div>
                </section>
              ))}
            </div>

            <AtHomeSection items={calculated.athome} />
          </>
        )}

        {!hasItems && !shoppingBusy && (
          <EmptyState compact title="Список покупок порожній" />
        )}

        <button
          type="button"
          onClick={() => openHubModule("finyk", "/analytics")}
          className="w-full min-h-[44px] rounded-lg text-style-label font-semibold text-text hover:bg-line/40 transition-colors focus-ring"
        >
          Витрати на їжу за місяць
        </button>
      </div>
    </Card>
  );
}
