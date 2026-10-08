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
import { DateField } from "@shared/components/ui/DateField";
import { SectionHeading } from "@shared/components/ui/SectionHeading";
import { Sheet } from "@shared/components/ui/Sheet";
import { hapticSuccess } from "@shared/lib/adapters/haptic";
import { clampText } from "@shared/lib/text/limits";
import { parseDecimalInput } from "@shared/lib/format/numberInput";
import type {
  Meal,
  MealTemplate,
  MealTypeId,
  NutritionPrefs,
  PantryItem,
} from "@sergeant/nutrition-domain";
import type { NutritionPhotoResult } from "@shared/api";
import { MEAL_TYPES } from "../lib/mealTypes";
import { newMealId } from "../lib/mealId";
import { ensureSeedFoods } from "../lib/foodDb/foodDb";
import { BarcodeScanner } from "./BarcodeScanner";
import {
  buildMealsForSave,
  currentTime,
  emptyForm,
  gramsOrDefault,
  resolveMacroSource,
  macrosToFormFields,
  upsertMealTemplate,
  type MealFormState,
  type MealSaveTemplate,
} from "./meal-sheet/mealFormUtils";
import {
  macrosAreAllEmpty,
  parseMealMacroInputs,
  pickedFoodLabel,
  withoutSeededFields,
} from "./meal-sheet/mealMacroInputs";
import { PhotoStep } from "./meal-sheet/PhotoStep";
import { MealTypePicker } from "./meal-sheet/MealTypePicker";
import { NameTimeRow } from "./meal-sheet/NameTimeRow";
import type { PickedFood } from "./meal-sheet/FoodPickerSection";
import { useMealSourcePick } from "./meal-sheet/useMealSourcePick";
import { PickedFoodCard } from "./meal-sheet/PickedFoodCard";
import { useSavePickedFood } from "./meal-sheet/useSavePickedFood";
import { PortionUnitHint } from "./meal-sheet/PortionUnitHint";
import { PantryPortionField } from "./meal-sheet/PantryPortionField";
import { PackageEntryStep } from "./meal-sheet/PackageEntryStep";
import type { SourceTabId } from "./meal-sheet/SourceTabs";
import { SourceStep } from "./meal-sheet/SourceStep";
import { RememberForRepeat } from "./meal-sheet/RememberForRepeat";
import { AddMealSheetTitle } from "./meal-sheet/AddMealSheetTitle";
import { MacrosEditor } from "./meal-sheet/MacrosEditor";
import { SaveAsTemplate } from "./meal-sheet/SaveAsTemplate";
import { useEditedFoodRehydration } from "./meal-sheet/useEditedFoodRehydration";
import { useFoodSearch } from "./meal-sheet/useFoodSearch";
import { useBarcodeLookup } from "./meal-sheet/useBarcodeLookup";
import type { QuickChip } from "../hooks/useNutritionQuickChips";

/**
 * Грами порції з поля вводу; 100 г — дефолт, коли поле порожнє або зіпсоване.
 *
 * Раніше тут стояло `Number(pickedGrams) || 100`, і це мовчки зʼїдало кому:
 * «150,5» ставало `NaN`, `|| 100` перетворював його на 100 г, і в журнал
 * потрапляла НЕ та вага без жодного натяку користувачу. Тиха підміна даних
 * гірша за помилку, тому парсинг тут спільний із КБЖВ.
 */
