/**
 * Last validated: 2026-10-08
 * Status: Active
 *
 * Вибір одиниці запису («г» / власні порції продукту) і поле кількості
 * штук. Стан тримає `PickedFoodCard`; вага лишається в `pickedGrams`, тут
 * вона лише переводиться в штуки й назад.
 */
import { useDecimalDraft } from "@shared/hooks/useDecimalDraft";
import { messages } from "@shared/i18n/uk";
import { cn } from "@shared/lib/ui/cn";
import type { FoodPortion } from "../../lib/foodDb/foodDb";
import { MAX_PORTION_GRAMS } from "./mealFormUtils";
import { GRAMS_UNIT, gramsToQty, qtyToGrams } from "./portionUnits";

const portionLabel = (p: FoodPortion) => `${p.name}, ${p.grams} г`;

interface PortionUnitPickerProps {
  portions: readonly FoodPortion[];
  unitId: string;
  onChange: (unitId: string) => void;
}

/** 1-2 порції: сегменти; 3+: `select`, щоб не ламати ширину 393 px. */
export function PortionUnitPicker({
  portions,
  unitId,
  onChange,
}: PortionUnitPickerProps) {
  if (portions.length > 2) {
    return (
      <select
        aria-label={messages.nutrition.portionUnit.label}
        value={unitId}
        onChange={(event) => onChange(event.target.value)}
        className="min-h-[44px] w-full rounded-xl border border-line bg-panel px-3 text-style-label text-text"
      >
        <option value={GRAMS_UNIT}>
          {messages.nutrition.portionUnit.grams}
        </option>
        {portions.map((p) => (
          <option key={p.id} value={p.id}>
            {portionLabel(p)}
          </option>
        ))}
      </select>
    );
  }
  const options = [
    { id: GRAMS_UNIT, label: messages.nutrition.portionUnit.grams },
    ...portions.map((p) => ({ id: p.id, label: portionLabel(p) })),
  ];
  return (
    <div
      role="radiogroup"
      aria-label={messages.nutrition.portionUnit.label}
      className="flex gap-1 rounded-2xl bg-panelHi p-1"
    >
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={unitId === o.id}
          onClick={() => onChange(o.id)}
          className={cn(
            "min-h-[44px] flex-1 rounded-xl px-2 text-style-caption transition-colors",
            unitId === o.id
              ? "bg-nutrition-strong text-white dark:bg-nutrition dark:text-bg"
              : "text-muted hover:text-text",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

interface PortionQuantityFieldProps {
  portion: FoodPortion;
  grams: string;
  setGrams: (grams: string) => void;
}

const QTY_STEP = 0.5;
const stepBtn =
  "text-style-title w-8 h-8 pointer-coarse:min-h-[44px] pointer-coarse:min-w-[44px] rounded-full bg-panelHi text-text hover:bg-line transition-colors flex items-center justify-center";

export function PortionQuantityField({
  portion,
  grams,
  setGrams,
}: PortionQuantityFieldProps) {
  const maxQty = Math.floor(MAX_PORTION_GRAMS / portion.grams);
  const numericGrams = Number(String(grams).trim().replace(",", "."));
  const qty = gramsToQty(
    Number.isFinite(numericGrams) ? numericGrams : 0,
    portion.grams,
  );
  const draft = useDecimalDraft(
    String(grams).trim() === "" ? "" : qty,
    maxQty,
    (value) =>
      setGrams(value == null ? "" : String(qtyToGrams(value, portion.grams))),
  );
  const bump = (delta: number) => {
    const next = Math.min(maxQty, Math.max(QTY_STEP, qty + delta));
    setGrams(String(qtyToGrams(next, portion.grams)));
  };
  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        aria-label={messages.nutrition.portionUnit.decrease}
        onClick={() => bump(-QTY_STEP)}
        className={stepBtn}
      >
        −
      </button>
      <input
        type="text"
        inputMode="decimal"
        value={draft.value}
        onChange={draft.onChange}
        aria-label={`Кількість, ${portion.name}`}
        className="input-focus-nutrition w-[76px] text-center bg-panel border border-line rounded-xl px-2 py-2 text-style-label text-text"
      />
      <button
        type="button"
        aria-label={messages.nutrition.portionUnit.increase}
        onClick={() => bump(QTY_STEP)}
        className={stepBtn}
      >
        +
      </button>
      <span className="text-style-caption text-subtle">{portion.name}</span>
    </div>
  );
}
