/**
 * Last validated: 2026-06-15
 * Status: Active
 */
import type { Dispatch, Ref, SetStateAction } from "react";
import type { NutritionPrefs, PantryItem } from "@sergeant/nutrition-domain";
import { Card } from "@shared/components/ui/Card";
import { Icon } from "@shared/components/ui/Icon";
import { SectionErrorBoundary } from "@shared/components/ui/SectionErrorBoundary";
import { useLocale } from "@shared/i18n/useLocale";
import { PaywallModal, useFeatureGate } from "../../../core/billing";
import { NutritionDashboard } from "../components/NutritionDashboard";
import { PhotoAnalyzeCard } from "../components/PhotoAnalyzeCard";
import type { QuickChip } from "../hooks/useNutritionQuickChips";
import type { useNutritionLog } from "../hooks/useNutritionLog";
import type { usePhotoAnalysis } from "../hooks/usePhotoAnalysis";
import type { NutritionPage } from "../lib/nutritionRouter";
import { fmtMacro } from "../lib/nutritionFormat";

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
  onRequestAddMeal: () => void;
  photoCardForceOpen: boolean;
  setPhotoCardForceOpen: Dispatch<SetStateAction<boolean>>;
  onSaveToLog: () => void;
  pantryItems?: readonly PantryItem[];
  onQuickAddMeal?: (chip: QuickChip) => void;
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
  onRequestAddMeal,
  photoCardForceOpen,
  setPhotoCardForceOpen,
  onSaveToLog,
  pantryItems,
  onQuickAddMeal,
}: NutritionStartPageProps) {
  // Phase 7 D2 — gate AI-powered photo macro analysis behind Premium.
  // The hook owns paywall-open state; we proxy `analyzePhoto` through
  // `requireAccess()` so non-Pro users hit the modal instead of the
  // mutation. `useLocale` resolves paywall copy under `?lang=en`
  // override; UA users see UK copy via the fall-through path in the
  // i18n resolver.
  const photoGate = useFeatureGate("ai-photo-analysis");
  const { messages } = useLocale();
  const gatedAnalyzePhoto = () => {
    if (!photoGate.requireAccess()) return;
    void photo.analyzePhoto();
  };
  return (
    <SectionErrorBoundary
      key="page-start"
      title="Не вдалось показати «Харчування»"
    >
      <>
        <h1 className="sr-only">{messages.nav.nutritionOverview}</h1>
        <NutritionDashboard
          log={log.nutritionLog}
          prefs={prefs}
          pantryItems={pantryItems}
          onQuickAddMeal={onQuickAddMeal}
          onGoToLog={() => setActivePageAndHash("log")}
          onGoToDailyPlan={() => {
            setActivePageAndHash("menu");
          }}
          onFetchDayHint={fetchDayHint}
          dayHintText={dayHintText}
          dayHintBusy={dayHintBusy}
          onAddMeal={onRequestAddMeal}
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
              analyzePhoto={gatedAnalyzePhoto}
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
        <PaywallModal
          open={photoGate.paywallOpen}
          onClose={photoGate.closePaywall}
          surface={photoGate.paywallSurface}
          title={messages.paywall["ai-photo-analysis"].title}
          description={messages.paywall["ai-photo-analysis"].description}
        />
      </>
    </SectionErrorBoundary>
  );
}
