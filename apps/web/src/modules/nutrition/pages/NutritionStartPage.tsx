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
import type { MealTypeId, NutritionPrefs } from "@sergeant/nutrition-domain";
import { SectionErrorBoundary } from "@shared/components/ui/SectionErrorBoundary";
import { Skeleton } from "@shared/components/ui/Skeleton";
import { useLocale } from "@shared/i18n/useLocale";
import { NutritionDashboard } from "../components/NutritionDashboard";
import type { useNutritionLog } from "../hooks/useNutritionLog";
import { isNutritionReadBootInFlight } from "../hooks/useNutritionSqliteReadBoot";
import { getCachedNutritionSqliteState } from "../lib/sqliteReader";
import type { NutritionPage } from "../lib/nutritionRouter";

type LogController = ReturnType<typeof useNutritionLog>;

interface NutritionStartPageProps {
  log: LogController;
  prefs: NutritionPrefs;
  setActivePageAndHash: (page: NutritionPage) => void;
  /** Тап по сегменту hero — аркуш прийому з уже обраним типом. */
  onPickMeal: (type: MealTypeId) => void;
}

export function NutritionStartPage({
  log,
  prefs,
  setActivePageAndHash,
  onPickMeal,
}: NutritionStartPageProps) {
  const { messages } = useLocale();
  // Поки бут читання везе журнал, а кеш ще порожній, малюємо скелетон:
  // інакше холодний старт показував «0 прийомів», повну норму «лишилось» і
  // «ще немає записів», а за мить підмінював справжніми даними. Гейт саме на
  // «в польоті», тож провалений бут не лишить скелетон назавжди.
  const coldLoading =
    isNutritionReadBootInFlight() &&
    getCachedNutritionSqliteState().refreshedAt === null;
  return (
    <SectionErrorBoundary key="page-start" title="Не вдалось показати «Їжа»">
      <>
        <h1 className="sr-only">{messages.nav.nutritionOverview}</h1>
        {coldLoading ? (
          <div
            role="status"
            aria-label={messages.loaders.loadingSection}
            className="space-y-3"
          >
            <Skeleton className="h-56 rounded-3xl" />
            <Skeleton className="h-32 rounded-2xl" />
            <Skeleton className="h-24 rounded-2xl" />
          </div>
        ) : (
          <NutritionDashboard
            log={log.nutritionLog}
            prefs={prefs}
            onPickMeal={onPickMeal}
            onGoToLog={(dateIso) => {
              // Порядок важливий: спершу день, потім навігація — журнал
              // читає `log.selectedDate` на рендері, тож зворотний порядок
              // дав би кадр із сьогоднішнім днем перед підміною.
              if (dateIso) log.setSelectedDate(dateIso);
              setActivePageAndHash("log");
            }}
            onGoToDailyPlan={() => {
              setActivePageAndHash("menu");
            }}
          />
        )}
      </>
    </SectionErrorBoundary>
  );
}
