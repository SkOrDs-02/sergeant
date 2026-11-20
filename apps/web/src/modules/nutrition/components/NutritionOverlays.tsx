/**
 * Last validated: 2026-06-15
 * Status: Active
 */
import type { Dispatch, SetStateAction } from "react";
import {
  todayISODate,
  type Meal,
  type MealTypeId,
  type NutritionPrefs,
} from "@sergeant/nutrition-domain";
import { showUndoToast } from "@shared/lib/ui/undoToast";
import {
  useCopyYesterdayMeals,
  yesterdayMealsOf,
} from "../hooks/useCopyYesterdayMeals";
import { usePhotoQuickSave } from "../hooks/usePhotoQuickSave";
import { useSavedRecipes } from "../hooks/useSavedRecipes";
import type { MealPantryOffer } from "../hooks/useMealPantryOffer";
import type { MealSaveExtras } from "./meal-sheet/addMealSheetProps";
import { lastFoodPortion } from "../lib/lastFoodPortion";
import type { useToast } from "@shared/hooks/useToast";
import { mealsByTypeForDay } from "../lib/nutritionStats";
import { PantryManagerSheet } from "./PantryManagerSheet";
import { ItemEditSheet } from "./ItemEditSheet";
import { PantryVariantChoiceSheet } from "./PantryVariantChoiceSheet";
import { BarcodeScanner } from "./BarcodeScanner";
import { AddMealSheet } from "./AddMealSheet";
import { MealTypeSheet } from "./MealTypeSheet";
import { InputDialog } from "@shared/components/ui/InputDialog";
import { ConfirmDialog } from "@shared/components/ui/ConfirmDialog";
import type {
  BackupPasswordDialogState,
  EditingMealState,
  RestoreConfirmState,
} from "../hooks/useNutritionUiState";
import type { useNutritionPantries } from "../hooks/useNutritionPantries";
import type { useNutritionLog } from "../hooks/useNutritionLog";
import type { SourceTabId } from "./meal-sheet/SourceTabs";
import {
  useNutritionQuickChips,
  type QuickChip,
} from "../hooks/useNutritionQuickChips";
import { quickMealType } from "../lib/quickMealType";
import {
  useFavoritesFirst,
  useNutritionFavorites,
} from "../hooks/useNutritionFavorites";
import {
  markComposeSaved,
  useComposeTelemetry,
} from "../../../core/observability/composeTelemetry";

/** Стабільний ключ виміру тертя — той самий на всіх відкриттях шита. */
const NUTRITION_MEAL_COMPOSE_KEY = "nutrition:add-meal";

type PantryController = ReturnType<typeof useNutritionPantries>;
type LogController = ReturnType<typeof useNutritionLog>;
type Toast = ReturnType<typeof useToast>;

interface NutritionOverlaysProps {
  pantry: PantryController;
  log: LogController;
  busy?: boolean;
  pantryScannerOpen: boolean;
  setPantryScannerOpen: Dispatch<SetStateAction<boolean>>;
  handlePantryBarcodeDetected: (barcode: string) => void | Promise<void>;
  editingMeal: EditingMealState | null;
  setEditingMeal: Dispatch<SetStateAction<EditingMealState | null>>;
  wrappedSaveMeal: (
    meal: Meal,
    photoFile?: File | null,
    newDate?: string,
    extras?: MealSaveExtras,
  ) => void | Promise<void>;
  prefs: NutritionPrefs;
  setPrefs: Dispatch<SetStateAction<NutritionPrefs>>;
  backupPasswordDialog: BackupPasswordDialogState | null;
  setBackupPasswordDialog: Dispatch<
    SetStateAction<BackupPasswordDialogState | null>
  >;
  handleBackupPasswordConfirm: (password: string) => void | Promise<void>;
  restoreConfirm: RestoreConfirmState | null;
  setRestoreConfirm: Dispatch<SetStateAction<RestoreConfirmState | null>>;
  applyRestorePayload: (payload: unknown) => void | Promise<void>;
  /** `"photo"` — AddMealSheet відкривається одразу на кроці аналізу фото. */
  addMealInitialStep?: "source" | "photo" | undefined;
  /** Вкладка кроку «Джерело страви»: рядок аркуша «Додати». */
  addMealInitialSourceTab?: SourceTabId | undefined;
  /** Тип прийому, обраний тапом по сегменту hero; `null` — вгадує годинник. */
  addMealInitialMealType?: MealTypeId | null | undefined;
  onQuickAddMeal?: (chip: QuickChip, mealType?: MealTypeId) => void;
  /** Тип прийому, розгорнутий тапом по сегменту hero; `null` — закрито. */
  openMealTypeSheet?: MealTypeId | null | undefined;
  /** «Змінити» з тосту фото-запису: аркуш прийому за сьогодні (Х-2 а). */
  onOpenMealTypeSheet?: ((type: MealTypeId) => void) | undefined;
  onCloseMealTypeSheet?: (() => void) | undefined;
  /** Потрібен аркушу прийому — undo після видалення свайпом. */
  toast: Toast;
  /** «Списати … із комори?» після швидких записів (OD-27 Х-4 а). */
  pantryOffer?: MealPantryOffer | undefined;
}

