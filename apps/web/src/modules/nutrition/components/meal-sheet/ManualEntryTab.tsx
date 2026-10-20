/**
 * Last validated: 2026-10-13
 * Status: Active
 * Два явні шляхи ручного вводу з різною одиницею КБЖВ.
 * Чернетка продукту не демонтується при поверненні до вибору одиниці.
 */
import { useState } from "react";
import { Button } from "@shared/components/ui/Button";
import type { PickedFood } from "./FoodPickerSection";
import { PackageEntryStep } from "./PackageEntryStep";

interface ManualEntryTabProps {
  packageRequest?: number;
  onCreated: (product: PickedFood, grams: string) => void;
  onWholeMeal: () => void;
}
export function ManualEntryTab({
  packageRequest = 0,
  onCreated,
  onWholeMeal,
}: ManualEntryTabProps) {
  const [packageChosen, setPackageChosen] = useState(packageRequest > 0);
  const [packageVisited, setPackageVisited] = useState(packageRequest > 0);
  const [previousRequest, setPreviousRequest] = useState(packageRequest);
  if (previousRequest !== packageRequest) {
    setPreviousRequest(packageRequest);
    setPackageVisited(true);
    setPackageChosen(true);
  }
  return (
    <div className="space-y-3">
      {packageChosen ? (
        <div className="flex min-h-[44px] items-center justify-between gap-3 border-b border-line pb-2">
          <span className="text-style-label text-text">На 100 г</span>
          <Button
            variant="text"
            onClick={() => setPackageChosen(false)}
            aria-label="Змінити одиницю калорійності"
          >
            Змінити
          </Button>
        </div>
      ) : (
        <div className="divide-y divide-line border-y border-line">
          <button
            type="button"
            className="block w-full py-3 text-left focus-ring"
            onClick={() => {
              setPackageVisited(true);
              setPackageChosen(true);
            }}
          >
            <span className="block text-style-label text-text">На 100 г</span>
            <span className="mt-1 block text-style-caption text-muted">
              Введи значення з етикетки та вагу зʼїденого
            </span>
          </button>
          <button
            type="button"
            className="block w-full py-3 text-left focus-ring"
            onClick={onWholeMeal}
          >
            <span className="block text-style-label text-text">
              За всю порцію
            </span>
            <span className="mt-1 block text-style-caption text-muted">
              Введи значення для всього, що зʼїв
            </span>
          </button>
        </div>
      )}
      {packageVisited && (
        <div hidden={!packageChosen}>
          <PackageEntryStep onCreated={onCreated} />
        </div>
      )}
    </div>
  );
}