interface AddMealSheetProps {
  open: boolean;
  onClose: () => void;
  /** `photoFile` — оригінал фото для мініатюри, коли страва прийшла з AI-аналізу. */
  onSave: (meal: Meal, photoFile?: File | null, newDate?: string) => void;
  /** День редагованого запису; з ним у формі зʼявляється поле «Дата» (перенос). */
  initialDate?: string | undefined;
  /** Записи цього ж прийому за вчора: непорожньо = на кроці джерела є «Як учора». */
  yesterdayMeals?: readonly Meal[] | undefined;
  onCopyYesterday?: (() => void) | undefined;
  /** `"photo"` — відкритись одразу на кроці аналізу фото (шорткати/CTA). */
  initialStep?: "source" | "photo" | undefined;
  /**
   * Тип прийому для НОВОГО запису. Порожньо — тип вгадує годинник
   * (`mealTypeByNow`), як для FAB. Заповнено рівно тоді, коли людина
   * тапнула конкретний сегмент hero-стрічки. На редагування не впливає:
   * там тип уже є в самому записі.
   */
  initialMealType?: MealTypeId | null | undefined;
  initialMeal?: Partial<Meal> | null | undefined;
  mealTemplates?: MealTemplate[] | undefined;
  setPrefs?: Dispatch<SetStateAction<NutritionPrefs>> | undefined;
  pantryItems?: PantryItem[] | undefined;
  onConsumePantryItem?: ((itemName: string, grams: number) => void) | undefined;
  quickChips?: readonly QuickChip[] | undefined;
  onQuickAddMeal?: ((chip: QuickChip) => void) | undefined;
}

/**
 * Результат кроку «фото», застосований до форми (photo → fill).
 *
 * `result` — повний `NutritionPhotoResult`, не звужений `MealFormPhotoResult`
 * (структурно сумісний із ним, тож `emptyForm(result)` і `MacrosEditor`
 * лишаються без змін): PR-3 (ініціатива 0023) читає звідси `items[]`, щоб
 * писати N рядків журналу замість одного злитого.
 */
interface AppliedPhoto {
  result: NutritionPhotoResult;
  file: File | null;
}

