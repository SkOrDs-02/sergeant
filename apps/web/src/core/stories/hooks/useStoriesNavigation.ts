import { useCallback, useState } from "react";

interface Options {
  total: number;
  onExhausted?: () => void;
}

interface Api {
  index: number;
  next: () => void;
  prev: () => void;
  goto: (i: number) => void;
  reset: () => void;
}

/**
 * Pure navigation state. No refs, no mirrors — the latest `index` is always
 * the one in `useState`. Callbacks are recreated when deps change so
 * consumers always close over the current value.
 *
 * On `total` shrinking below the current index, clamps to the last slide
 * and fires `onExhausted` if clamping would push past zero. Prevents a
 * race where digest updates erase slides out from under a stale index.
 */
export function useStoriesNavigation({ total, onExhausted }: Options): Api {
  const [index, setIndex] = useState(0);
  const [prevTotal, setPrevTotal] = useState(total);
  if (total !== prevTotal) {
    setPrevTotal(total);
    if (total > 0) {
      setIndex((i) => (i >= total ? total - 1 : i));
    }
  }

  // `onExhausted` is fired here, NOT from inside a `setIndex` updater.
  // React treats updaters as pure and may run them twice (StrictMode) or
  // during the render phase, so a side effect in there could close the
  // overlay twice or schedule a parent update mid-render. Reading `index`
  // from this render is safe and matches the "no refs, no mirrors" contract
  // above: the callback is recreated whenever `index` changes.
  const next = useCallback(() => {
    if (index >= total - 1) {
      onExhausted?.();
      return;
    }
    setIndex(index + 1);
  }, [index, total, onExhausted]);

  const prev = useCallback(() => {
    setIndex((i) => (i > 0 ? i - 1 : 0));
  }, []);

  const goto = useCallback(
    (i: number) => {
      if (i < 0 || i >= total) return;
      setIndex(i);
    },
    [total],
  );

  const reset = useCallback(() => setIndex(0), []);

  return { index, next, prev, goto, reset };
}
