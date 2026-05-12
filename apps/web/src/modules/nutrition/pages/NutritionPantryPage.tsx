import type { Dispatch, SetStateAction } from "react";
import { SectionErrorBoundary } from "@shared/components/ui/SectionErrorBoundary";
import { showUndoToast } from "@shared/lib/ui/undoToast";
import type { useToast } from "@shared/hooks/useToast";
import { PantryCard } from "../components/PantryCard";
import { ShoppingListCard } from "../components/ShoppingListCard";
import { SubTabs } from "../components/SubTabs";
import type {
  NutritionRecipe,
  NutritionWeekPlan,
} from "../hooks/useNutritionUiState";
import type { useNutritionPantries } from "../hooks/useNutritionPantries";
import type { useShoppingList } from "../hooks/useShoppingList";
import type { PantrySubTab } from "../lib/nutritionRouter";

type PantryController = ReturnType<typeof useNutritionPantries>;
type ShoppingController = ReturnType<typeof useShoppingList>;
type Toast = ReturnType<typeof useToast>;

interface NutritionPantryPageProps {
  pantry: PantryController;
  shopping: ShoppingController;
  recipes: NutritionRecipe[];
  weekPlan: NutritionWeekPlan | null;
  shoppingBusy: boolean;
  busy: boolean;
  pantrySubTab: PantrySubTab;
  setPantrySubTab: (id: PantrySubTab) => void;
  pantryScanStatus: string;
  setPantryScanStatus: Dispatch<SetStateAction<string>>;
  setPantryScannerOpen: Dispatch<SetStateAction<boolean>>;
  toast: Toast;
  generateShoppingList: (source: string) => void | Promise<void>;
  addCheckedItemsToPantry: () => void;
}

export function NutritionPantryPage({
  pantry,
  shopping,
  recipes,
  weekPlan,
  shoppingBusy,
  busy,
  pantrySubTab,
  setPantrySubTab,
  pantryScanStatus,
  setPantryScanStatus,
  setPantryScannerOpen,
  toast,
  generateShoppingList,
  addCheckedItemsToPantry,
}: NutritionPantryPageProps) {
  return (
    <SectionErrorBoundary
      key="page-pantry"
      title="Не вдалось показати «Комора»"
    >
      <>
        <SubTabs
          value={pantrySubTab}
          onChange={(id) => setPantrySubTab(id as PantrySubTab)}
          tabs={[
            { id: "items", label: "Склад" },
            { id: "shopping", label: "Покупки" },
          ]}
        />
        {pantrySubTab === "items" ? (
          <>
            <PantryCard
              busy={busy}
              parsePantry={pantry.parsePantry}
              newItemName={pantry.newItemName}
              setNewItemName={pantry.setNewItemName}
              upsertItem={pantry.upsertItem}
              pantryText={pantry.pantryText}
              setPantryText={pantry.setPantryText}
              effectiveItems={pantry.effectiveItems}
              editItemAt={pantry.editItemAt}
              removeItemAtOrByName={(idx, name) => {
                if (pantry.pantryItems.length > 0) {
                  const removed = pantry.pantryItems[idx];
                  pantry.removeItemAt(idx);
                  if (removed) {
                    showUndoToast(toast, {
                      msg: `Прибрано «${removed.name}» з комори`,
                      onUndo: () => pantry.upsertItem(removed),
                    });
                  }
                } else if (name) {
                  pantry.removeItem(name);
                }
              }}
              pantryItemsLength={pantry.pantryItems.length}
              pantrySummary={pantry.pantrySummary}
              onScanBarcode={() => {
                setPantryScanStatus("");
                setPantryScannerOpen(true);
              }}
            />
            {pantryScanStatus && (
              <div className="text-xs text-subtle px-1">{pantryScanStatus}</div>
            )}
          </>
        ) : (
          <ShoppingListCard
            recipes={recipes}
            weekPlan={weekPlan}
            pantryItems={pantry.effectiveItems}
            shoppingList={shopping.shoppingList}
            shoppingBusy={shoppingBusy}
            onGenerate={generateShoppingList}
            onToggleItem={shopping.toggle}
            onClearChecked={shopping.clearChecked}
            onClearAll={shopping.clearAll}
            onAddCheckedToPantry={addCheckedItemsToPantry}
            checkedItems={shopping.checkedItems}
          />
        )}
      </>
    </SectionErrorBoundary>
  );
}