export function NutritionOverlays({
  pantry,
  log,
  busy,
  pantryScannerOpen,
  setPantryScannerOpen,
  handlePantryBarcodeDetected,
  editingMeal,
  setEditingMeal,
  wrappedSaveMeal,
  prefs,
  setPrefs,
  backupPasswordDialog,
  setBackupPasswordDialog,
  handleBackupPasswordConfirm,
  restoreConfirm,
  setRestoreConfirm,
  applyRestorePayload,
  addMealInitialStep,
  addMealInitialSourceTab,
  addMealInitialMealType,
  onQuickAddMeal,
  openMealTypeSheet = null,
  onOpenMealTypeSheet,
  onCloseMealTypeSheet,
  toast,
  pantryOffer,
}: NutritionOverlaysProps) {
  // Тертя запису їжі (`entry_compose_finished`, §6 контракту). Вимір
  // висить на ЄДИНОМУ прапорці відкриття шита, а не на кнопках, які його
  // відкривають: тих кнопок чотири (FAB, quick-chip, журнал, PWA-екшен),
  // і телеметрія в кожній з них розійшлася б із першим же новим входом.
  //
  // `entry_kind` розділяє додавання і редагування: у них різний профіль
  // тертя (в редагуванні поля вже заповнені), і схлопування їх в одне
  // значення зробило б медіану несумісною сама з собою.
  useComposeTelemetry({
    key: NUTRITION_MEAL_COMPOSE_KEY,
    open: log.addMealSheetOpen,
    module: "nutrition",
    entryKind: editingMeal ? "meal_edit" : "meal",
    surface: addMealInitialStep ?? "source",
  });

  // Х-3 (б): частота в прийомі, з яким відкрито аркуш (або за годинником).
  const quickChips = useNutritionQuickChips(
    log.nutritionLog,
    pantry.effectiveItems,
    quickMealType(addMealInitialMealType),
  );

  // Рядки прийому, розгорнутого тапом по сегменту hero. Читаємо журнал
  // НАПРЯМУ, а не приймаємо пропом: видалення свайпом усередині аркуша
  // має зникати з нього ж. День тут завжди СЬОГОДНІШНІЙ (`todayISODate` —
  // той самий, за яким стрічку рахує `NutritionDashboard`), тож
  // `log.selectedDate` журналу до цього аркуша не стосується.
  const mealTypeSheetDate = todayISODate();
  const mealTypeSheetMeals = openMealTypeSheet
    ? mealsByTypeForDay(log.nutritionLog, mealTypeSheetDate)[openMealTypeSheet]
    : [];

  // «Як учора» на порожньому прийомі: лише коли сегмент hero відкрив форму з
  // обраним типом, а не FAB і не редагування.
  const yesterdayMeals =
    log.addMealSheetOpen && addMealInitialMealType && !editingMeal
      ? yesterdayMealsOf(log, addMealInitialMealType)
      : [];
  const copyYesterday = useCopyYesterdayMeals({ log, toast, pantryOffer });
  const photoQuickSave = usePhotoQuickSave({
    log,
    toast,
    onEdit: onOpenMealTypeSheet,
    pantryOffer,
  });
  // «Мої рецепти» як джерело форми (OD-27 Х-3 в): книга читається, коли
  // аркуш відкрито на новий запис, тож щойно збережений рецепт уже є.
  const recipeBook = useSavedRecipes(log.addMealSheetOpen && !editingMeal);
  // Х-3 (б): улюблені рецепти вгору «Моїх рецептів» у формі прийому.
  const favorites = useNutritionFavorites(prefs, setPrefs);
  const savedRecipes = useFavoritesFirst(recipeBook.saved, favorites.recipeIds);

  return (
    <>
      <PantryManagerSheet
        open={pantry.pantryManagerOpen}
        onClose={() => pantry.setPantryManagerOpen(false)}
        pantries={pantry.pantries}
        pantryForm={pantry.pantryForm}
        setPantryForm={pantry.setPantryForm}
        busy={busy}
        onSavePantryForm={pantry.onSavePantryForm}
        onBeginCreate={pantry.beginCreatePantry}
        onBeginRename={pantry.beginRenamePantry}
        onBeginDelete={pantry.beginDeletePantry}
        redistributePlan={pantry.redistributePlan}
        onRedistribute={pantry.applyRedistribute}
      />

      {/*
        Видаляються лише ВЛАСНІ місця — три відомі лишаються завжди, бо
        вони адреси автовизначення. Гейт стоїть у хуку
        (`beginDeletePantry`), тут — лише підтвердження.
      */}
      <ConfirmDialog
        open={pantry.confirmDeleteOpen}
        title="Видалити місце?"
        description="Це прибере всі продукти в ньому. Дію не можна відмінити."
        confirmLabel="Видалити"
        danger
        onConfirm={pantry.onConfirmDeletePantry}
        onCancel={() => pantry.setConfirmDeleteOpen(false)}
      />

      <ItemEditSheet
        itemEdit={pantry.itemEdit}
        setItemEdit={pantry.setItemEdit}
        onClose={() =>
          pantry.setItemEdit((s) => ({
            ...s,
            open: false,
          }))
        }
        onSave={pantry.onSaveItemEdit}
        places={pantry.pantries}
      />

      <PantryVariantChoiceSheet
        choice={pantry.variantChoice}
        onResolve={pantry.resolveVariantChoice}
      />

      {pantryScannerOpen && (
        <BarcodeScanner
          onDetected={handlePantryBarcodeDetected}
          onClose={() => setPantryScannerOpen(false)}
        />
      )}

      <AddMealSheet
        open={log.addMealSheetOpen}
        onClose={() => {
          log.setAddMealSheetOpen(false);
          setEditingMeal(null);
        }}
        onSave={(meal, photoFile, newDate, extras) => {
          // Позначка ДО консюмерського шляху: подію емітить закриття шита
          // (перехід `open` → false), і воно прилітає вже після цього
          // виклику. Без позначки збережений запис пішов би в статистику
          // як `abandoned`.
          markComposeSaved(NUTRITION_MEAL_COMPOSE_KEY);
          return wrappedSaveMeal(meal, photoFile, newDate, extras);
        }}
        initialStep={addMealInitialStep}
        initialSourceTab={addMealInitialSourceTab}
        initialMealType={addMealInitialMealType}
        initialMeal={editingMeal}
        initialDate={editingMeal?.date}
        yesterdayMeals={yesterdayMeals}
        onCopyYesterday={() => {
          if (addMealInitialMealType)
            copyYesterday(yesterdayMeals, addMealInitialMealType);
        }}
        // Х-1 (б): вага минулого запису продукту — з журналу, без сховища.
        getLastFoodPortion={(foodId) =>
          lastFoodPortion(log.nutritionLog, foodId)
        }
        onPhotoSave={(photo, file) => {
          // Позначка лише за успіху: збій лишає аркуш відкритим.
          const saved = photoQuickSave(photo, file);
          if (saved) markComposeSaved(NUTRITION_MEAL_COMPOSE_KEY);
          return saved;
        }}
        mealTemplates={prefs.mealTemplates || []}
        setPrefs={setPrefs}
        pantryItems={pantry.effectiveItems}
        quickChips={quickChips}
        // Чип «Нещодавні» пише тип прийому, з яким відкрито аркуш (тап по
        // сегменту «Вечеря»), а не той, що вгадав би годинник у мить тапу.
        onQuickAddMeal={
          onQuickAddMeal
            ? (chip: QuickChip) =>
                onQuickAddMeal(chip, addMealInitialMealType ?? undefined)
            : undefined
        }
        onConsumePantryItem={pantry.consumePantryItem}
        savedRecipes={savedRecipes}
        favorites={favorites}
      />

      {/* Аркуш одного прийому hero-стрічки — див. `mealTypeSheetMeals`. */}
      <MealTypeSheet
        mealType={openMealTypeSheet}
        date={mealTypeSheetDate}
        meals={mealTypeSheetMeals}
        onClose={() => onCloseMealTypeSheet?.()}
        onEditMeal={(date, meal) => {
          // Рівно те саме, що робить рядок журналу (`NutritionLogPage`):
          // форма редагування — один аркуш на весь модуль, і відкривається
          // він парою «сід у `editingMeal` + підняти `AddMealSheet`».
          onCloseMealTypeSheet?.();
          setEditingMeal({ date, ...meal });
          log.setAddMealSheetOpen(true);
        }}
        onRemoveMeal={(date, meal) => {
          if (!meal?.id) return;
          // Останній рядок прийому — закриваємо аркуш разом із ним:
          // порожній аркуш без кнопки додавання є глухим кутом, а сегмент
          // hero, з якого його відкрили, стає порожнім у ту саму мить.
          if (mealTypeSheetMeals.length <= 1) onCloseMealTypeSheet?.();
          log.handleRemoveMeal(date, meal);
          // Той самий undo, що й у журналі: свайп — незворотний жест, і
          // аркуш не є приводом позбавляти його страхувальної сітки.
          showUndoToast(toast, {
            msg: "Запис видалено",
            onUndo: () => log.handleRestoreMeal(date, meal),
          });
        }}
      />

      <InputDialog
        open={!!backupPasswordDialog}
        title={backupPasswordDialog?.title || ""}
        description={backupPasswordDialog?.description || ""}
        type="password"
        placeholder="Пароль"
        confirmLabel={
          backupPasswordDialog?.mode === "download"
            ? "Розшифрувати"
            : "Зашифрувати"
        }
        onConfirm={handleBackupPasswordConfirm}
        onCancel={() => setBackupPasswordDialog(null)}
      />

      <ConfirmDialog
        open={!!restoreConfirm}
        title="Відновити бекап?"
        description="Це перезапише поточні дані харчування на цьому пристрої."
        confirmLabel="Відновити"
        danger
        onConfirm={() => {
          applyRestorePayload(restoreConfirm?.payload);
          setRestoreConfirm(null);
        }}
        onCancel={() => setRestoreConfirm(null)}
      />
    </>
  );
}
