import { useEffect, useState } from "react";
import { getKyivDayKey, parseKyivDate } from "@shared/lib/time/kyivTime";

/** Refresh financial selectors at Kyiv midnight and after browser suspension. */
export function useKyivDayNow(): number {
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      clearTimeout(timer);
      const now = Date.now();
      const midnight = parseKyivDate(getKyivDayKey(now));
      if (!midnight) return;
      // Noon of the next civil day stays in that day across 23/25-hour DST days.
      const nextKey = getKyivDayKey(midnight.getTime() + 36 * 60 * 60 * 1000);
      const nextMidnight = parseKyivDate(nextKey);
      if (!nextMidnight) return;
      timer = setTimeout(
        refresh,
        Math.max(1, nextMidnight.getTime() - now + 1000),
      );
    };
    const refresh = () => {
      const now = Date.now();
      setNowMs((previous) =>
        getKyivDayKey(previous) === getKyivDayKey(now) ? previous : now,
      );
      schedule();
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    schedule();
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);
  return nowMs;
}
