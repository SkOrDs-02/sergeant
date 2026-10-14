/**
 * Last validated: 2026-10-08
 * Status: Active
 */
import { useState, type ComponentProps } from "react";
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
  packageRequest?: number;
  initialSourceChosen?: boolean;
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
  packageRequest = 0,
  initialSourceChosen = false,
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
  const [chooserOpen, setChooserOpen] = useState(!initialSourceChosen);
  const [lastTab, setLastTab] = useState(sourceTab);
  const [visited, setVisited] = useState<SourceTabId[]>(
    initialSourceChosen ? [sourceTab] : [],
  );
  // Переходи зі сканера (фото/ручний ввід) теж означають явний вибір.
  if (lastTab !== sourceTab) {
    setLastTab(sourceTab);
    setChooserOpen(false);
    if (!visited.includes(sourceTab)) setVisited([...visited, sourceTab]);
  }
  function choose(tab: SourceTabId) {
    search.sourcePick.cancelAutoPick();
    setChooserOpen(false);
    if (!visited.includes(tab)) setVisited([...visited, tab]);
    onTabChange(tab);
  }
  return (
    <>
      <SourceTabs
        active={sourceTab}
        expanded={chooserOpen}
        onExpand={() => {
          search.sourcePick.cancelAutoPick();
          setChooserOpen(true);
        }}
        onChange={choose}
      />

      {visited.includes("search") && (
        <div hidden={chooserOpen || sourceTab !== "search"}>
          <SearchTabPanel {...search} />
          {onCopyYesterday && yesterdayMeals.length > 0 && (
            <Button
              type="button"
              variant="outline"
              className="mb-3 w-full min-h-[44px]"
              onClick={onCopyYesterday}
            >
              {messages.nutrition.addMeal.copyYesterday} (
              {yesterdayMeals.length})
            </Button>
          )}
        </div>
      )}

      {visited.includes("scan") && (
        <div hidden={chooserOpen || sourceTab !== "scan"}>
          <BarcodeSection {...barcode} />
        </div>
      )}

      {visited.includes("photo") && (
        <div hidden={chooserOpen || sourceTab !== "photo"}>
          <PhotoStep onApply={onPhotoApply} />
        </div>
      )}

      {visited.includes("manual") && (
        <div hidden={chooserOpen || sourceTab !== "manual"}>
          <ManualEntryTab
            packageRequest={packageRequest}
            onCreated={onPackageCreated}
            onWholeMeal={onWholeMeal}
          />
        </div>
      )}
    </>
  );
}
