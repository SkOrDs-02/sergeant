/**
 * Last validated: 2026-08-13
 * Status: Active
 */
import type { NutritionPrefs } from "@sergeant/nutrition-domain";
import { Card } from "@shared/components/ui/Card";
import { Icon } from "@shared/components/ui/Icon";
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
  fetchDayHint: () => void | Promise<void>;
  dayHintText: string;
  dayHintBusy: boolean;
  onRequestAddMeal: () => void;
  /** Відкриває AddMealSheet одразу на кроці аналізу фото. */
  onOpenMealPhoto: () => void;
}

export function NutritionStartPage({
  log,
  prefs,
  setActivePageAndHash,
  fetchDayHint,
  dayHintText,
  dayHintBusy,
  onRequestAddMeal,
  onOpenMealPhoto,
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
          onFetchDayHint={fetchDayHint}
          dayHintText={dayHintText}
          dayHintBusy={dayHintBusy}
          onAddMeal={onRequestAddMeal}
        />
        {/* AI-CONTEXT: тут стояв повний дубль UI аналізу фото у згорнутому
            `<details>` (PhotoAnalyzeCard + Premium-гейт + paywall) — а
            кнопка «Фото» в AddMealSheet навігувала СЮДИ через state-машину
            pendingAction. Тепер аналіз — крок самого sheet-а
            (`meal-sheet/PhotoStep`), а ця картка — лише помітний вхід у
            флагманську AI-можливість модуля з дашборда. */}
        <Card
          as="button"
          module="nutrition"
          prominence="tinted"
          padding="md"
          radius="xl"
          data-testid="nutrition-photo-cta"
          onClick={onOpenMealPhoto}
          className="flex w-full min-w-0 items-center gap-3 text-left cursor-pointer"
        >
          <span className="flex items-center justify-center w-9 h-9 rounded-xl bg-nutrition/15 shrink-0">
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-nutrition-strong"
              aria-hidden
            >
              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
              <circle cx="12" cy="13" r="4" />
            </svg>
          </span>
          <span className="flex-1 min-w-0">
            <span className="block text-style-label text-text">
              Аналіз фото страви
            </span>
            <span className="mt-0.5 block text-style-caption text-subtle">
              ШІ визначить КБЖВ за фото
            </span>
          </span>
          <Icon
            name="chevron-right"
            size={16}
            className="text-muted shrink-0"
          />
        </Card>
      </>
    </SectionErrorBoundary>
  );
}
