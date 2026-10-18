import { useEffect, useState } from "react";

/** Live time for selectors whose result changes without a record write. */
export function useMinuteNow(): number {
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      clearTimeout(timer);
      timer = setTimeout(refresh, 60_000 - (Date.now() % 60_000) + 1);
    };
    const refresh = () => {
      if (document.visibilityState === "visible") setNowMs(Date.now());
      schedule();
    };
    schedule();
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, []);
  return nowMs;
}
