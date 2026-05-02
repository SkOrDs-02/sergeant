import { useEffect, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { Button } from "@shared/components/ui/Button";
import { Sheet } from "@shared/components/ui/Sheet";
import { useVisualKeyboardInset } from "@sergeant/shared";
import { hapticSuccess } from "@shared/lib/haptic";
import type {
  Meal,
  MealTemplate,
  NutritionPrefs,
  PantryItem,
} from "@sergeant/nutrition-domain";
import { MEAL_TYPES } from "../lib/mealTypes";
import { ensureSeedFoods } from "../lib/foodDb/foodDb";
import { BarcodeScanner } from "./BarcodeScanner";
import {
  currentTime,
  emptyForm,
  type MealFormPhotoResult,
  type MealFormState,
} from "./meal-sheet/mealFormUtils";
import { MealTemplatesRow } from "./meal-sheet/MealTemplatesRow";
import { MealTypePicker } from "./meal-sheet/MealTypePicker";
import { NameTimeRow } from "./meal-sheet/NameTimeRow";
import { FromPantryRow } from "./meal-sheet/FromPantryRow";
import {
  FoodPickerSection,
  type PickedFood,
} from "./meal-sheet/FoodPickerSection";
import { BarcodeSection } from "./meal-sheet/BarcodeSection";
import { MacrosEditor } from "./meal-sheet/MacrosEditor";
import { SaveAsFood } from "./meal-sheet/SaveAsFood";
import { SaveAsTemplate } from "./meal-sheet/SaveAsTemplate";
import { useFoodSearch } from "./meal-sheet/useFoodSearch";
import { useBarcodeLookup } from "./meal-sheet/useBarcodeLookup";

interface AddMealSheetProps {
  open: boolean;
  onClose: () => void;
  onSave: (meal: Meal) => void;
  photoResult?: MealFormPhotoResult | null;
  initialMeal?: Partial<Meal> | null;
  mealTemplates?: MealTemplate[];
  setPrefs?: Dispatch<SetStateAction<NutritionPrefs>>;
  pantryItems?: PantryItem[];
  onConsumePantryItem?: (itemName: string, grams: number) => void;
  onRequestPhoto?: () => void;
}

export function AddMealSheet({
  open,
  onClose,
  onSave,
  photoResult,
  initialMeal,
  mealTemplates = [],
  setPrefs,
  pantryItems = [],
  onConsumePantryItem,
  onRequestPhoto,
}: AddMealSheetProps) {
  const kbInsetPx = useVisualKeyboardInset(open);
  const [form, setForm] = useState<MealFormState>(() => emptyForm(null));
  const [foodQuery, setFoodQuery] = useState("");
  const [pickedFood, setPickedFood] = useState<PickedFood | null>(null);
  const [pickedGrams, setPickedGrams] = useState("100");
  const [fromPantryItem, setFromPantryItem] = useState<string | null>(null);
  // Two-step flow: "source" (pick a source — template / pantry / food
  // search / barcode / photo / manual) then "fill" (name, time, macros,
  // save). Editing an existing meal or a photo import skips straight to
  // "fill" since the source is already decided.
  const [step, setStep] = useState("source");

  const { foodHits, offHits, foodBusy, offBusy, foodErr, setFoodErr } =
    useFoodSearch(foodQuery);

  const {
    barcode,
    setBarcode,
    barcodeStatus,
    setBarcodeStatus,
    scannerOpen,
    setScannerOpen,
    handleBarcodeLookup,
    handleBarcodeBind,
  } = useBarcodeLookup({
    pickedFood,
    setPickedFood,
    setPickedGrams,
    setForm,
  });

  useEffect(() => {
    if (open) {
      if (initialMeal?.id) {
        const mac = initialMeal.macros ?? {
          kcal: null,
          protein_g: null,
          fat_g: null,
          carbs_g: null,
        };
        setForm({
          name: String(initialMeal.name || ""),
          mealType: initialMeal.mealType || "breakfast",
          time: initialMeal.time || currentTime(),
          kcal: mac.kcal != null ? String(Math.round(mac.kcal)) : "",
          protein_g:
            mac.protein_g != null ? String(Math.round(mac.protein_g)) : "",
          fat_g: mac.fat_g != null ? String(Math.round(mac.fat_g)) : "",
          carbs_g: mac.carbs_g != null ? String(Math.round(mac.carbs_g)) : "",
          err: "",
        });
      } else {
        setForm(emptyForm(photoResult));
      }
      setFoodQuery("");
      setPickedFood(null);
      setPickedGrams(
        initialMeal?.amount_g != null
          ? String(Math.round(Number(initialMeal.amount_g) || 100))
          : "100",
      );
      setFoodErr("");
      setBarcode("");
      setBarcodeStatus("");
      setScannerOpen(false);
      setFromPantryItem(null);
      // Jump directly to fill when we already have content to edit.
      setStep(initialMeal?.id || photoResult ? "fill" : "source");
      void ensureSeedFoods();
    }
  }, [
    open,
    photoResult,
    initialMeal,
    setBarcode,
    setBarcodeStatus,
    setFoodErr,
    setScannerOpen,
  ]);

  function field(key: keyof MealFormState) {
    return (v: string) =>
      setForm((s: MealFormState) => ({ ...s, [key]: v, err: "" }));
  }

  // Auto-advance to fill step whenever a source selection lands (linked
  // food from search/barcode or pantry item).
  useEffect(() => {
    if (step === "source" && (pickedFood || fromPantryItem)) {
      setStep("fill");
    }
  }, [pickedFood, fromPantryItem, step]);

  function handleSave() {
    // Fall back to the picked source's name when the user emptied the name
    // input (or a rare race where autofill never caught up). The source
    // already has an authoritative label — erroring out forces the user to
    // retype the food they just picked.
    const pickedFoodName = pickedFood
      ? [pickedFood.name, pickedFood.brand].filter(Boolean).join(" ").trim()
      : "";
    const name =
      form.name.trim() ||
      pickedFoodName ||
      (typeof fromPantryItem === "string" ? fromPantryItem.trim() : "") ||
      (photoResult?.dishName || "").trim();
    if (!name) {
      setForm((s) => ({ ...s, err: "Введи назву страви." }));
      return;
    }
    const kcal = form.kcal === "" ? null : Number(form.kcal);
    const protein_g = form.protein_g === "" ? null : Number(form.protein_g);
    const fat_g = form.fat_g === "" ? null : Number(form.fat_g);
    const carbs_g = form.carbs_g === "" ? null : Number(form.carbs_g);
    if (
      [kcal, protein_g, fat_g, carbs_g].some(
        (n) => n != null && (!Number.isFinite(n) || n < 0),
      )
    ) {
      setForm((s) => ({ ...s, err: "Некоректне значення КБЖВ." }));
      return;
    }
    if (fromPantryItem && onConsumePantryItem) {
      const grams = Number(pickedGrams) || 100;
      onConsumePantryItem(fromPantryItem, grams);
    }
    const mealLabel =
      MEAL_TYPES.find((m) => m.id === form.mealType)?.label || "Прийом їжі";
    const source = photoResult ? "photo" : "manual";
    // Пріоритет foodId: новий вибір з pickedFood → інакше зберігаємо foodId з оригінальної страви.
    // Раніше при простому редагуванні страви з продуктом зв'язок з foodDb втрачався, бо pickedFood
    // скидається в null при відкритті схита.
    const effectiveFoodId = pickedFood?.id ?? initialMeal?.foodId ?? null;
    const hasAmount = pickedFood || initialMeal?.amount_g != null;
    hapticSuccess();
    const macroSource = photoResult
      ? "photoAI"
      : pickedFood
        ? "productDb"
        : initialMeal?.foodId
          ? "productDb"
          : "manual";
    onSave({
      id:
        initialMeal?.id ||
        `meal_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      time: form.time || currentTime(),
      mealType: form.mealType,
      label: mealLabel,
      name,
      macros: { kcal, protein_g, fat_g, carbs_g },
      source,
      macroSource,
      foodId: effectiveFoodId ? String(effectiveFoodId) : null,
      amount_g: hasAmount ? Number(pickedGrams) || 100 : null,
    });
  }

  const hasPhotoMacros = Boolean(
    photoResult?.macros &&
    Object.values(photoResult.macros).some(
      (v: unknown) => v != null && v !== 0,
    ),
  );

  const showBack = step === "fill" && !initialMeal?.id && !photoResult;
  const title = (
    <div className="flex items-center gap-2 min-w-0">
      {showBack && (
        <button
          type="button"
          onClick={() => {
            // Also clear any picked source, otherwise the auto-advance
            // effect immediately pushes us back to "fill" as soon as we
            // return to "source".
            setPickedFood(null);
            setFromPantryItem(null);
            setStep("source");
          }}
          className="w-9 h-9 flex items-center justify-center rounded-full bg-panelHi text-muted hover:text-text transition-colors"
          aria-label="Назад до вибору джерела"
        >
          ←
        </button>
      )}
      <span className="truncate">
        {step === "source" ? "Звідки страва?" : "Додати прийом їжі"}
      </span>
    </div>
  );

  return (
    <>
      {open && scannerOpen && (
        <BarcodeScanner
          onDetected={async (raw) => {
            setScannerOpen(false);
            setBarcode(String(raw));
            await handleBarcodeLookup(raw);
          }}
          onClose={() => setScannerOpen(false)}
        />
      )}
      <Sheet
        open={open}
        onClose={onClose}
        title={title}
        panelClassName="nutrition-sheet"
        zIndex={120}
        kbInsetPx={kbInsetPx}
      >
        {step === "source" ? (
          <>
            {/* Intro row doubles as a primary shortcut: the old paragraph
                ended with «…або заповніть вручну» which described an
                action hidden at the bottom of the sheet, making first-time
                users scroll past templates/pantry/search/barcode/photo just
                to find it. Pair the hint with an inline «Ввести вручну →»
                link so the quickest manual log is one tap from the sheet
                opening. The full button stays below for discoverability
                when users scroll past the sources. */}
            <div className="mb-3 flex items-start justify-between gap-3">
              <p className="text-xs text-muted">
                Оберіть джерело нижче. Макроси, назву й час відредагуєте на
                наступному кроці.
              </p>
              <button
                type="button"
                onClick={() => setStep("fill")}
                className="shrink-0 text-xs font-semibold text-nutrition-strong dark:text-nutrition hover:text-nutrition-hover underline decoration-dotted underline-offset-2 transition-colors min-h-[36px] px-1"
              >
                Ввести вручну →
              </button>
            </div>

            {/* Templates / pantry rows disappear when empty so a
                  first-time user sees search + barcode as the whole step
                  (no half-broken UI). They come back automatically once
                  the user saves a template or stocks the pantry. */}
            {mealTemplates.length > 0 && (
              <MealTemplatesRow
                mealTemplates={mealTemplates}
                setForm={setForm}
                onSelected={() => setStep("fill")}
              />
            )}

            {pantryItems.length > 0 && (
              <FromPantryRow
                pantryItems={pantryItems}
                fromPantryItem={fromPantryItem}
                setFromPantryItem={setFromPantryItem}
                setForm={setForm}
                setFoodQuery={setFoodQuery}
              />
            )}

            <FoodPickerSection
              form={form}
              setForm={setForm}
              foodQuery={foodQuery}
              setFoodQuery={setFoodQuery}
              foodHits={foodHits}
              offHits={offHits}
              foodBusy={foodBusy}
              offBusy={offBusy}
              foodErr={foodErr}
              pickedFood={pickedFood}
              setPickedFood={setPickedFood}
              pickedGrams={pickedGrams}
              setPickedGrams={setPickedGrams}
            />

            <BarcodeSection
              barcode={barcode}
              setBarcode={setBarcode}
              barcodeStatus={barcodeStatus}
              setBarcodeStatus={setBarcodeStatus}
              handleBarcodeLookup={handleBarcodeLookup}
              handleBarcodeBind={handleBarcodeBind}
              setScannerOpen={setScannerOpen}
            />

            {onRequestPhoto && (
              <div className="mt-4">
                <Button
                  type="button"
                  variant="secondary"
                  className="w-full h-12 min-h-[44px] flex items-center justify-center gap-2"
                  onClick={() => {
                    // Hand off to the host (NutritionApp) so the heavy
                    // photo-analysis UI stays in one place. The host
                    // closes this sheet, opens the Photo disclosure and
                    // triggers the native file picker — same flow the
                    // `add_meal_photo` PWA shortcut already uses.
                    onRequestPhoto();
                  }}
                  aria-label="Сфотографувати страву"
                >
                  <span aria-hidden>📷</span>
                  <span>Сфотографувати страву</span>
                </Button>
              </div>
            )}

            {/* eslint-disable-next-line sergeant-design/no-eyebrow-drift --
                "або" divider row between two bg-line spans — delimiter, not
                a section heading. */}
            <div className="mt-5 flex items-center gap-3 text-xs text-muted uppercase tracking-wider">
              <span className="flex-1 h-px bg-line" />
              або
              <span className="flex-1 h-px bg-line" />
            </div>
            <Button
              type="button"
              variant="secondary"
              className="mt-3 w-full h-12 min-h-[44px]"
              onClick={() => setStep("fill")}
            >
              Ввести вручну
            </Button>
          </>
        ) : (
          <>
            <MealTypePicker mealType={form.mealType} setForm={setForm} />

            <NameTimeRow form={form} field={field} setForm={setForm} />

            <MacrosEditor
              form={form}
              field={field}
              setForm={setForm}
              pickedFood={pickedFood}
              setPickedFood={setPickedFood}
              photoResult={photoResult}
              hasPhotoMacros={hasPhotoMacros}
            />

            {!pickedFood && (
              <SaveAsFood
                form={form}
                setForm={setForm}
                setPickedFood={setPickedFood}
                setPickedGrams={setPickedGrams}
                setFoodQuery={setFoodQuery}
                setFoodErr={setFoodErr}
              />
            )}

            {form.err && (
              <div className="text-xs text-danger mt-2">{form.err}</div>
            )}

            <SaveAsTemplate form={form} setForm={setForm} setPrefs={setPrefs} />

            <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-2">
              <Button
                type="button"
                className="h-12 min-h-[44px] bg-nutrition-strong text-white hover:bg-nutrition-hover"
                onClick={handleSave}
              >
                Зберегти
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="h-12 min-h-[44px]"
                onClick={onClose}
              >
                Скасувати
              </Button>
            </div>
          </>
        )}
      </Sheet>
    </>
  );
}
