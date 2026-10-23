/**
 * Last validated: 2026-10-23
 * Status: Active
 *
 * Стан діалогу «є незбережені записи» для `AuthProvider` (`data-19`,
 * `data-46`). Винесено з `AuthContext.tsx` (Hard Rule #18). Ref відсікає
 * другий паралельний вихід, поки перший чекає на відповідь людини.
 */
import { useCallback, useRef, useState } from "react";
import type { LogoutLossCheck } from "./logoutLossCheck";

export interface UnsyncedLossPromptState {
  /** Скільки записів зникне (черга синку + анонімні рядки переносу). */
  readonly pending: number;
  /** Скільки з них анонімні рядки незавершеного переносу. */
  readonly anonymous: number;
  readonly resolve: (proceed: boolean) => void;
}

export function useUnsyncedLossPrompt() {
  const [unsyncedPrompt, setUnsyncedPrompt] =
    useState<UnsyncedLossPromptState | null>(null);
  const openRef = useRef(false);
  const askUnsyncedLoss = useCallback(
    (loss: LogoutLossCheck): Promise<boolean> => {
      if (openRef.current) return Promise.resolve(false);
      openRef.current = true;
      return new Promise<boolean>((resolve) => {
        setUnsyncedPrompt({
          pending: loss.lost,
          anonymous: loss.anonymousRows,
          resolve: (proceed) => {
            openRef.current = false;
            setUnsyncedPrompt(null);
            resolve(proceed);
          },
        });
      });
    },
    [],
  );
  return { unsyncedPrompt, askUnsyncedLoss };
}
