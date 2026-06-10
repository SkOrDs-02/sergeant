import { cn } from "@shared/lib/ui/cn";
import { ModuleHeaderSettingsButton } from "@shared/components/layout";
import { getFinykSyncTone } from "../lib/syncTone";

export interface FinykHeaderControlsArgs {
  onOpenSettings?: (() => void) | undefined;
  showBalance: boolean;
  setShowBalance: (next: boolean) => void;
  syncStatus: string | undefined;
}

export function FinykHeaderControls({
  onOpenSettings,
  showBalance,
  setShowBalance,
  syncStatus,
}: FinykHeaderControlsArgs) {
  const syncTone = getFinykSyncTone(syncStatus);
  return (
    <div className="flex items-center gap-2">
      <div
        className={cn(
          "flex items-center gap-1.5 select-none",
          "text-style-caption px-2 py-0.5 rounded-full border",
          "transition-colors duration-200",
          syncTone.pill,
        )}
        aria-label={`Стан синхронізації: ${syncTone.text}`}
      >
        <span
          className={cn("w-1.5 h-1.5 rounded-full shrink-0", syncTone.dot)}
        />
        <span className="hidden sm:inline">{syncTone.text}</span>
      </div>
      <button
        type="button"
        onClick={() => setShowBalance(!showBalance)}
        className="focus-ring w-11 h-11 flex items-center justify-center rounded-xl text-subtle hover:text-text hover:bg-panelHi transition-colors"
        aria-label={showBalance ? "Приховати суми" : "Показати суми"}
        title={showBalance ? "Приховати суми" : "Показати суми"}
      >
        {showBalance ? (
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        ) : (
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
            <line x1="1" y1="1" x2="23" y2="23" />
          </svg>
        )}
      </button>
      {onOpenSettings && (
        <ModuleHeaderSettingsButton onClick={onOpenSettings} />
      )}
    </div>
  );
}
