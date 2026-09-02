/**
 * Last validated: 2026-06-15
 * Status: Active
 */
import type { Dispatch, SetStateAction } from "react";
import { SectionErrorBoundary } from "@shared/components/ui/SectionErrorBoundary";
import { showUndoToast } from "@shared/lib/ui/undoToast";
import type { useToast } from "@shared/hooks/useToast";
import { PantryCard } from "../components/PantryCard";
import { ShoppingListCard } from "../components/ShoppingListCard";
import { SubTabs } from "../components/SubTabs";
import { BarcodeLookupNotice } from "../components/BarcodeLookupNotice";
import { SilpoPantryReplenishEntry } from "../components/SilpoPantryReplenishEntry";
import type {
  NutritionRecipe,
  NutritionWeekPlan,
} from "../hooks/useNutritionUiState";
import type { useNutritionPantries } from "../hooks/useNutritionPantries";
import type { useShoppingList } from "../hooks/useShoppingList";
import type { PantryBarcodeNotice } from "../hooks/usePantryBarcodeScan";
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
  pantryBarcodeNotice?: PantryBarcodeNotice | null | undefined;
  onRetryPantryBarcode?: (() => void) | undefined;
  onDismissPantryBarcodeNotice?: (() => void) | undefined;
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
  pantryBarcodeNotice,
  onRetryPantryBarcode,
  onDismissPantryBarcodeNotice,
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
        <h1 className="sr-only">Комора</h1>
        <SubTabs
          ariaLabel="Розділи комори"
          value={pantrySubTab}
          onChange={(id) => setPantrySubTab(id as PantrySubTab)}
          tabs={[
            { id: "items", label: "Комора" },
            { id: "shopping", label: "Покупки" },
          ]}
        />
        {pantrySubTab === "items" ? (
          <>
            <div className="flex justify-end">
              <SilpoPantryReplenishEntry
                pantryItems={pantry.pantryItems}
                upsertItem={pantry.upsertItem}
                busy={busy}
              />
            </div>
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
              parsePreview={pantry.parsePreview}
              confirmParsePreview={pantry.confirmParsePreview}
              dismissParsePreview={pantry.dismissParsePreview}
              ambiguousPantryItems={pantry.ambiguousPantryItems}
              resolveAmbiguousPantryItem={pantry.resolveAmbiguousPantryItem}
              dismissAmbiguousPantryItem={pantry.dismissAmbiguousPantryItem}
              rememberAmbiguousChoice={pantry.rememberAmbiguousChoice}
              onScanBarcode={() => {
                setPantryScanStatus("");
                setPantryScannerOpen(true);
              }}
              placeFilter={pantry.placeFilter}
            />
            {pantryScanStatus && !pantryBarcodeNotice && (
              <div className="text-style-caption text-subtle px-1">
                {pantryScanStatus}
              </div>
            )}
            {pantryBarcodeNotice && onDismissPantryBarcodeNotice && (
              <BarcodeLookupNotice
                kind={pantryBarcodeNotice.kind}
                onDismiss={onDismissPantryBarcodeNotice}
                onRetry={onRetryPantryBarcode}
              />
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
