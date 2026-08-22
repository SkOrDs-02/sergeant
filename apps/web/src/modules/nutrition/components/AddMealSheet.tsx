/**
 * AddMealSheet — three-step bottom sheet for logging a meal.
 *
 * Step flow:
 *   "source" → user picks where the meal comes from (template, pantry,
 *              food-search, barcode, photo, or manual entry).
 *   "photo"  → AI photo analysis (PhotoStep owns the usePhotoAnalysis
 *              controller and the Premium gate); applying the result
 *              seeds the fill form and advances.
 *   "fill"   → user edits name, time, macros and saves.
 *
 * Editing an existing meal skips straight to "fill". `initialStep="photo"`
 * opens directly at the photo step (PWA shortcut `add_meal_photo`, hub
 * quick action, Start-page CTA).
 *
 * @last-validated 2026-08-13
 */
import { useState } from "react";
import { Icon } from "@shared/components/ui/Icon";
import type { Dispatch, SetStateAction } from "react";
import { Button } from "@shared/components/ui/Button";
import { ConfirmDialog } from "@shared/components/ui/ConfirmDialog";
import { Sheet } from "@shared/components/ui/Sheet";
import { hapticSuccess } from "@shared/lib/adapters/haptic";
import { clampText } from "@shared/lib/text/limits";
import { parseDecimalInput } from "@shared/lib/format/numberInput";
import type {
  Meal,
  MealTemplate,
  NutritionPrefs,
  PantryItem,
} from "@sergeant/nutrition-domain";
import { MEAL_TYPES } from "../lib/mealTypes";
import { newMealId } from "../lib/mealId";
import { ensureSeedFoods } from "../lib/foodDb/foodDb";
import { BarcodeScanner } from "./BarcodeScanner";
import {
  currentTime,
  emptyForm,
  type MealFormPhotoResult,
  type MealFormState,
} from "./meal-sheet/mealFormUtils";
import { MealTemplatesRow } from "./meal-sheet/MealTemplatesRow";
import { PhotoStep } from "./meal-sheet/PhotoStep";
import { MealTypePicker } from "./meal-sheet/MealTypePicker";
import { NameTimeRow } from "./meal-sheet/NameTimeRow";
import { FromPantryRow } from "./meal-sheet/FromPantryRow";
import {
  FoodPickerSection,
  type PickedFood,
} from "./meal-sheet/FoodPickerSection";
import { BarcodeSection } from "./meal-sheet/BarcodeSection";
import { MacrosEditor } from "./meal-sheet/MacrosEditor";
import { SaveAsTemplate } from "./meal-sheet/SaveAsTemplate";
import { useFoodSearch } from "./meal-sheet/useFoodSearch";
import { useBarcodeLookup } from "./meal-sheet/useBarcodeLookup";
import { QuickAddChips } from "./QuickAddChips";
import type { QuickChip } from "../hooks/useNutritionQuickChips";

/**
 * Фізіологічно правдоподібні стелі для одного прийому їжі. Не медичні
 * норми — межі проти друкарської помилки й свідомо абсурдного вводу
 * (кома замість крапки, зайвий нуль), які інакше зламали б денні
 * агрегації та графіки.
 */
export const MAX_KCAL_PER_MEAL = 10_000;
export const MAX_MACRO_GRAMS = 2_000;

/**
 * True when every macro field is null or 0 — mirrors the `hasPhotoMacros`
 * predicate below (photo AI returns all-null macros when it can't
 * identify the food). A meal saved with all-empty macros won't move the
 * daily stats at all, so `handleSave` routes through a confirm step
 * instead of blocking the save outright (founder decision: warn, don't
 * block).
 */
function macrosAreAllEmpty(macros: {
  kcal: number | null;
  protein_g: number | null;
  fat_g: number | null;
  carbs_g: number | null;
}): boolean {
  return !Object.values(macros).some((v) => v != null && v !== 0);
}

/**
 * Грами порції з поля вводу; 100 г — дефолт, коли поле порожнє або зіпсоване.
 *
 * Раніше тут стояло `Number(pickedGrams) || 100`, і це мовчки з'їдало кому:
 * «150,5» ставало `NaN`, `|| 100` перетворював його на 100 г, і в журнал
 * потрапляла НЕ та вага без жодного натяку користувачу. Тиха підміна даних
 * гірша за помилку, тому парсинг тут спільний із КБЖВ.
 */
