// Shows a one-shot celebration modal the render after the user logs
// their very first real entry (mobile port of
// `apps/web/src/core/onboarding/useFirstEntryCelebration.ts`).
//
// Contract:
//   - Consumes the boolean returned by `detectFirstRealEntry()`.
//   - Fires exactly once, client-side, per device install.
//   - Skipped on sessions where the user already has real data on mount.

import { useCallback, useState } from "react";
import {
  getFirstRealEntryModule,
  getTimeToValueMs,
  type DashboardModuleId,
} from "@sergeant/shared";
import { mobileKVStore as mmkvStore } from "@/lib/storage";

interface CelebrationState {
  /** Whether the celebration modal should be open */
  open: boolean;
  /** Time-to-value in milliseconds (null if not measured) */
  ttvMs: number | null;
  /**
   * Module that owns the entry which flipped the first-real-entry
   * flag. Drives module-aware copy via `getFirstEntryCelebrationCopy`.
   * `null` means the modal will fall back to the default copy.
   */
  moduleId: DashboardModuleId | null;
  /** Close the celebration modal */
  close: () => void;
}

export function useFirstEntryCelebration(
  hasRealEntry: boolean,
): CelebrationState {
  const [open, setOpen] = useState(false);
  const [ttvMs, setTtvMs] = useState<number | null>(null);
  const [moduleId, setModuleId] = useState<DashboardModuleId | null>(null);
  const [hadEntryAtMount] = useState(() => hasRealEntry);
  const [celebrationFired, setCelebrationFired] = useState(false);

  const close = useCallback(() => {
    setOpen(false);
  }, []);

  if (!hadEntryAtMount && hasRealEntry && !celebrationFired) {
    setCelebrationFired(true);
    setTtvMs(getTimeToValueMs(mmkvStore));
    setModuleId(getFirstRealEntryModule(mmkvStore));
    setOpen(true);
  }

  return { open, ttvMs, moduleId, close };
}
