/**
 * Last validated: 2026-11-18
 * Status: Active
 *
 * Пропси `AddMealSheet`. Винесено з компонента під стелю Hard Rule #18.
 */
import type { Dispatch, SetStateAction } from "react";
import type {
  Meal,
  MealTemplate,
  MealTypeId,
  NutritionPrefs,
  PantryItem,
} from "@sergeant/nutrition-domain";
import type { QuickChip } from "../../hooks/useNutritionQuickChips";
import type { LastFoodPortion } from "../../lib/lastFoodPortion";
import type { PhotoQuickMeals } from "./photoQuickSave";
import type { SourceTabId } from "./SourceTabs";

export interface AddMealSheetProps {
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
  /** Вкладка кроку джерела на відкритті; без неї «Пошук». */
  initialSourceTab?: SourceTabId | undefined;
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
  /** Вага минулого запису продукту (OD-27 Х-1 б). */
  getLastFoodPortion?: ((foodId: string) => LastFoodPortion | null) | undefined;
  /** «Зберегти в журнал» після фото пише одразу (Х-2 а); `false` — збій. */
  onPhotoSave?:
    ((photo: PhotoQuickMeals, file: File | null) => boolean) | undefined;
}
