/**
 * AddMealSheet — three-step bottom sheet for logging a meal.
 *
 * Step flow:
 *   "source"  → user picks where the meal comes from (template, pantry,
 *               food-search, barcode, photo, or one of the two manual
 *               modes below).
 *   "photo"   → AI photo analysis (PhotoStep owns the usePhotoAnalysis
 *               controller and the Premium gate); applying the result
 *               seeds the fill form and advances.
 *   "package" → manual entry from a label: КБЖВ per 100 g + portion
 *               weight; creates a food and advances linked to it.
 *   "fill"    → user edits name, time, macros and saves.
 *
 * AI-CONTEXT: manual entry is deliberately TWO modes, because the unit
 * differs. "package" takes the numbers off a label (always per 100 g) and
 * scales them by the eaten weight; "fill" reached straight from "source"
 * takes КБЖВ for the whole portion and carries no weight at all. Merging
 * them back into one unlabelled "Ввести вручну" button is what made users
 * type per-100 g values into per-portion fields with nothing to catch it.
 *
 * Editing an existing meal skips straight to "fill". `initialStep="photo"`
 * opens directly at the photo step (PWA shortcut `add_meal_photo`, hub
 * quick action, Start-page CTA).
 *
 * @last-validated 2026-08-13
 */
import { useEffect, useRef, useState } from "react";
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
import { PhotoStep } from "./meal-sheet/PhotoStep";
import { MealTypePicker } from "./meal-sheet/MealTypePicker";
import { NameTimeRow } from "./meal-sheet/NameTimeRow";
import type { PickedFood } from "./meal-sheet/FoodPickerSection";
import { useReceiptAutoPick } from "./meal-sheet/useReceiptAutoPick";
import { PickedFoodCard } from "./meal-sheet/PickedFoodCard";
import { PortionUnitHint } from "./meal-sheet/PortionUnitHint";
import { PackageEntryStep } from "./meal-sheet/PackageEntryStep";
import { ManualEntryTab } from "./meal-sheet/ManualEntryTab";
import { SearchTabPanel } from "./meal-sheet/SearchTabPanel";
import { SourceTabs, type SourceTabId } from "./meal-sheet/SourceTabs";
import { BarcodeSection } from "./meal-sheet/BarcodeSection";
import { AddMealSheetTitle } from "./meal-sheet/AddMealSheetTitle";
import { MacrosEditor } from "./meal-sheet/MacrosEditor";
import { SaveAsTemplate } from "./meal-sheet/SaveAsTemplate";
import { useEditedFoodRehydration } from "./meal-sheet/useEditedFoodRehydration";
import { useFoodSearch } from "./meal-sheet/useFoodSearch";
import { useBarcodeLookup } from "./meal-sheet/useBarcodeLookup";
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
 * Раніше тут стояло `Number(pickedGrams) || 100`, і це мовчки зʼїдало кому:
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
  const [sourceTab, setSourceTab] = useState<SourceTabId>("search");
  const [fromPantryItem, setFromPantryItem] = useState<string | null>(null);
  // Four-step flow: "source" (pick a source — template / pantry / food
  // search / barcode / photo / manual), "photo" (AI analysis inside the
  // sheet), "package" (manual per-100 g entry from a label) and "fill"
  // (name, time, macros, save). Editing an existing meal skips straight
  // to "fill" since the source is already decided.
  const [step, setStep] = useState("source");
  // Set on the photo → fill transition; drives `source`/`macroSource` and
  // the meal-thumbnail save. Cleared on backtrack so a user who returns
  // to "source" and picks another source doesn't keep photoAI semantics.
  const [appliedPhoto, setAppliedPhoto] = useState<AppliedPhoto | null>(null);

  const search = useFoodSearch(foodQuery);
  const { foodHits, offHits, foodBusy, offBusy, foodErr, setFoodErr } = search;
  const onReceiptItemPicked = useReceiptAutoPick<PickedFood>({
    foodQuery,
    search,
    setFoodQuery,
    setPickedFood,
  });

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
    // Вкладку теж скидаємо, і це не косметика: ефект нижче відкриває
    // сканер при активній вкладці «Скан», тож аркуш, закритий на ній,
    // при наступному відкритті кидав би людину одразу в камеру — без
    // жодного жесту з її боку.
    setSourceTab("search");
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

  // Продукт для аркуша редагування — чому без нього порцію змінити було
  // неможливо, у `useEditedFoodRehydration`.
  const editedFood = useEditedFoodRehydration({
    open,
    meal: initialMeal,
    setPickedFood,
  });

  function field(key: keyof MealFormState) {
    return (v: string) =>
      setForm((s: MealFormState) => ({ ...s, [key]: v, err: "" }));
  }

  // Auto-advance to fill step whenever a source selection lands (linked
  // food from search/barcode or pantry item).
  if (step === "source" && (pickedFood || fromPantryItem)) {
    setStep("fill");
  }

  // Вхід у вкладку «Скан» — це вже жест «хочу сканувати», тож сканер
  // відкривається сам. Той самий принцип, що й у кроці фото, який сам
  // відкриває піккер: обрана вкладка — це вже намір, і просити ще один
  // тап означає пропонувати дію, яку людина щойно зробила. Кнопка в
  // секції лишається, але як «Сканувати ще раз» — повтор після невдалого
  // кадру, а не основний шлях.
  //
  // Ref, а не стан: один запуск на активацію вкладки. Без нього закритий
  // сканер відкривався б назад на кожному ре-рендері, і вийти з вкладки
  // стало б неможливо.
  const scanAutoOpenedRef = useRef(false);
  useEffect(() => {
    if (!open || step !== "source" || sourceTab !== "scan") {
      scanAutoOpenedRef.current = false;
      return;
    }
    if (scanAutoOpenedRef.current) return;
    scanAutoOpenedRef.current = true;
    setScannerOpen(true);
  }, [open, step, sourceTab, setScannerOpen]);

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
    // Раніше при простому редагуванні страви з продуктом звʼязок з foodDb втрачався, бо pickedFood
    // скидається в null при відкритті схита.
    const effectiveFoodId = pickedFood?.id ?? initialMeal?.foodId ?? null;
    const hasAmount = pickedFood || initialMeal?.amount_g != null;
    // Нульова (чи стерта) вага при обраному продукті — не «не вказано», а
    // мовчазна розсинхронізація: `gramsOrDefault` підставив би 100, тоді як
    // у полях КБЖВ лишились числа, пораховані під попередню вагу. Ефект у
    // `PickedFoodCard` навмисно НЕ перераховує макроси під нуль (інакше під
    // порожнім полем світились би числа за 100 г), тож зловити це можна
    // рівно тут. Записати 100 г із КБЖВ від 250 г — саме та підміна
    // одиниці, проти якої цей екран і переробляли.
    if (hasAmount) {
      const grams = parseDecimalInput(pickedGrams);
      if (!grams.ok || grams.value <= 0) {
        setForm((s) => ({ ...s, err: "Вкажи вагу порції." }));
        return;
      }
    }
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

  // Крок «з упаковки» → «fill»: продукт уже збережено в локальну базу,
  // лишається звʼязати його з прийомом. Макроси форми не чіпаємо тут —
  // їх порахує `PickedFoodCard` під вагу порції.
  function handlePackageCreated(product: PickedFood, grams: string) {
    setAppliedPhoto(null);
    setFromPantryItem(null);
    setPickedFood(product);
    setPickedGrams(grams);
    setFoodQuery("");
    setStep("fill");
  }

  // «Обрати інший продукт» з картки на кроці «fill». Скидаємо звʼязок
  // ПЕРЕД поверненням, інакше авто-перехід нижче миттєво штовхне назад.
  function handleChangeProduct() {
    editedFood.clear();
    dropSeededMacros();
    setPickedGrams("100");
    setFoodQuery("");
    setStep("source");
  }

  // Значення, засіяні джерелом (продукт на 100 г × вага, або оцінка AI з
  // фото), не мають переживати відмову від цього джерела. Інакше людина,
  // що з продукту повернулась у «Готову страву», побачить у полях числа,
  // порахованих на 100 г, під підписом «за всю порцію» — рівно та тиха
  // підміна одиниці, заради якої цей екран узагалі переробляли.
  function dropSeededMacros() {
    // Комора теж джерело: `FromPantryRow` сіє `form.name` назвою продукту.
    // Поки її не було в цій умові, відмова від комори лишала ту назву у
    // формі, і ручний запис зберігався під чужим іменем.
    const seeded = Boolean(appliedPhoto || pickedFood || fromPantryItem);
    // Рівно той рядок, який у поле назви записало джерело — по ньому й
    // відрізняємо засіяне від набраного людиною. Три джерела сіють назву
    // по-різному, але правило одне: збігається — наше, отже чистимо;
    // відрізняється — своє, отже не чіпаємо.
    const seededName = pickedFood
      ? [pickedFood.name, pickedFood.brand].filter(Boolean).join(" ").trim()
      : fromPantryItem !== null
        ? fromPantryItem
        : appliedPhoto
          ? (appliedPhoto.result.dishName || "").trim()
          : null;
    setPickedFood(null);
    setAppliedPhoto(null);
    setFromPantryItem(null);
    // Чистимо РІВНО те, що засіяло джерело: назву й КБЖВ. Тип прийому та
    // час обирає людина, і `emptyForm(null)` їх мовчки перезаписував би
    // на `mealTypeByNow()` / `currentTime()` — хто поставив «Вечеря» о
    // 15:00 і потім змінив продукт, отримував назад «Обід» і поточну
    // годину.
    if (seeded) {
      setForm((s) => ({
        ...s,
        name: seededName !== null && s.name !== seededName ? s.name : "",
        kcal: "",
        protein_g: "",
        fat_g: "",
        carbs_g: "",
        err: "",
      }));
    }
  }

  // «Маю етикетку на 100 г» з ручного кроку — переводимо в режим
  // упаковки, а не назад до вибору джерела: користувач уже знає, чого
  // хоче, зайвий екран тут лише відкидає назад.
  function handleSwitchToPackage() {
    dropSeededMacros();
    setPickedGrams("100");
    setFoodQuery("");
    setStep("package");
  }

  const canBacktrack = step !== "source" && !initialMeal?.id;
  function handleBacktrack() {
    // Clear any picked source to prevent the auto-advance effect from
    // immediately pushing back to "fill" when we return to "source".
    // Відмова від джерела мусить прибрати і засіяні ним значення: інакше
    // AI-оцінка КБЖВ (чи перерахунок продукту під вагу) пережила б
    // backtrack і збереглась би під `macroSource: manual` — підміна
    // походження даних (канон: «скільки логів через AI» має лишатись
    // чесним питанням).
    dropSeededMacros();
    setStep("source");
  }

  const title = (
    <AddMealSheetTitle
      step={step}
      canBacktrack={canBacktrack}
      onBacktrack={handleBacktrack}
    />
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
          onManualEntry={() => {
            setScannerOpen(false);
            setSourceTab("manual");
          }}
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
            <SourceTabs active={sourceTab} onChange={setSourceTab} />

            {sourceTab === "search" && (
              <div
                role="tabpanel"
                id="source-panel-search"
                aria-labelledby="source-tab-search"
              >
                <SearchTabPanel
                  mealTemplates={mealTemplates}
                  setForm={setForm}
                  setPrefs={setPrefs}
                  onTemplateSelected={() => setStep("fill")}
                  onEditTemplate={(t) => setEditingTemplateId(t.id)}
                  quickChips={quickChips}
                  onQuickAddMeal={onQuickAddMeal}
                  onQuickAdded={onClose}
                  pantryItems={pantryItems}
                  // Редагування наявного прийому їжі й вхід одразу на
                  // «fill» (PWA-шорткат, фото) чека не потребують — і не
                  // мають будити мережу заради рядка, який там не потрібен.
                  receiptRowEnabled={step === "source"}
                  onReceiptItemPicked={onReceiptItemPicked}
                  fromPantryItem={fromPantryItem}
                  setFromPantryItem={setFromPantryItem}
                  picker={{
                    foodQuery,
                    setFoodQuery,
                    foodHits,
                    offHits,
                    foodBusy,
                    offBusy,
                    foodErr,
                    setPickedFood,
                    setPickedGrams,
                  }}
                />
              </div>
            )}

            {sourceTab === "scan" && (
              <div
                role="tabpanel"
                id="source-panel-scan"
                aria-labelledby="source-tab-scan"
              >
                <BarcodeSection
                  barcodeStatus={barcodeStatus}
                  setBarcodeStatus={setBarcodeStatus}
                  barcodeNotice={barcodeNotice}
                  onDismissBarcodeNotice={() => setBarcodeNotice(null)}
                  onRetryBarcodeLookup={() => void handleBarcodeLookup(barcode)}
                  onUsePhotoForBarcode={() => setSourceTab("photo")}
                  onManualEntryForBarcode={() => {
                    setBarcodeNotice(null);
                    setSourceTab("manual");
                  }}
                  setScannerOpen={setScannerOpen}
                  actionLabel="Сканувати ще раз"
                />
              </div>
            )}

            {sourceTab === "photo" && (
              <div
                role="tabpanel"
                id="source-panel-photo"
                aria-labelledby="source-tab-photo"
              >
                <PhotoStep onApply={handlePhotoApply} />
              </div>
            )}

            {sourceTab === "manual" && (
              <div
                role="tabpanel"
                id="source-panel-manual"
                aria-labelledby="source-tab-manual"
              >
                <ManualEntryTab
                  onCreated={handlePackageCreated}
                  onWholeMeal={() => setStep("fill")}
                />
              </div>
            )}
          </>
        ) : step === "photo" ? (
          <PhotoStep onApply={handlePhotoApply} />
        ) : step === "package" ? (
          <PackageEntryStep onCreated={handlePackageCreated} />
        ) : (
          <>
            <MealTypePicker mealType={form.mealType} setForm={setForm} />

            <NameTimeRow form={form} field={field} setForm={setForm} />

            {pickedFood ? (
              <PickedFoodCard
                form={form}
                setForm={setForm}
                pickedFood={pickedFood}
                pickedGrams={pickedGrams}
                setPickedGrams={setPickedGrams}
                onChangeProduct={handleChangeProduct}
                skipInitialRescale={editedFood.rehydrated}
              />
            ) : (
              // Редагування наявного прийому джерела не обирає, тож
              // підказка там зайва — а перехід «маю етикетку» ще й веде на
              // крок без стрілки «назад» (`canBacktrack` вимкнено при
              // редагуванні), тобто в глухий кут.
              !appliedPhoto &&
              !initialMeal?.id && (
                <PortionUnitHint onSwitchToPackage={handleSwitchToPackage} />
              )
            )}

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
                    aria-label="Запамʼятати для повтору"
                    checked={rememberForRepeat}
                    onChange={(event) =>
                      setRememberForRepeat(event.currentTarget.checked)
                    }
                    className="mt-0.5 h-5 w-5 shrink-0 accent-nutrition-strong"
                  />
                  <span className="min-w-0">
                    <span className="block text-style-label text-text">
                      Запамʼятати для повтору
                    </span>
                    {/* AI-NOTE: кегль тут навмисний — це підказка під
                        контролом («Запамʼятати для повтору»), а не текст,
                        який читають окремо; `text-style-body` зрівняв би
                        її з підписом самого чекбокса. */}
                    <span className="mt-0.5 block text-style-caption text-muted">
                      Назва, тип прийому та КБЖВ зʼявляться серед швидких
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
