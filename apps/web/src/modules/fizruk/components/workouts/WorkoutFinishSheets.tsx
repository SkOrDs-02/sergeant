import { useRef, useState, type Dispatch, type SetStateAction } from "react";
import { SectionHeading } from "@shared/components/ui/SectionHeading";
import { Button } from "@shared/components/ui/Button";
import { Card } from "@shared/components/ui/Card";
import { Icon } from "@shared/components/ui/Icon";
import { cn } from "@shared/lib/ui/cn";
import { useDialogFocusTrap } from "@shared/hooks/useDialogFocusTrap";
import { openHubModule } from "@shared/lib/modules/hubNav";
import {
  isCrossModulePromptSuppressed,
  recordCrossModulePromptAccepted,
} from "@shared/lib/modules/crossModulePrompt";
import { formatDurShort } from "@sergeant/fizruk-domain";
import {
  INJURY_SITE_IDS,
  INJURY_SITE_LABELS_UK,
} from "@sergeant/fizruk-domain/data";
import { messages } from "@shared/i18n/uk";
import { useInjuries } from "../../hooks/useInjuries";
import { WorkoutStatTile } from "./WorkoutStatTile";
// `FinishFlashState` живе у `../../pages/Workouts.types` (там `useState`
// setter, що ходить між обома sheet-ами). Імпортуємо звідти, щоб не дублювати
// оголошення (aislop `ai-slop/duplicate-type-declaration`).
import type { FinishFlashState } from "../../pages/Workouts.types";

// Реекспорт для споживачів цього компонента (тест + orchestrator), що вже
// імпортують `FinishFlashState` звідси.
export type { FinishFlashState };

interface WorkoutFinishSheetsProps {
  finishFlash: FinishFlashState | null;
  setFinishFlash: Dispatch<SetStateAction<FinishFlashState | null>>;
  updateWorkout: (
    id: string,
    patch: { wellbeing?: { energy?: number; mood?: number } },
  ) => void;
  onDone?: (() => void) | undefined;
}

