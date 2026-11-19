/**
 * Last validated: 2026-11-18
 * Status: Active
 *
 * «Зберегти в журнал» після аналізу фото записує страву одним натисканням
 * (OD-27 Х-2 а, рішення власника 2026-11-18). Пише через той самий
 * `log.handleAddMeal`, що й форма прийому і чип «Нещодавні», без
 * паралельного шару збереження.
 *
 * Тост «Записав у вечерю: …, 486 ккал» несе «Змінити»: воно відкриває аркуш
 * цього прийому за сьогодні (`MealTypeSheet`), де кожен щойно записаний
 * рядок можна відкрити на редагування (тип, вага, КБЖВ) і видалити свайпом.
 * Аркуш показує лише сьогодні, тож запис в інший день (обраний у Журналі)
 * отримує «Скасувати», як інші швидкі записи.
 *
 * Збій посеред N рядків не лишає половини страви: уже записані рядки
 * знімаються, і тост каже про помилку, а не «Записав».
 */
import { useCallback } from "react";
import {
  todayISODate,
  type Meal,
  type MealTypeId,
} from "@sergeant/nutrition-domain";
import type { ToastApi } from "@shared/hooks/useToast";
import { messages } from "@shared/i18n/uk";
import {
  fileToThumbnailBlob,
  saveMealThumbnail,
} from "../lib/mealPhotoStorage";
import type { PhotoQuickMeals } from "../components/meal-sheet/photoQuickSave";
import type { MealPantryLink, MealPantryOffer } from "./useMealPantryOffer";

interface PhotoQuickSaveLog {
  handleAddMeal: (meal: Meal) => string;
  handleRemoveMeal: (date: string, id: string) => void;
}

async function saveThumbnails(file: File, ids: readonly string[]) {
  const blob = await fileToThumbnailBlob(file);
  if (!blob) return;
  await Promise.all(ids.map((id) => saveMealThumbnail(id, blob)));
}

export function usePhotoQuickSave({
  log,
  toast,
  onEdit,
  pantryOffer,
}: {
  log: PhotoQuickSaveLog;
  toast: ToastApi;
  /** Відкрити аркуш прийому за сьогодні; немає — тост дає «Скасувати». */
  onEdit?: ((mealType: MealTypeId) => void) | undefined;
  /** «Списати … із комори?» (OD-27 Х-4 а): лише фото з однією позицією. */
  pantryOffer?: MealPantryOffer | undefined;
}): (photo: PhotoQuickMeals, file: File | null) => boolean {
  return useCallback(
    function save(photo: PhotoQuickMeals, file: File | null): boolean {
      const { meals, title } = photo;
      const copy = messages.nutrition.repeat;
      const added: Array<{ date: string; id: string }> = [];
      try {
        for (const meal of meals) {
          added.push({ date: log.handleAddMeal(meal), id: meal.id });
        }
      } catch {
        added.forEach(({ date, id }) => log.handleRemoveMeal(date, id));
        // Аркуш лишається на кроці фото, тож повтор — та сама дія ще раз.
        toast.error(copy.photoSaveFailed, undefined, {
          label: copy.retry,
          onClick: () => void save(photo, file),
        });
        return false;
      }
      if (file)
        void saveThumbnails(
          file,
          added.map((a) => a.id),
        ).catch(() => {});
      const mealType = meals[0]?.mealType ?? "snack";
      const kcal = Math.round(
        meals.reduce((sum, m) => sum + (Number(m.macros?.kcal) || 0), 0),
      );
      const msg = copy.photoSaved
        .replace("{meal}", copy.into[mealType])
        .replace("{name}", title)
        .replace("{kcal}", String(kcal));
      const today = added.every((a) => a.date === todayISODate());
      const pending: { link?: MealPantryLink | undefined } = {};
      const recordToastId = toast.success(
        msg,
        undefined,
        onEdit && today
          ? { label: copy.edit, onClick: () => onEdit(mealType) }
          : {
              label: "Скасувати",
              kind: "undo",
              onClick: () => {
                added.forEach(({ date, id }) => log.handleRemoveMeal(date, id));
                pending.link?.undo();
              },
            },
      );
      // Фото з кількома позиціями списання не пропонує (П-7 Б).
      pending.link = pantryOffer?.(meals.length === 1 ? meals : [], {
        after: recordToastId,
      });
      return true;
    },
    [log, toast, onEdit, pantryOffer],
  );
}
