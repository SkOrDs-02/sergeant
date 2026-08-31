/**
 * Last validated: 2026-08-17
 * Status: Active
 *
 * AI-CONTEXT: тут стояла CTA-картка «Аналіз фото страви» — спершу повний
 * дубль UI аналізу у згорнутому `<details>`, потім (після переносу аналізу
 * в крок sheet-а) тонка кнопка-ярлик у хвості сторінки. Прибрана 2026-08-17
 * як другий вхід у той самий флоу: канонічний шлях — «Додати прийом їжі» →
 * джерело «Фото» (`meal-sheet/PhotoStep`), а поза модулем лишається
 * hub quick-action `add_meal_photo` (long-press на бенто-картці «Їжа»).
 * Не повертай картку без продуктового рішення: `NutritionApp` уміє
 * відкривати sheet одразу на кроці фото (`addMealInitialStep`), тож
 * будь-який новий вхід має йти через `handleOpenMealPhoto`, а не рендерити
 * власний аналіз.
 */
import type { NutritionPrefs } from "@sergeant/nutrition-domain";
import { SectionErrorBoundary } from "@shared/components/ui/SectionErrorBoundary";
import { useLocale } from "@shared/i18n/useLocale";
import { NutritionDashboard } from "../components/NutritionDashboard";
import type { useNutritionLog } from "../hooks/useNutritionLog";
import type { NutritionPage } from "../lib/nutritionRouter";

type LogController = ReturnType<typeof useNutritionLog>;

interface NutritionStartPageProps {
  log: LogController;
  prefs: NutritionPrefs;
  setActivePageAndHash: (page: NutritionPage) => void;
  onRequestAddMeal: () => void;
}

export function NutritionStartPage({
  log,
  prefs,
  setActivePageAndHash,
  onRequestAddMeal,
}: NutritionStartPageProps) {
  const { messages } = useLocale();
  return (
    <SectionErrorBoundary key="page-start" title="Не вдалось показати «Їжа»">
      <>
        <h1 className="sr-only">{messages.nav.nutritionOverview}</h1>
        <NutritionDashboard
          log={log.nutritionLog}
          prefs={prefs}
          onGoToLog={() => setActivePageAndHash("log")}
          onGoToDailyPlan={() => {
            setActivePageAndHash("menu");
          }}
          onAddMeal={onRequestAddMeal}
        />
      </>
    </SectionErrorBoundary>
  );
}
