/**
 * Last validated: 2026-11-18
 * Status: Active
 *
 * Кнопка «+ Додати» в куті Огляду й Журналу та аркуш «Додати». Над
 * джерелами — повтор звичної їжі (OD-27 Х-3 а): «Як учора» для прийому, який
 * зараз за годинником, і чипи «Нещодавні». Винесено з `NutritionApp` під
 * стелю Hard Rule #18; джерела не змінились.
 */
import type { MealTypeId, PantryItem } from "@sergeant/nutrition-domain";
import { AddAction } from "@shared/components/ui/CornerAction";
import type { ToastApi } from "@shared/hooks/useToast";
import { messages } from "@shared/i18n/uk";
import {
  useCopyYesterdayMeals,
  yesterdayMealsOf,
} from "../hooks/useCopyYesterdayMeals";
import {
  useNutritionQuickChips,
  type QuickChip,
} from "../hooks/useNutritionQuickChips";
import { WATER_ADD_EVENT } from "../hooks/useWaterTracker";
import { quickMealType } from "../lib/quickMealType";
import type { NutritionPage } from "../lib/nutritionRouter";
import { AddSheetRepeat } from "./AddSheetRepeat";
import type { MealPantryOffer } from "../hooks/useMealPantryOffer";
import type { SourceTabId } from "./meal-sheet/SourceTabs";

interface NutritionAddActionProps {
  activePage: NutritionPage;
  log: Parameters<typeof useCopyYesterdayMeals>[0]["log"];
  pantryItems: readonly PantryItem[];
  toast: ToastApi;
  onOpenAt: (tab: SourceTabId) => void;
  onOpenPhoto: () => void;
  onQuickAdd: (chip: QuickChip, mealType?: MealTypeId) => void;
  /** «Списати … із комори?» після «Як учора» (OD-27 Х-4 а). */
  pantryOffer?: MealPantryOffer | undefined;
}

export function NutritionAddAction({
  activePage,
  log,
  pantryItems,
  toast,
  onOpenAt,
  onOpenPhoto,
  onQuickAdd,
  pantryOffer,
}: NutritionAddActionProps) {
  // Х-3 (б): чипи за частотою в прийомі поточного часу доби.
  const chips = useNutritionQuickChips(
    log.nutritionLog,
    pantryItems,
    quickMealType(),
  );
  const copyYesterday = useCopyYesterdayMeals({ log, toast, pantryOffer });
  if (activePage !== "start" && activePage !== "log") return null;
  const src = messages.nutrition.addSources;
  return (
    <AddAction
      // Рахується в мить відкриття аркуша: тип прийому і «вчора» беруть
      // годинник тапу, а не рендеру сторінки.
      lead={(close) => {
        const mealType = quickMealType();
        const yesterday = yesterdayMealsOf(log, mealType);
        return (
          <AddSheetRepeat
            yesterdayMeals={yesterday}
            onCopyYesterday={() => copyYesterday(yesterday, mealType)}
            chips={chips}
            onQuickAdd={(chip) => onQuickAdd(chip)}
            onDone={close}
          />
        );
      }}
      sources={[
        { id: "search", ...src.search, onSelect: () => onOpenAt("search") },
        { id: "scan", ...src.scan, onSelect: () => onOpenAt("scan") },
        { id: "photo", ...src.photo, onSelect: onOpenPhoto },
        { id: "manual", ...src.manual, onSelect: () => onOpenAt("manual") },
        // Вода лише на Огляді, де живе її картка.
        ...(activePage === "start"
          ? [
              {
                id: "water",
                ...src.water,
                onSelect: () =>
                  window.dispatchEvent(new Event(WATER_ADD_EVENT)),
              },
            ]
          : []),
      ]}
    />
  );
}
