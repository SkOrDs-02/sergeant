/**
 * Last validated: 2026-10-08
 * Status: Active
 */
import type { ComponentProps } from "react";
import { Button } from "@shared/components/ui/Button";
import { messages } from "@shared/i18n/uk";
import type { Meal } from "@sergeant/nutrition-domain";
import type { PickedFood } from "./FoodPickerSection";
import { BarcodeSection } from "./BarcodeSection";
import { ManualEntryTab } from "./ManualEntryTab";
import { PhotoStep } from "./PhotoStep";
import { SearchTabPanel } from "./SearchTabPanel";
import { SourceTabs, type SourceTabId } from "./SourceTabs";

interface SourceStepProps {
  yesterdayMeals: readonly Meal[];
  onCopyYesterday?: (() => void) | undefined;
  sourceTab: SourceTabId;
  onTabChange: (tab: SourceTabId) => void;
  search: ComponentProps<typeof SearchTabPanel>;
  barcode: ComponentProps<typeof BarcodeSection>;
  onPhotoApply: ComponentProps<typeof PhotoStep>["onApply"];
  onPackageCreated: (product: PickedFood, grams: string) => void;
  onWholeMeal: () => void;
}

/**
 * Крок «Звідки страва?» аркуша `AddMealSheet`: вкладки джерел і їхні панелі.
 * Винесено з `AddMealSheet` під стелю Hard Rule #18 (поведінка не змінена).
 */
export function SourceStep({
  yesterdayMeals,
  onCopyYesterday,
  sourceTab,
  onTabChange,
  search,
  barcode,
  onPhotoApply,
  onPackageCreated,
  onWholeMeal,
}: SourceStepProps) {
  return (
    <>
      {onCopyYesterday && yesterdayMeals.length > 0 && (
        <Button
          type="button"
          variant="outline"
          className="mb-3 w-full min-h-[44px]"
          onClick={onCopyYesterday}
        >
          {messages.nutrition.addMeal.copyYesterday} ({yesterdayMeals.length})
        </Button>
      )}
      <SourceTabs active={sourceTab} onChange={onTabChange} />

      {sourceTab === "search" && (
        <div
          role="tabpanel"
          id="source-panel-search"
          aria-labelledby="source-tab-search"
        >
          <SearchTabPanel {...search} />
        </div>
      )}

      {sourceTab === "scan" && (
        <div
          role="tabpanel"
          id="source-panel-scan"
          aria-labelledby="source-tab-scan"
        >
          <BarcodeSection {...barcode} />
        </div>
      )}

      {sourceTab === "photo" && (
        <div
          role="tabpanel"
          id="source-panel-photo"
          aria-labelledby="source-tab-photo"
        >
          <PhotoStep onApply={onPhotoApply} />
        </div>
      )}

      {sourceTab === "manual" && (
        <div
          role="tabpanel"
          id="source-panel-manual"
          aria-labelledby="source-tab-manual"
        >
          <ManualEntryTab
            onCreated={onPackageCreated}
            onWholeMeal={onWholeMeal}
          />
        </div>
      )}
    </>
  );
}
