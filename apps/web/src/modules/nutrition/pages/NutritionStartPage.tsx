import type { Dispatch, Ref, SetStateAction } from "react";
import type { NutritionPrefs } from "@sergeant/nutrition-domain";
import { Card } from "@shared/components/ui/Card";
import { Icon } from "@shared/components/ui/Icon";
import { SectionErrorBoundary } from "@shared/components/ui/SectionErrorBoundary";
import { NutritionDashboard } from "../components/NutritionDashboard";
import { PhotoAnalyzeCard } from "../components/PhotoAnalyzeCard";
import type { useNutritionLog } from "../hooks/useNutritionLog";
import type { usePhotoAnalysis } from "../hooks/usePhotoAnalysis";
import type { NutritionPage } from "../lib/nutritionRouter";
import { fmtMacro, todayISODate } from "../lib/nutritionFormat";

type LogController = ReturnType<typeof useNutritionLog>;
type PhotoController = ReturnType<typeof usePhotoAnalysis>;

interface NutritionStartPageProps {
  log: LogController;
  photo: PhotoController;
  prefs: NutritionPrefs;
  busy: boolean;
  setActivePageAndHash: (page: NutritionPage) => void;
  fetchDayHint: () => void | Promise<void>;
  dayHintText: string;
  dayHintBusy: boolean;
  scheduleTransient: (
    cb: () => void,
    delayMs: number,
  ) => ReturnType<typeof setTimeout>;
  photoCardForceOpen: boolean;
  setPhotoCardForceOpen: Dispatch<SetStateAction<boolean>>;
  onSaveToLog: () => void;
}

export function NutritionStartPage({
  log,
  photo,
  prefs,
  busy,
  setActivePageAndHash,
  fetchDayHint,
  dayHintText,
  dayHintBusy,
  scheduleTransient,
  photoCardForceOpen,
  setPhotoCardForceOpen,
  onSaveToLog,
}: NutritionStartPageProps) {
  return (
    <SectionErrorBoundary
      key="page-start"
      title="Не вдалось показати «Харчування»"
    >
      <>
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
          onAddMeal={() => {
            log.setSelectedDate(todayISODate());
            setActivePageAndHash("log");
            scheduleTransient(() => {
              log.setAddMealPhotoResult(null);
              log.setAddMealSheetOpen(true);
            }, 80);
          }}
        />
        <details
          className="group"
          open={photoCardForceOpen || undefined}
          onToggle={(e) => {
            if (!e.currentTarget.open) setPhotoCardForceOpen(false);
          }}
        >
          <Card
            as="summary"
            module="nutrition"
            prominence="tinted"
            padding="md"
            radius="xl"
            className="flex items-center gap-3 cursor-pointer select-none list-none [&::-webkit-details-marker]:hidden"
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
            <div className="flex-1 min-w-0">
              <div className="text-style-label text-text">
                Аналіз фото страви
              </div>
              <div className="text-xs text-subtle mt-0.5">
                ШІ визначить КБЖВ за фото
              </div>
            </div>
            <Icon
              name="chevron-right"
              size={16}
              className="text-muted transition-transform group-open:rotate-90 shrink-0"
            />
          </Card>
          <div className="pt-2">
            <PhotoAnalyzeCard
              busy={busy}
              analyzePhoto={photo.analyzePhoto}
              fileRef={photo.fileRef as Ref<HTMLInputElement>}
              onPickPhoto={photo.onPickPhoto}
              photoPreviewUrl={photo.photoPreviewUrl}
              photoResult={photo.photoResult}
              fmtMacro={fmtMacro}
              portionGrams={photo.portionGrams}
              setPortionGrams={photo.setPortionGrams}
              refinePhoto={photo.refinePhoto}
              answers={photo.answers}
              setAnswers={photo.setAnswers}
              onSaveToLog={photo.photoResult ? onSaveToLog : undefined}
            />
          </div>
        </details>
      </>
    </SectionErrorBoundary>
  );
}