function gramsOrDefault(raw: string): number {
  const parsed = parseDecimalInput(raw);
  return parsed.ok && parsed.value > 0 ? parsed.value : 100;
}

interface AddMealSheetProps {
  open: boolean;
  onClose: () => void;
  /** `photoFile` — оригінал фото для мініатюри, коли страва прийшла з AI-аналізу. */
  onSave: (meal: Meal, photoFile?: File | null) => void;
  /** `"photo"` — відкритись одразу на кроці аналізу фото (шорткати/CTA). */
  initialStep?: "source" | "photo" | undefined;
  initialMeal?: Partial<Meal> | null | undefined;
  mealTemplates?: MealTemplate[] | undefined;
  setPrefs?: Dispatch<SetStateAction<NutritionPrefs>> | undefined;
  pantryItems?: PantryItem[] | undefined;
  onConsumePantryItem?: ((itemName: string, grams: number) => void) | undefined;
  quickChips?: readonly QuickChip[] | undefined;
  onQuickAddMeal?: ((chip: QuickChip) => void) | undefined;
}

/** Результат кроку «фото», застосований до форми (photo → fill). */
interface AppliedPhoto {
  result: MealFormPhotoResult;
  file: File | null;
}

export function AddMealSheet({
  open,
  onClose,
  onSave,
  initialStep,
  initialMeal,
  mealTemplates = [],
  setPrefs,
  pantryItems = [],
  onConsumePantryItem,
  quickChips = [],
  onQuickAddMeal,
}: AddMealSheetProps) {
  const [form, setForm] = useState<MealFormState>(() => emptyForm(null));
  const [foodQuery, setFoodQuery] = useState("");
  const [pickedFood, setPickedFood] = useState<PickedFood | null>(null);
  const [pickedGrams, setPickedGrams] = useState("100");
  const [fromPantryItem, setFromPantryItem] = useState<string | null>(null);
  // Three-step flow: "source" (pick a source — template / pantry / food
  // search / barcode / photo / manual), "photo" (AI analysis inside the
  // sheet) and "fill" (name, time, macros, save). Editing an existing
  // meal skips straight to "fill" since the source is already decided.
  const [step, setStep] = useState("source");
  // Set on the photo → fill transition; drives `source`/`macroSource` and
  // the meal-thumbnail save. Cleared on backtrack so a user who returns
  // to "source" and picks another source doesn't keep photoAI semantics.
  const [appliedPhoto, setAppliedPhoto] = useState<AppliedPhoto | null>(null);

  const { foodHits, offHits, foodBusy, offBusy, foodErr, setFoodErr } =
    useFoodSearch(foodQuery);

  const {
    barcode,
    setBarcode,
    barcodeStatus,
    setBarcodeStatus,
    barcodeNotice,
    setBarcodeNotice,
    scannerOpen,
    setScannerOpen,
    handleBarcodeLookup,
  } = useBarcodeLookup({
    pickedFood,
    setPickedFood,
    setPickedGrams,
    setForm,
  });

  // Ідемпотентність: id генерується один раз на відкриття аркуша, а не на
  // кожен клік «Зберегти». Подвійний тап тоді приходить у шар запису
  // (`addLogEntry`) з тим самим id і відкидається як дубль.
  const [draftId, setDraftId] = useState("");

  // Set when the user taps the edit affordance on a saved meal template
  // (`MealTemplatesRow`), so `SaveAsTemplate` updates that template in
  // place instead of appending a new one.
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(
    null,
  );

  // Founder decision: don't block saving a meal whose macros are all
  // empty/zero (photo AI couldn't identify the food, or the user just
  // hasn't filled them in yet) — warn instead. `pendingMeal` holds the
  // fully-built, already-validated payload while the confirm dialog is up;
  // it's cleared on confirm (→ finalizeSave) or cancel (sheet stays open,
  // untouched).
  const [pendingMeal, setPendingMeal] = useState<Meal | null>(null);
  const [rememberForRepeat, setRememberForRepeat] = useState(false);

  const [prevOpen, setPrevOpen] = useState(false);
  if (open && !prevOpen) {
    setPrevOpen(true);
    setDraftId(newMealId());
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
      setForm(emptyForm(null));
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
    setBarcodeNotice(null);
    setScannerOpen(false);
    setFromPantryItem(null);
    setEditingTemplateId(null);
    setPendingMeal(null);
    setRememberForRepeat(false);
    setAppliedPhoto(null);
    // Creating a meal always starts with the source chooser. Even without
    // templates/recent meals it still offers product search, barcode scan,
    // photo and manual entry, so skipping it silently biases the primary FAB
    // toward manual input. Editing already has a source and opens the fill
    // form directly; `initialStep="photo"` (shortcuts/CTA) opens the photo
    // step without the "Звідки страва?" detour.
    setStep(
      initialMeal?.id ? "fill" : initialStep === "photo" ? "photo" : "source",
    );
    void ensureSeedFoods();
  } else if (!open && prevOpen) {
    setPrevOpen(false);
  }

  function field(key: keyof MealFormState) {
    return (v: string) =>
      setForm((s: MealFormState) => ({ ...s, [key]: v, err: "" }));
  }

  // Auto-advance to fill step whenever a source selection lands (linked
  // food from search/barcode or pantry item).
  if (step === "source" && (pickedFood || fromPantryItem)) {
    setStep("fill");
  }

  function handleSave() {
    // Fall back to the picked source's name when the user emptied the name
    // input (or a rare race where autofill never caught up). The source
    // already has an authoritative label — erroring out forces the user to
    // retype the food they just picked.
    const pickedFoodName = pickedFood
      ? [pickedFood.name, pickedFood.brand].filter(Boolean).join(" ").trim()
      : "";
    const name = clampText(
      form.name.trim() ||
        pickedFoodName ||
        (typeof fromPantryItem === "string" ? fromPantryItem.trim() : "") ||
        (appliedPhoto?.result.dishName || "").trim(),
    );
    if (!name) {
      setForm((s) => ({ ...s, err: "Введи назву страви." }));
      return;
    }
    // `parseDecimalInput`, а не `Number()`: поля мають `inputMode="decimal"`,
    // і українська (як і більшість європейських) розкладка дає кому —
    // `Number("1212,1")` це `NaN`, тож коректний ввід відхилявся.
    // Порожнє поле лишається `null` («не вказано»), і це НЕ помилка.
    const macroInputs = (
      ["kcal", "protein_g", "fat_g", "carbs_g"] as const
    ).map((key) => (form[key] === "" ? null : parseDecimalInput(form[key])));
    if (macroInputs.some((m) => m != null && !m.ok)) {
      setForm((s) => ({ ...s, err: "Некоректне значення КБЖВ." }));
      return;
    }
    const [kcal, protein_g, fat_g, carbs_g] = macroInputs.map((m) =>
      m != null && m.ok ? m.value : null,
    ) as [number | null, number | null, number | null, number | null];
    if (kcal != null && kcal > MAX_KCAL_PER_MEAL) {
      setForm((s) => ({
        ...s,
        err: `Забагато калорій: максимум ${MAX_KCAL_PER_MEAL} ккал на прийом.`,
      }));
      return;
    }
    if (
      [protein_g, fat_g, carbs_g].some((n) => n != null && n > MAX_MACRO_GRAMS)
    ) {
      setForm((s) => ({
        ...s,
        err: `Забагато БЖВ: максимум ${MAX_MACRO_GRAMS} г на прийом.`,
      }));
      return;
    }
    const mealLabel =
      MEAL_TYPES.find((m) => m.id === form.mealType)?.label || "Прийом їжі";
    const source = appliedPhoto ? "photo" : "manual";
    // Пріоритет foodId: новий вибір з pickedFood → інакше зберігаємо foodId з оригінальної страви.
    // Раніше при простому редагуванні страви з продуктом зв'язок з foodDb втрачався, бо pickedFood
    // скидається в null при відкритті схита.
    const effectiveFoodId = pickedFood?.id ?? initialMeal?.foodId ?? null;
    const hasAmount = pickedFood || initialMeal?.amount_g != null;
    const macroSource = appliedPhoto
      ? "photoAI"
      : pickedFood
        ? "productDb"
        : initialMeal?.foodId
          ? "productDb"
          : "manual";
    const macros = { kcal, protein_g, fat_g, carbs_g };
    const meal: Meal = {
      id: initialMeal?.id || draftId || newMealId(),
      time: form.time || currentTime(),
      mealType: form.mealType,
      label: mealLabel,
      name,
      macros,
      source,
      macroSource,
      foodId: effectiveFoodId ? String(effectiveFoodId) : null,
      amount_g: hasAmount ? gramsOrDefault(pickedGrams) : null,
    };
    // Founder decision: warn, don't block. A meal with all-empty/zero
    // macros (photo AI couldn't identify the food, or a manual entry with
    // nothing typed in) won't move the daily stats at all — surface a
    // confirm step instead of silently saving a meaningless entry.
    if (macrosAreAllEmpty(macros)) {
      setPendingMeal(meal);
      return;
    }
    finalizeSave(meal);
  }

  function finalizeSave(meal: Meal) {
    if (fromPantryItem && onConsumePantryItem) {
      const grams = gramsOrDefault(pickedGrams);
      onConsumePantryItem(fromPantryItem, grams);
    }
    if (rememberForRepeat && !initialMeal?.id && setPrefs) {
      setPrefs((prefs) => {
        const existing = Array.isArray(prefs.mealTemplates)
          ? prefs.mealTemplates
          : [];
        const normalizedName = meal.name.trim().toLocaleLowerCase("uk-UA");
        const previous = existing.find(
          (template) =>
            template.mealType === meal.mealType &&
            template.name.trim().toLocaleLowerCase("uk-UA") === normalizedName,
        );
        const remembered: MealTemplate = {
          id: previous?.id ?? `tpl_${Date.now()}`,
          name: meal.name,
          mealType: meal.mealType,
          macros: { ...meal.macros },
        };
        return {
          ...prefs,
          mealTemplates: [
            remembered,
            ...existing.filter((template) => template.id !== previous?.id),
          ].slice(0, 40),
        };
      });
    }
    hapticSuccess();
    onSave(meal, appliedPhoto?.file ?? null);
  }

  function handleConfirmEmptyMacrosSave() {
    if (pendingMeal) finalizeSave(pendingMeal);
    setPendingMeal(null);
  }

  function handleCancelEmptyMacrosSave() {
    setPendingMeal(null);
  }

  const hasPhotoMacros = Boolean(
    appliedPhoto?.result.macros &&
    Object.values(appliedPhoto.result.macros).some(
      (v: unknown) => v != null && v !== 0,
    ),
  );

  // Photo → fill: seed the form from the analysis (same `emptyForm` path
  // the old host-held photoResult used at sheet-open) and remember the
  // applied result for macroSource/thumbnail. A picked food/pantry item
  // from an earlier detour must not survive alongside photoAI macros.
  function handlePhotoApply(result: MealFormPhotoResult, file: File | null) {
    setPickedFood(null);
    setFromPantryItem(null);
    setForm(emptyForm(result));
    setAppliedPhoto({ result, file });
    setStep("fill");
  }

  const canBacktrack = step !== "source" && !initialMeal?.id;
  function handleBacktrack() {
    // Clear any picked source to prevent the auto-advance effect from
    // immediately pushing back to "fill" when we return to "source".
    setPickedFood(null);
    setFromPantryItem(null);
    // Відмова від фото-джерела мусить прибрати і засіяні ним значення:
    // інакше AI-оцінка КБЖВ пережила б backtrack і збереглась би під
    // `macroSource: manual` — підміна походження даних (канон: «скільки
    // логів через AI» має лишатись чесним питанням).
    if (appliedPhoto) {
      setAppliedPhoto(null);
      setForm(emptyForm(null));
    }
    setStep("source");
  }

  const title = (
    <div className="flex items-center gap-2 min-w-0">
      {canBacktrack && (
        <button
          type="button"
          onClick={handleBacktrack}
          className="w-9 h-9 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-full bg-panelHi text-muted hover:text-text transition-colors"
          aria-label="Назад до вибору джерела"
        >
          <Icon name="chevron-left" size="lg" />
        </button>
      )}
      <span className="truncate">
        {step === "source"
          ? "Звідки страва?"
          : step === "photo"
            ? "Аналіз фото страви"
            : "Додати прийом їжі"}
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
      >
        {step === "source" ? (
          <>
            <p className="mb-3 text-style-caption text-muted">
              Оберіть джерело нижче. Макроси, назву й час відредагуєте на
              наступному кроці.
            </p>

            {/* Templates / pantry rows disappear when empty so a
                  first-time user sees search + barcode as the whole step
                  (no half-broken UI). They come back automatically once
                  the user saves a template or stocks the pantry. */}
            {mealTemplates.length > 0 && (
              <MealTemplatesRow
                mealTemplates={mealTemplates}
                setForm={setForm}
                setPrefs={setPrefs}
                onSelected={() => setStep("fill")}
                onEditTemplate={(t) => setEditingTemplateId(t.id)}
              />
            )}

            {onQuickAddMeal && quickChips.length > 0 && (
              <section
                className="mb-4 min-w-0"
                aria-labelledby="recent-meals-heading"
              >
                <h3
                  id="recent-meals-heading"
                  className="mb-2 text-style-label text-text"
                >
                  Нещодавні прийоми
                </h3>
                <QuickAddChips
                  chips={quickChips}
                  onTap={(chip) => {
                    onQuickAddMeal(chip);
                    onClose();
                  }}
                />
              </section>
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
              setFoodErr={setFoodErr}
              pickedFood={pickedFood}
              setPickedFood={setPickedFood}
              pickedGrams={pickedGrams}
              setPickedGrams={setPickedGrams}
            />

            <div className="mt-4 grid gap-3 grid-cols-2">
              <BarcodeSection
                barcodeStatus={barcodeStatus}
                setBarcodeStatus={setBarcodeStatus}
                barcodeNotice={barcodeNotice}
                onDismissBarcodeNotice={() => setBarcodeNotice(null)}
                onRetryBarcodeLookup={() => void handleBarcodeLookup(barcode)}
                onUsePhotoForBarcode={() => setStep("photo")}
                setScannerOpen={setScannerOpen}
              />

              <Button
                type="button"
                variant="secondary"
                className="w-full h-12 min-h-[44px] flex items-center justify-center gap-2"
                // Photo analysis is an in-sheet step now — no detour
                // through the Start page and its force-open disclosure.
                onClick={() => setStep("photo")}
                aria-label="Додати страву з фото"
              >
                <Icon name="camera" size="sm" aria-hidden />
                <span>Фото</span>
              </Button>
            </div>

            <div className="mt-5 flex items-center gap-3 text-style-caption text-muted">
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
        ) : step === "photo" ? (
          <PhotoStep onApply={handlePhotoApply} />
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
              pickedGrams={pickedGrams}
              photoResult={appliedPhoto?.result}
              hasPhotoMacros={hasPhotoMacros}
            />

            {form.err && (
              <div className="text-style-caption text-danger-strong dark:text-danger mt-2">
                {form.err}
              </div>
            )}

            {editingTemplateId ? (
              <SaveAsTemplate
                form={form}
                setForm={setForm}
                setPrefs={setPrefs}
                editingTemplateId={editingTemplateId}
                onDoneEditing={() => setEditingTemplateId(null)}
              />
            ) : (
              !initialMeal?.id &&
              typeof setPrefs === "function" && (
                <label className="mt-4 flex min-h-[44px] cursor-pointer items-start gap-3 rounded-2xl border border-line bg-panelHi p-3">
                  <input
                    type="checkbox"
                    aria-label="Запам’ятати для повтору"
                    checked={rememberForRepeat}
                    onChange={(event) =>
                      setRememberForRepeat(event.currentTarget.checked)
                    }
                    className="mt-0.5 h-5 w-5 shrink-0 accent-nutrition-strong"
                  />
                  <span className="min-w-0">
                    <span className="block text-style-label text-text">
                      Запам’ятати для повтору
                    </span>
                    <span className="mt-0.5 block text-style-caption text-muted">
                      Назва, тип прийому та КБЖВ з’являться серед швидких
                      прийомів.
                    </span>
                  </span>
                </label>
              )
            )}

            <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-2">
              <Button
                type="button"
                className="h-12 min-h-[44px] bg-nutrition-strong text-white hover:bg-nutrition-hover"
                onClick={handleSave}
              >
                {initialMeal?.id ? "Зберегти зміни" : "Додати прийом"}
              </Button>
              <Button
                type="button"
                variant="secondary"
                className="h-12 min-h-[44px]"
                onClick={onClose}
              >
                Скасувати
              </Button>
            </div>
          </>
        )}
      </Sheet>
      <ConfirmDialog
        open={pendingMeal != null}
        title="Зберегти без калорійності?"
        description="КБЖВ порожні, запис не вплине на денну статистику. Зберегти як є?"
        confirmLabel="Зберегти"
        cancelLabel="Повернутись"
        danger={false}
        onConfirm={handleConfirmEmptyMacrosSave}
        onCancel={handleCancelEmptyMacrosSave}
      />
    </>
  );
}
