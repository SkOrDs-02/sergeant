import { useRef } from "react";
import { SectionHeading } from "@shared/components/ui/SectionHeading";
import { Button } from "@shared/components/ui/Button";
import { cn } from "@shared/lib/cn";
import { useDialogFocusTrap } from "@shared/hooks/useDialogFocusTrap";
import { openHubModule } from "@shared/lib/hubNav";
import {
  isCrossModulePromptSuppressed,
  recordCrossModulePromptAccepted,
} from "@shared/lib/crossModulePrompt";
import { formatDurShort } from "@sergeant/fizruk-domain";
import { WorkoutStatTile } from "./WorkoutStatTile";

export function WorkoutFinishSheets({
  finishFlash,
  setFinishFlash,
  updateWorkout,
}) {
  const trapRef = useRef(null);
  useDialogFocusTrap(!!finishFlash, trapRef, {
    onEscape: () => setFinishFlash(null),
  });

  if (!finishFlash) return null;
  return (
    <div
      className="fixed left-0 right-0 z-[100] px-4 pointer-events-none fizruk-above-tabbar"
      role="region"
      aria-label="Підсумок тренування"
    >
      <div
        ref={trapRef}
        className="pointer-events-auto max-w-4xl mx-auto fizruk-sheet"
      >
        {finishFlash.step === "wellbeing" && (
          <div
            className="rounded-2xl border border-line bg-panel p-4 shadow-float space-y-4 max-h-[min(70vh,520px)] overflow-y-auto"
            role="dialog"
            aria-modal="true"
            aria-labelledby="fizruk-wellbeing-title"
          >
            <div
              id="fizruk-wellbeing-title"
              className="text-sm font-bold text-text"
            >
              Самопочуття
            </div>
            <p className="text-xs text-subtle leading-relaxed">
              Оціни по шкалі 1–5 (можна пропустити).
            </p>
            <div>
              <SectionHeading as="div" size="xs" className="mb-2">
                Енергія
              </SectionHeading>
              <div className="flex flex-wrap gap-2">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={`e${n}`}
                    type="button"
                    className={cn(
                      "min-w-[44px] min-h-[44px] rounded-xl border text-sm font-semibold transition-colors",
                      finishFlash.energy === n
                        ? "bg-text text-bg border-text"
                        : "border-line bg-bg text-muted hover:border-muted",
                    )}
                    onClick={() =>
                      setFinishFlash((f) => f && { ...f, energy: n })
                    }
                    aria-pressed={finishFlash.energy === n}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <SectionHeading as="div" size="xs" className="mb-2">
                Настрій
              </SectionHeading>
              <div className="flex flex-wrap gap-2">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={`m${n}`}
                    type="button"
                    className={cn(
                      "min-w-[44px] min-h-[44px] rounded-xl border text-sm font-semibold transition-colors",
                      finishFlash.mood === n
                        ? "bg-text text-bg border-text"
                        : "border-line bg-bg text-muted hover:border-muted",
                    )}
                    onClick={() =>
                      setFinishFlash((f) => f && { ...f, mood: n })
                    }
                    aria-pressed={finishFlash.mood === n}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                variant="ghost"
                className="flex-1 h-12 min-h-[44px]"
                type="button"
                onClick={() =>
                  setFinishFlash((f) => f && { ...f, step: "summary" })
                }
              >
                Пропустити
              </Button>
              <Button
                className="flex-1 h-12 min-h-[44px]"
                type="button"
                onClick={() => {
                  const wid = finishFlash.workoutId;
                  if (wid && (finishFlash.energy || finishFlash.mood)) {
                    updateWorkout(wid, {
                      wellbeing: {
                        energy: finishFlash.energy ?? undefined,
                        mood: finishFlash.mood ?? undefined,
                      },
                    });
                  }
                  setFinishFlash(
                    (f) =>
                      f && {
                        ...f,
                        step: "summary",
                        savedWellbeing:
                          f.energy || f.mood
                            ? { energy: f.energy, mood: f.mood }
                            : null,
                      },
                  );
                }}
              >
                Зберегти
              </Button>
            </div>
          </div>
        )}

        {finishFlash.step === "summary" && finishFlash.collapsed && (
          <button
            type="button"
            className="w-full flex items-center justify-between gap-3 rounded-2xl border border-line bg-panel px-4 py-3 min-h-[44px] shadow-float text-left"
            onClick={() =>
              setFinishFlash((f) => f && { ...f, collapsed: false })
            }
          >
            <span className="text-sm font-semibold text-text">
              ✓ Результати
            </span>
            <span className="text-xs text-subtle tabular-nums">
              {formatDurShort(finishFlash.durationSec)}
            </span>
          </button>
        )}

        {finishFlash.step === "summary" && !finishFlash.collapsed && (
          <div className="rounded-2xl overflow-hidden border border-line shadow-float">
            <div className="fizruk-summary-header">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <SectionHeading size="sm" variant="fizruk" as="div">
                    Завершено
                  </SectionHeading>
                  <div className="text-lg font-black text-teal-900 dark:text-white mt-1 leading-tight">
                    Тренування виконано
                  </div>
                </div>
                <button
                  type="button"
                  className="w-9 h-9 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full bg-fizruk-tile/10 text-teal-700 dark:text-white/70 hover:text-teal-900 dark:hover:text-white text-lg"
                  aria-label="Закрити"
                  onClick={() => setFinishFlash(null)}
                >
                  ✕
                </button>
              </div>
              <div className="grid grid-cols-3 gap-2 mt-3">
                <WorkoutStatTile
                  label="Час"
                  value={formatDurShort(finishFlash.durationSec)}
                />
                <WorkoutStatTile
                  label="Вправ"
                  value={finishFlash.items}
                  size="lg"
                />
                <WorkoutStatTile
                  label="Обʼєм"
                  value={
                    finishFlash.tonnageKg > 0
                      ? `${Math.round(finishFlash.tonnageKg)} кг`
                      : "—"
                  }
                />
              </div>
            </div>
            {finishFlash.savedWellbeing &&
              (finishFlash.savedWellbeing.energy ||
                finishFlash.savedWellbeing.mood) && (
                <div className="px-4 py-2.5 bg-panel border-b border-line flex items-center gap-3 text-xs text-subtle">
                  <span>Самопочуття:</span>
                  <span className="font-semibold text-text">
                    енергія {finishFlash.savedWellbeing.energy ?? "—"}/5
                    {" · "}
                    настрій {finishFlash.savedWellbeing.mood ?? "—"}/5
                  </span>
                </div>
              )}
            <div className="flex flex-col gap-2 p-3 bg-panel">
              {/* Cross-module nudge → Nutrition. Inline (not a toast)
                  because the finish-sheet itself is the natural moment
                  to suggest. Snoozed for 12 h after acceptance so a
                  user who logged a post-workout meal once today doesn't
                  see this on a second workout the same evening. See
                  docs/design/CROSS-MODULE-PROMPTS.md. */}
              {!isCrossModulePromptSuppressed("fizruk-finish-to-meal") && (
                <button
                  type="button"
                  className="w-full text-xs text-muted hover:text-text transition-colors py-1.5 flex items-center justify-center gap-1.5"
                  onClick={() => {
                    recordCrossModulePromptAccepted("fizruk-finish-to-meal");
                    setFinishFlash(null);
                    openHubModule("nutrition", "log");
                  }}
                >
                  <span aria-hidden>🥩</span>
                  <span>Додати білок після тренування</span>
                  <span aria-hidden>→</span>
                </button>
              )}
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  className="flex-1 h-12 min-h-[44px] rounded-full"
                  type="button"
                  onClick={() =>
                    setFinishFlash((f) => f && { ...f, collapsed: true })
                  }
                >
                  Згорнути
                </Button>
                <button
                  type="button"
                  className="fizruk-cta-accent flex-1 py-3 rounded-full text-base"
                  onClick={() => setFinishFlash(null)}
                >
                  Готово
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
