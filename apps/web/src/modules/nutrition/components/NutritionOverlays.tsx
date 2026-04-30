import type { Dispatch, SetStateAction } from "react";
import type { Meal, NutritionPrefs } from "@sergeant/nutrition-domain";
import type { MealFormPhotoResult } from "./meal-sheet/mealFormUtils";
import { PantryManagerSheet } from "./PantryManagerSheet";
import { ItemEditSheet } from "./ItemEditSheet";
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
  wrappedSaveMeal: (meal: Meal) => void | Promise<void>;
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
  onRequestMealPhoto?: () => void;
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
  onRequestMealPhoto,
}: NutritionOverlaysProps) {
  return (
    <>
      <PantryManagerSheet
        open={pantry.pantryManagerOpen}
        onClose={() => pantry.setPantryManagerOpen(false)}
        pantries={pantry.pantries}
        activePantryId={pantry.activePantryId}
        setActivePantryId={pantry.setActivePantryId}
        pantryForm={pantry.pantryForm}
        setPantryForm={pantry.setPantryForm}
        busy={busy}
        onSavePantryForm={pantry.onSavePantryForm}
        onBeginCreate={pantry.beginCreatePantry}
        onBeginRename={pantry.beginRenamePantry}
        onBeginDelete={pantry.beginDeletePantry}
      />

      <ConfirmDialog
        open={pantry.confirmDeleteOpen}
        title="Видалити склад?"
        description={
          (Array.isArray(pantry.pantries) ? pantry.pantries.length : 0) <= 1
            ? "Не можна видалити останній склад."
            : "Це прибере всі продукти в ньому. Дію не можна відмінити."
        }
        confirmLabel="Видалити"
        danger
        onConfirm={() => {
          // Mirror the original `ConfirmDeleteSheet` guard: if only one
          // pantry remains we swallow the confirm so deletion is a no-op.
          // The warning description above already communicates that state.
          const count = Array.isArray(pantry.pantries)
            ? pantry.pantries.length
            : 0;
          if (count <= 1) {
            pantry.setConfirmDeleteOpen(false);
            return;
          }
          pantry.onConfirmDeletePantry();
        }}
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
          log.setAddMealPhotoResult(null);
          setEditingMeal(null);
        }}
        onSave={wrappedSaveMeal}
        photoResult={
          log.addMealPhotoResult as MealFormPhotoResult | null | undefined
        }
        initialMeal={editingMeal}
        mealTemplates={prefs.mealTemplates || []}
        setPrefs={setPrefs}
        pantryItems={pantry.effectiveItems}
        onConsumePantryItem={pantry.consumePantryItem}
        onRequestPhoto={onRequestMealPhoto}
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
