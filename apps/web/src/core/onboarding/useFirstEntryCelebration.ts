// Shows a one-shot celebration modal the render after the user logs
// their very first real entry. This is the moment the 30-second FTUX
// promise actually pays off: demo data becomes *their* data.
//
// Contract:
//   - Consumes the boolean returned by `detectFirstRealEntry()`.
//   - Fires exactly once, client-side, per browser profile.
//   - Skipped on sessions where the user already has real data on mount.

import { useEffect, useRef, useState, useCallback } from "react";
import { getTimeToValueMs } from "./vibePicks";

interface CelebrationState {
  /** Whether the celebration modal should be open */
  open: boolean;
  /** Time-to-value in milliseconds (null if not measured) */
  ttvMs: number | null;
  /** Close the celebration modal */
  close: () => void;
}

export function useFirstEntryCelebration(
  hasRealEntry: boolean,
): CelebrationState {
  const [open, setOpen] = useState(false);
  const [ttvMs, setTtvMs] = useState<number | null>(null);
  const firedRef = useRef(false);
  // Snapshot value at mount — if user already has data, skip celebration
  const initialRef = useRef(hasRealEntry);

  const close = useCallback(() => {
    setOpen(false);
  }, []);

  useEffect(() => {
    if (firedRef.current) return;
    if (initialRef.current) {
      firedRef.current = true;
      return;
    }
    if (!hasRealEntry) return;
    firedRef.current = true;
    // Read TTV value persisted by detectFirstRealEntry
    const ttv = getTimeToValueMs();
    setTtvMs(ttv);
    setOpen(true);
  }, [hasRealEntry]);

  return { open, ttvMs, close };
}