export function AddMealSheet({
  open,
  onClose,
  onSave,
  initialStep,
  initialMealType,
  initialMeal,
  initialDate,
  yesterdayMeals = [],
  onCopyYesterday,
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
  const savePicked = useSavePickedFood();
  const [sourceTab, setSourceTab] = useState<SourceTabId>("search");
  const [fromPantryItem, setFromPantryItem] = useState<string | null>(null);
  const [date, setDate] = useState("");
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
  const sourcePick = useMealSourcePick({
    foodQuery,
    search,
    setFoodQuery,
    setPickedFood,
    setPickedGrams,
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
  //
  // `meals` — завжди масив: PR-3 (ініціатива 0023) пише N рядків журналу
  // на одне фото-збереження (по одному на позицію), а не один злитий
  // рядок — масив довжини 1 покриває звичайний (не-фото) шлях без
  // гілкування. `template` несе агрегатні назву/тип/КБЖВ для «Запамʼятати
  // для повтору» — вони стосуються страви цілком, не окремого рядка.
  const [pendingMeal, setPendingMeal] = useState<{
    meals: Meal[];
    template: MealSaveTemplate;
  } | null>(null);
  const [rememberForRepeat, setRememberForRepeat] = useState(false);

  const [prevOpen, setPrevOpen] = useState(false);
  if (open && !prevOpen) {
    setPrevOpen(true);
    setDraftId(newMealId());
    setDate(initialDate ?? "");
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
        ...macrosToFormFields(mac),
        err: "",
      });
    } else {
      setForm(emptyForm(null, initialMealType));
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
    const pickedFoodName = pickedFoodLabel(pickedFood);
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
    const parsed = parseMealMacroInputs(form);
    if (!parsed.ok) {
      setForm((s) => ({ ...s, err: parsed.err }));
      return;
    }
    const { kcal, protein_g, fat_g, carbs_g } = parsed.macros;
    const mealLabel =
      MEAL_TYPES.find((m) => m.id === form.mealType)?.label || "Прийом їжі";
    const source = appliedPhoto ? "photo" : "manual";
    // Пріоритет foodId: новий вибір з pickedFood → інакше зберігаємо foodId з оригінальної страви.
    // Раніше при простому редагуванні страви з продуктом звʼязок з foodDb втрачався, бо pickedFood
    // скидається в null при відкритті схита.
    const effectiveFoodId = pickedFood?.id ?? initialMeal?.foodId ?? null;
    const hasAmount =
      pickedFood || fromPantryItem || initialMeal?.amount_g != null;
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
    const macroSource = resolveMacroSource({
      fromPhoto: !!appliedPhoto,
      hasPickedFood: !!pickedFood,
      form,
      initialMeal: initialMeal ?? {},
    });
    const macros = { kcal, protein_g, fat_g, carbs_g };
    // PR-3 (ініціатива 0023): фото-аналіз пише N рядків журналу — по одному
    // на позицію, не один злитий. Побудова винесена в `buildMealsForSave`
    // (`mealFormUtils.ts`) — сама логіка й обґрунтування там же.
    const meals = buildMealsForSave({
      photoItems: appliedPhoto?.result.items,
      time: form.time || currentTime(),
      mealType: form.mealType,
      label: mealLabel,
      fallbackName: name,
      fallback: {
        id: initialMeal?.id || draftId || newMealId(),
        macros,
        source,
        macroSource,
        foodId: effectiveFoodId ? String(effectiveFoodId) : null,
        amount_g: hasAmount ? gramsOrDefault(pickedGrams) : null,
      },
    });
    // Founder decision: warn, don't block. A meal with all-empty/zero
    // macros (photo AI couldn't identify the food, or a manual entry with
    // nothing typed in) won't move the daily stats at all — surface a
    // confirm step instead of silently saving a meaningless entry. Checked
    // per-row against what's actually being saved, not the (possibly
    // hand-edited) aggregate form fields.
    const template = { name, mealType: form.mealType, macros };
    if (meals.every((m) => macrosAreAllEmpty(m.macros))) {
      setPendingMeal({ meals, template });
      return;
    }
    finalizeSave(meals, template);
  }

  function finalizeSave(meals: Meal[], template: MealSaveTemplate) {
    savePicked.persist(pickedFood);
    if (fromPantryItem && onConsumePantryItem) {
      const grams = gramsOrDefault(pickedGrams);
      onConsumePantryItem(fromPantryItem, grams);
    }
    if (rememberForRepeat && !initialMeal?.id && setPrefs) {
      setPrefs((prefs) => ({
        ...prefs,
        mealTemplates: upsertMealTemplate(
          Array.isArray(prefs.mealTemplates) ? prefs.mealTemplates : [],
          template,
        ),
      }));
    }
    hapticSuccess();
    // По одному виклику `onSave` на рядок: undo-тост нижче за течією
    // (`NutritionOverlays`/`wrappedSaveMeal`) знімає РІВНО той рядок, що
    // додав, тож людина може відмінити одну хибну позицію з N, не чіпаючи
    // решту. Сигнатура `onSave(meal, file)` лишається незмінною — жоден
    // консюмер поза цим файлом не знає про розбивку на кілька рядків.
    // Дата йде лише коли її справді змінили: порожнє поле (стерте) не переносить.
    const movedTo =
      initialMeal?.id && initialDate && date && date !== initialDate
        ? date
        : undefined;
    meals.forEach((meal) => onSave(meal, appliedPhoto?.file ?? null, movedTo));
  }

  function handleConfirmEmptyMacrosSave() {
    if (pendingMeal) finalizeSave(pendingMeal.meals, pendingMeal.template);
    setPendingMeal(null);
  }

  function handleCancelEmptyMacrosSave() {
    setPendingMeal(null);
  }

  const photoMacros = appliedPhoto?.result.macros;
  const hasPhotoMacros = !!photoMacros && !macrosAreAllEmpty(photoMacros);

  // Photo → fill: seed the form from the analysis (same `emptyForm` path
  // the old host-held photoResult used at sheet-open) and remember the
  // applied result for macroSource/thumbnail. A picked food/pantry item
  // from an earlier detour must not survive alongside photoAI macros.
  function handlePhotoApply(result: NutritionPhotoResult, file: File | null) {
    setPickedFood(null);
    setFromPantryItem(null);
    setForm(emptyForm(result));
    setAppliedPhoto({ result, file });
    setStep("fill");
  }

  // Крок «з упаковки» → «fill»: продукт ще не в базі (його пише
  // `finalizeSave`), лишається звʼязати його з прийомом. Макроси форми не чіпаємо тут —
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
      ? pickedFoodLabel(pickedFood)
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
      setForm((s) => withoutSeededFields(s, seededName));
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
    // Відкладений автопідбір мусить згаснути разом із джерелом: інакше
    // пошук, що відповість уже після виходу, поверне аркуш на
    // «Заповнення» з продуктом, від якого людина щойно відмовилась.
    sourcePick.cancelAutoPick();
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
          <SourceStep
            yesterdayMeals={yesterdayMeals}
            onCopyYesterday={onCopyYesterday}
            sourceTab={sourceTab}
            onTabChange={setSourceTab}
            search={{
              mealTemplates,
              setForm,
              setPrefs,
              onTemplateSelected: () => setStep("fill"),
              onEditTemplate: (t) => setEditingTemplateId(t.id),
              quickChips,
              onQuickAddMeal,
              onQuickAdded: onClose,
              pantryItems,
              sourcePick,
              fromPantryItem,
              setFromPantryItem,
              picker: {
                foodQuery,
                setFoodQuery,
                foodHits,
                offHits,
                foodBusy,
                offBusy,
                foodErr,
                searchSettled: search.searchSettled,
                setPickedFood,
                setPickedGrams,
              },
            }}
            barcode={{
              barcodeStatus,
              setBarcodeStatus,
              barcodeNotice,
              onDismissBarcodeNotice: () => setBarcodeNotice(null),
              onRetryBarcodeLookup: () => void handleBarcodeLookup(barcode),
              onUsePhotoForBarcode: () => setSourceTab("photo"),
              onManualEntryForBarcode: () => {
                setBarcodeNotice(null);
                setSourceTab("manual");
              },
              setScannerOpen,
              actionLabel: "Сканувати ще раз",
            }}
            onPhotoApply={handlePhotoApply}
            onPackageCreated={handlePackageCreated}
            onWholeMeal={() => setStep("fill")}
          />
        ) : step === "photo" ? (
          <PhotoStep onApply={handlePhotoApply} />
        ) : step === "package" ? (
          <PackageEntryStep onCreated={handlePackageCreated} />
        ) : (
          <>
            <MealTypePicker mealType={form.mealType} setForm={setForm} />

            <NameTimeRow form={form} field={field} setForm={setForm} />

            {initialMeal?.id && initialDate && (
              <div className="mb-4">
                <SectionHeading
                  as="div"
                  size="xs"
                  variant="nutrition"
                  className="mb-1"
                >
                  Дата
                </SectionHeading>
                <DateField
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  aria-label="Дата запису"
                />
              </div>
            )}

            {pickedFood ? (
              <PickedFoodCard
                setForm={setForm}
                pickedFood={pickedFood}
                pickedGrams={pickedGrams}
                setPickedGrams={setPickedGrams}
                onChangeProduct={handleChangeProduct}
                skipInitialRescale={editedFood.rehydrated}
                onUnitChange={savePicked.onUnitChange}
              />
            ) : fromPantryItem ? (
              <PantryPortionField
                value={pickedGrams}
                onChange={setPickedGrams}
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
                <RememberForRepeat
                  checked={rememberForRepeat}
                  onChange={setRememberForRepeat}
                />
              )
            )}

            <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-2">
              <Button
                type="button"
                className="h-12 min-h-[44px] bg-nutrition-strong text-white hover:bg-nutrition-hover dark:bg-nutrition dark:text-bg dark:hover:bg-nutrition/90"
                onClick={handleSave}
              >
                {initialMeal?.id ? "Зберегти зміни" : "Додати прийом"}
              </Button>
              <Button
                type="button"
                variant="outline"
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
