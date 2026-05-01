import { cn } from "@shared/lib/cn";

export interface TransactionsHeaderProps {
  monthLabel: string;
  isCurrentMonth: boolean;
  goMonth: (delta: number) => void;
  selectMode: boolean;
  exitSelectMode: () => void;
  setSelectMode: (v: boolean) => void;
  showHidden: boolean;
  setShowHidden: (updater: (v: boolean) => boolean) => void;
  hiddenCount: number;
  refresh: () => void;
  loading: boolean;
}

/**
 * Top header for the Transactions page: month switcher on the left,
 * action buttons (toggle-hidden / select-mode / refresh) on the right.
 *
 * The "select-mode" toggle replaces the action cluster with a single
 * "Скасувати" button while batch selection is active — the actions
 * only make sense outside of select-mode anyway.
 */
export function TransactionsHeader({
  monthLabel,
  isCurrentMonth,
  goMonth,
  selectMode,
  exitSelectMode,
  setSelectMode,
  showHidden,
  setShowHidden,
  hiddenCount,
  refresh,
  loading,
}: TransactionsHeaderProps) {
  return (
    <div className="flex items-center justify-between mb-3">
      <div className="flex items-center gap-1">
        <button
          onClick={() => goMonth(-1)}
          className="w-8 h-8 flex items-center justify-center rounded-xl text-subtle hover:text-text hover:bg-panelHi transition-colors text-lg"
        >
          ‹
        </button>
        <span className="text-sm font-semibold text-text capitalize px-1">
          {monthLabel}
        </span>
        <button
          onClick={() => goMonth(1)}
          disabled={isCurrentMonth}
          className="w-8 h-8 flex items-center justify-center rounded-xl text-subtle hover:text-text hover:bg-panelHi transition-colors text-lg disabled:opacity-30"
        >
          ›
        </button>
      </div>
      <div className="flex items-center gap-1.5">
        {selectMode ? (
          <button
            onClick={exitSelectMode}
            className="text-xs px-3 py-2 rounded-full border border-primary/40 bg-primary/8 text-primary min-h-[36px] font-semibold"
          >
            Скасувати
          </button>
        ) : (
          <>
            {hiddenCount > 0 && (
              <button
                onClick={() => setShowHidden((v) => !v)}
                className={cn(
                  "text-xs px-3 py-2 rounded-full border border-line transition-colors min-h-[36px]",
                  showHidden ? "text-primary border-primary" : "text-subtle",
                )}
              >
                {showHidden ? (
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden
                  >
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                ) : (
                  <span>{hiddenCount} прих.</span>
                )}
              </button>
            )}
            <button
              onClick={() => setSelectMode(true)}
              className="text-xs px-3 py-2 rounded-full border border-line text-subtle hover:text-text hover:border-muted transition-colors min-h-[36px]"
              title="Вибрати кілька"
              aria-label="Режим вибору"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <polyline points="9 11 12 14 22 4" />
                <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
              </svg>
            </button>
            <button
              onClick={refresh}
              disabled={loading}
              className="text-xs px-3 py-2 rounded-full border border-line text-subtle hover:text-text hover:border-muted transition-colors disabled:opacity-40 min-h-[36px]"
              aria-label="Оновити"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className={loading ? "motion-safe:animate-spin" : ""}
                aria-hidden
              >
                <polyline points="23 4 23 10 17 10" />
                <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
              </svg>
            </button>
          </>
        )}
      </div>
    </div>
  );
}
