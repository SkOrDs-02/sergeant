/**
 * Last validated: 2026-06-15
 * Status: Active
 */
import type { Dispatch, SetStateAction } from "react";
import type { Meal, NutritionPrefs } from "@sergeant/nutrition-domain";
import { PantryManagerSheet } from "./PantryManagerSheet";
import { ItemEditSheet } from "./ItemEditSheet";
import { PantryVariantChoiceSheet } from "./PantryVariantChoiceSheet";
import { BarcodeScanner } from "./BarcodeScanner";
import { AddMealSheet } from "./AddMealSheet";
import { InputDialog } from "@shared/components/ui/InputDialog";
import { ConfirmDialog } from "@shared/components/ui/ConfirmDialog";
import type {
  BackupPasswordDialogState,
  EditingMealState,
  RestoreConfirmState,
} from "../hooks/useNutritionUiState";
import type { useNutritionPantries } from "../hooks/useNutritionPantries";
import type { useNutritionLog } from "../hooks/useNutritionLog";
import {
  useNutritionQuickChips,
  type QuickChip,
} from "../hooks/useNutritionQuickChips";
import {
  markComposeSaved,
  useComposeTelemetry,
} from "../../../core/observability/composeTelemetry";

/** Стабільний ключ виміру тертя — той самий на всіх відкриттях шита. */
const NUTRITION_MEAL_COMPOSE_KEY = "nutrition:add-meal";

type PantryController = ReturnType<typeof useNutritionPantries>;
type LogController = ReturnType<typeof useNutritionLog>;

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
  onQuickAddMeal?: (chip: QuickChip) => void;
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
  onQuickAddMeal,
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

  const quickChips = useNutritionQuickChips(
    log.nutritionLog,
    pantry.effectiveItems,
  );

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
        onSave={(meal, photoFile) => {
          // Позначка ДО консюмерського шляху: подію емітить закриття шита
          // (перехід `open` → false), і воно прилітає вже після цього
          // виклику. Без позначки збережений запис пішов би в статистику
          // як `abandoned`.
          markComposeSaved(NUTRITION_MEAL_COMPOSE_KEY);
          return wrappedSaveMeal(meal, photoFile);
        }}
        initialStep={addMealInitialStep}
        initialMeal={editingMeal}
        mealTemplates={prefs.mealTemplates || []}
        setPrefs={setPrefs}
        pantryItems={pantry.effectiveItems}
        quickChips={quickChips}
        onQuickAddMeal={onQuickAddMeal}
        onConsumePantryItem={pantry.consumePantryItem}
      />

      <InputDialog
        open={!!backupPasswordDialog}
        title={backupPasswordDialog?.title || ""}
        description={backupPasswordDialog?.description || ""}
        type="password"
        placeholder="Пароль"
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