export function WorkoutFinishSheets({
  finishFlash,
  setFinishFlash,
  updateWorkout,
  onDone,
}: WorkoutFinishSheetsProps) {
  const { mark } = useInjuries();
  const injuryCopy = messages.fizruk.injuries;
  const [savingInjuries, setSavingInjuries] = useState(false);
  const trapRef = useRef<HTMLDivElement | null>(null);
  const closeFinish = () => {
    setFinishFlash(null);
    onDone?.();
  };
  useDialogFocusTrap(!!finishFlash, trapRef, { onEscape: closeFinish });

  if (!finishFlash) return null;
  return (
    <div
      className="fixed left-0 right-0 z-100 px-4 pointer-events-none fizruk-above-tabbar"
      role="region"
      aria-label="Підсумок тренування"
    >
      <div
        ref={trapRef}
        className="pointer-events-auto max-w-4xl mx-auto fizruk-sheet"
      >
        {finishFlash.step === "wellbeing" && (
          <Card
            prominence="elevated"
            radius="lg"
            className="space-y-4 max-h-[min(70vh,520px)] overflow-y-auto"
            role="dialog"
            aria-modal="true"
            aria-labelledby="fizruk-wellbeing-title"
          >
            <div
              id="fizruk-wellbeing-title"
              className="text-style-label text-text"
            >
              Самопочуття
            </div>
            <p className="text-xs text-subtle leading-relaxed">
              Оціни по шкалі 1–5 (можна пропустити).
            </p>
            <div>
              <SectionHeading
                as="div"
                size="xs"
                variant="fizruk"
                className="mb-2"
              >
                Енергія
              </SectionHeading>
              <div className="flex flex-wrap gap-2">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={`e${n}`}
                    type="button"
                    className={cn(
                      "min-w-[44px] min-h-[44px] rounded-xl border text-style-label transition-colors",
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
              <SectionHeading
                as="div"
                size="xs"
                variant="fizruk"
                className="mb-2"
              >
                Настрій
              </SectionHeading>
              <div className="flex flex-wrap gap-2">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={`m${n}`}
                    type="button"
                    className={cn(
                      "min-w-[44px] min-h-[44px] rounded-xl border text-style-label transition-colors",
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
                variant="secondary"
                className="flex-1 h-12 min-h-[44px]"
                type="button"
                onClick={() =>
                  setFinishFlash((f) => f && { ...f, step: "injury" })
                }
              >
                Пропустити
              </Button>
              <Button
                module="fizruk"
                className="flex-1 h-12 min-h-[44px]"
                type="button"
                onClick={() => {
                  const wid = finishFlash.workoutId;
                  if (wid && (finishFlash.energy || finishFlash.mood)) {
                    updateWorkout(wid, {
                      wellbeing: {
                        ...(finishFlash.energy != null
                          ? { energy: finishFlash.energy }
                          : {}),
                        ...(finishFlash.mood != null
                          ? { mood: finishFlash.mood }
                          : {}),
                      },
                    });
                  }
                  setFinishFlash(
                    (f) =>
                      f && {
                        ...f,
                        step: "injury",
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
          </Card>
        )}

        {finishFlash.step === "injury" && (
          <Card
            prominence="elevated"
            radius="lg"
            className="space-y-4 max-h-[min(70vh,520px)] overflow-y-auto"
            role="dialog"
            aria-modal="true"
            aria-labelledby="fizruk-injury-title"
          >
            <div>
              <div
                id="fizruk-injury-title"
                className="text-style-label text-text"
              >
                {injuryCopy.finishTitle}
              </div>
              <p className="text-style-caption text-subtle mt-1">
                {injuryCopy.finishDescription}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {INJURY_SITE_IDS.map((group) => {
                const selected = finishFlash.injurySites.includes(group);
                return (
                  <button
                    key={group}
                    type="button"
                    aria-pressed={selected}
                    className={cn(
                      "min-h-[44px] rounded-full border px-3 py-2 text-style-caption transition-colors",
                      selected
                        ? "border-warning-strong bg-warning/15 text-warning-strong dark:text-warning"
                        : "border-line bg-bg text-muted hover:border-muted hover:text-text",
                    )}
                    onClick={() =>
                      setFinishFlash((current) =>
                        current
                          ? {
                              ...current,
                              injurySites: selected
                                ? current.injurySites.filter(
                                    (item) => item !== group,
                                  )
                                : [...current.injurySites, group],
                            }
                          : current,
                      )
                    }
                  >
                    {INJURY_SITE_LABELS_UK[group]}
                  </button>
                );
              })}
            </div>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                className="flex-1 h-12"
                disabled={savingInjuries}
                onClick={() =>
                  setFinishFlash(
                    (current) => current && { ...current, step: "summary" },
                  )
                }
              >
                {injuryCopy.skip}
              </Button>
              <Button
                module="fizruk"
                className="flex-1 h-12"
                disabled={
                  savingInjuries || finishFlash.injurySites.length === 0
                }
                onClick={async () => {
                  setSavingInjuries(true);
                  try {
                    await mark(finishFlash.injurySites);
                    setFinishFlash(
                      (current) => current && { ...current, step: "summary" },
                    );
                  } finally {
                    setSavingInjuries(false);
                  }
                }}
              >
                Зберегти позначки
              </Button>
            </div>
          </Card>
        )}

        {finishFlash.step === "summary" && finishFlash.collapsed && (
          <button
            type="button"
            className="w-full flex items-center justify-between gap-3 rounded-2xl border border-line bg-panel px-4 py-3 min-h-[44px] shadow-float text-left"
            onClick={() =>
              setFinishFlash((f) => f && { ...f, collapsed: false })
            }
          >
            <span className="text-style-label text-text inline-flex items-center gap-1.5">
              <Icon name="check" size={15} aria-hidden /> Результати
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
                  <div className="text-style-title text-fizruk-soft-fg mt-1 leading-tight">
                    Тренування виконано
                  </div>
                </div>
                <button
                  type="button"
                  className="w-9 h-9 pointer-coarse:min-w-[44px] pointer-coarse:min-h-[44px] flex items-center justify-center rounded-full bg-fizruk-tile/10 text-fizruk-soft-fg hover:opacity-70 text-lg"
                  aria-label="Закрити"
                  onClick={closeFinish}
                >
                  <Icon name="close" size={16} aria-hidden />
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
                  docs/design/cross-module-prompts.md. */}
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
                  <Icon name="egg" size={15} aria-hidden />
                  <span>Додати білок після тренування</span>
                  <span aria-hidden>→</span>
                </button>
              )}
              <div className="flex gap-2">
                <Button
                  variant="secondary"
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
                  onClick={closeFinish}
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
