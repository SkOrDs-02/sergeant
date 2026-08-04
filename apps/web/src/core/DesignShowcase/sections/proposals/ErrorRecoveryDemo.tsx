import { useState } from "react";
import { Icon } from "@shared/components/ui";
import { ComparePair, MiniPhone } from "./_Compare";

/**
 * R2-UX-18 — Actionable error recovery.
 *
 * Before: a failed section shows a generic error boundary ("Щось пішло не
 * так"). After: the failure names a likely cause and offers concrete actions
 * inline — "Повторити", "Скинути кеш секції" — plus a quiet link to report.
 * Recovers in place without a full reload.
 *
 * Mock only — tap "Повторити" on the right to see the recovered state.
 */

export function ErrorRecoveryDemo() {
  const [recovered, setRecovered] = useState(false);

  return (
    <ComparePair
      before={
        <MiniPhone dim>
          <div className="flex-1 min-h-0 flex flex-col items-center justify-center px-4 text-center gap-2">
            <span className="h-10 w-10 rounded-full bg-surface-muted flex items-center justify-center text-muted">
              <Icon name="alert-triangle" size={20} />
            </span>
            <p className="text-style-caption text-text">Щось пішло не так</p>
            <p className="text-style-caption text-muted">Оновіть сторінку.</p>
          </div>
        </MiniPhone>
      }
      after={
        <MiniPhone>
          <div className="flex-1 min-h-0 flex flex-col items-center justify-center px-4 text-center gap-3">
            {recovered ? (
              <>
                <span className="h-10 w-10 rounded-full bg-accent/15 flex items-center justify-center text-accent">
                  <Icon name="check-circle" size={20} />
                </span>
                <p className="text-style-caption text-text">
                  Секцію відновлено
                </p>
                <p className="text-style-caption text-muted">
                  Дані підвантажились без перезавантаження.
                </p>
              </>
            ) : (
              <>
                <span className="h-10 w-10 rounded-full bg-danger/15 flex items-center justify-center text-danger">
                  <Icon name="cloud-off" size={20} />
                </span>
                <p className="text-style-caption text-text">
                  Не вдалось завантажити звіт
                </p>
                <p className="text-style-caption text-muted">
                  Схоже, зникла мережа під час синку.
                </p>
                <div className="flex flex-col gap-1.5 w-full pt-1">
                  <button
                    type="button"
                    onClick={() => setRecovered(true)}
                    className="h-9 rounded-xl bg-accent text-bg text-style-caption font-medium flex items-center justify-center gap-1.5"
                  >
                    <Icon name="refresh-cw" size={14} /> Повторити
                  </button>
                  <button
                    type="button"
                    className="h-9 rounded-xl border border-line bg-panel text-muted text-style-caption"
                  >
                    Скинути кеш секції
                  </button>
                </div>
              </>
            )}
          </div>
        </MiniPhone>
      }
    />
  );
}
