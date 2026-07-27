import { useState } from "react";
import { cn } from "@shared/lib/ui/cn";
import { ComparePair, MiniPhone } from "./_Compare";

/**
 * R2-UX-14 — Progressive onboarding coach-marks per module.
 *
 * Before: a single global FTUX, then each module drops the user in cold.
 * After: the first time a module opens, 2-3 contextual tooltips point at the
 * key controls in sequence ("Тут додаєш витрату", "А тут — звіти"), each
 * dismissible, with progress dots. Shown once per module, respects a
 * "більше не показувати".
 *
 * Mock only — tap "Далі" to step through the coach-marks on the right.
 */

const STEPS = [
  { top: "18%", left: "8%", text: "Тут додаєш новий запис одним тапом." },
  { top: "44%", left: "42%", text: "Свайп по картках — швидкий огляд метрик." },
  { top: "70%", left: "20%", text: "А тут — звіти й тренди за період." },
];

export function CoachMarksDemo() {
  const [step, setStep] = useState(0);
  const active = STEPS[step]!;
  const last = step === STEPS.length - 1;

  return (
    <ComparePair
      before={
        <MiniPhone dim>
          <div className="flex-1 min-h-0 px-3 pt-2">
            <p className="text-style-caption text-muted mb-2">Фінік</p>
            <div className="space-y-2">
              <div className="h-16 rounded-xl bg-panel border border-line" />
              <div className="grid grid-cols-2 gap-2">
                <div className="h-14 rounded-xl bg-panel border border-line" />
                <div className="h-14 rounded-xl bg-panel border border-line" />
              </div>
              <div className="h-16 rounded-xl bg-panel border border-line" />
            </div>
            <p className="text-2xs text-muted mt-3">Модуль відкривається «наосліп».</p>
          </div>
        </MiniPhone>
      }
      after={
        <MiniPhone>
          <div className="relative flex-1 min-h-0 px-3 pt-2">
            <p className="text-style-caption text-muted mb-2">Фінік</p>
            <div className="space-y-2">
              <div className="h-16 rounded-xl bg-panel border border-line" />
              <div className="grid grid-cols-2 gap-2">
                <div className="h-14 rounded-xl bg-panel border border-line" />
                <div className="h-14 rounded-xl bg-panel border border-line" />
              </div>
              <div className="h-16 rounded-xl bg-panel border border-line" />
            </div>
            {/* dim scrim */}
            <div className="absolute inset-0 bg-black/40 rounded-b-[1.4rem]" />
            {/* tooltip */}
            <div
              className="absolute z-10 w-40 rounded-xl bg-panelHi border border-accent/40 shadow-card p-2.5"
              style={{ top: active.top, left: active.left }}
            >
              <p className="text-2xs text-text leading-relaxed">{active.text}</p>
              <div className="flex items-center justify-between mt-2">
                <div className="flex gap-1">
                  {STEPS.map((_, i) => (
                    <span key={i} className={cn("h-1.5 w-1.5 rounded-full", i === step ? "bg-accent" : "bg-line")} />
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => setStep(last ? 0 : step + 1)}
                  className="text-2xs font-medium text-accent"
                >
                  {last ? "Готово" : "Далі"}
                </button>
              </div>
            </div>
          </div>
        </MiniPhone>
      }
    />
  );
}
