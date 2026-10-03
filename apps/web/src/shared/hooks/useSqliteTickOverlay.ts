import { useState, type Dispatch, type SetStateAction } from "react";

/**
 * Overlay local React state from an external store when `tick` advances.
 *
 * Replaces the common SQLite warm-cache pattern:
 *   useEffect(() => { if (cache.refreshedAt) setState(cache.slice); }, [tick])
 *
 * React recommends adjusting state during render when external inputs change
 * (`react-hooks/set-state-in-effect` burndown, initiative 0021).
 */
export function useSqliteTickOverlay<T>(
  tick: number,
  readOverlay: () => T | undefined,
  initial: T | (() => T),
): [T, Dispatch<SetStateAction<T>>] {
  const [state, setState] = useState<T>(initial);
  const [prevTick, setPrevTick] = useState(tick);

  if (tick !== prevTick) {
    setPrevTick(tick);
    const overlay = readOverlay();
    if (overlay !== undefined) {
      setState(overlay);
    }
  }

  return [state, setState];
}
