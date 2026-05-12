import type { Dispatch, Ref, SetStateAction } from "react";
import type { NutritionPrefs } from "@sergeant/nutrition-domain";
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
          <summary className="flex items-center gap-2 cursor-pointer select-none py-2 px-1 text-style-label text-text">
            <Icon
              name="chevron-right"
              size={16}
              className="transition-transform group-open:rotate-90"
            />
            Аналіз фото страви
          </summary>
          <div className="pt-1">
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
