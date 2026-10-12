/**
 * Last validated: 2026-09-11
 * Status: Active
 */
import type { ReactNode } from "react";
import { formatRestClock } from "@sergeant/fizruk-domain";
import { useVisualKeyboardInset } from "@sergeant/shared";
import { messages } from "@shared/i18n/uk";
import { cn } from "@shared/lib/ui/cn";
import type { RestTimerState } from "../../hooks/useFizrukRestSound";

export interface SessionDockProps {
  restTimer: RestTimerState | null;
  onSkipRest: () => void;
  onAdjustRest: (seconds: number) => void;
  /** Підпис під відліком: «далі підхід 3» / «далі: Присідання». */
  restHint?: string | null | undefined;
  /** Дії у спокої — «+ Вправа», «⏱», мікрофон або смуга вибору суперсету. */
  children: ReactNode;
}

/**
 * Докована нижня панель сесії замість таб-бару модуля. Два стани від даних
 * (спека `fizruk-active-session.md`, рішення 3): у спокої — дії, під час
 * відпочинку — таймер із −15 / +15 / «Пропустити». Пігулка над таб-баром
 * (`RestTimerOverlay`) у сесії схована, але лишається змонтованою — вона
 * єдине джерело озвучення «відпочинок почався / завершено».
 *
 * Під софт-клавіатурою панель ховається: `position: fixed` над клавіатурою
 * на iOS їде разом із visual viewport (див. `apps/web/AGENTS.md`), а поля
 * вводу тоді й так у фокусі — дії панелі в цей момент не потрібні.
 */
export function SessionDock({
  restTimer,
  onSkipRest,
  onAdjustRest,
  restHint,
  children,
}: SessionDockProps) {
  const rt = messages.fizruk.restTimer;
  const kbInset = useVisualKeyboardInset(true);
  const resting = restTimer != null;
  const pct =
    resting && restTimer.total > 0 ? restTimer.remaining / restTimer.total : 0;

  return (
    <div
      className={cn(
        "fixed inset-x-0 bottom-0 z-40 border-t bg-panel transition-transform",
        "border-line",
        kbInset > 0 && "translate-y-full pointer-events-none",
      )}
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      data-testid={resting ? "rest-timer" : "session-dock"}
    >
      <div className="mx-auto flex h-[72px] max-w-xl items-center gap-2 px-3">
        {resting ? (
          <>
            <div
              className="flex min-w-0 flex-1 items-center gap-3"
              role="timer"
              aria-label={rt.ariaLabel}
            >
              <span
                aria-hidden
                className="h-[5px] w-10 shrink-0 overflow-hidden rounded-[3px] bg-line"
              >
                <span
                  className="block h-full rounded-[3px] bg-chart-fizruk transition-[width] duration-base"
                  style={{ width: `${pct * 100}%` }}
                />
              </span>
              <div className="min-w-0">
                <div
                  className={cn(
                    "text-style-title font-bold leading-tight tracking-tight tabular-nums",
                    "text-text",
                  )}
                >
                  {formatRestClock(restTimer.remaining)}
                </div>
                <div className="truncate text-style-caption text-subtle">
                  {restHint || rt.restingPrefix}
                </div>
              </div>
            </div>
            {[-15, 15].map((seconds) => (
              <button
                key={seconds}
                type="button"
                className="focus-ring h-11 w-11 shrink-0 rounded-lg border border-line text-style-label font-semibold tabular-nums text-text hover:bg-panelHi"
                onClick={() => onAdjustRest(seconds)}
                aria-label={`${seconds > 0 ? rt.add : rt.subtract} ${Math.abs(seconds)} ${rt.secondsSuffix}`}
              >
                {seconds > 0 ? "+" : "−"}
                {Math.abs(seconds)}
              </button>
            ))}
            <button
              type="button"
              className="focus-ring h-11 shrink-0 rounded-lg px-3 text-style-label font-semibold text-danger-strong dark:text-danger hover:bg-danger/10"
              onClick={onSkipRest}
            >
              {rt.skip}
            </button>
          </>
        ) : (
          children
        )}
      </div>
    </div>
  );
}
