/**
 * Last validated: 2026-11-18
 * Status: Active
 *
 * Screen Wake Lock на час активної сесії (Фз-1, рішення власника OD-28).
 *
 * AI-CONTEXT: блокування береться лише з екрана активної сесії
 * (`SessionView` монтується тільки для незавершеного тренування), тож вихід
 * із сесії і «Завершити» відпускають його розмонтуванням. Браузер сам знімає
 * блокування, коли вкладка ховається, і НЕ повертає його: тому на
 * `visibilitychange → visible` просимо знову. Відмова (низький заряд,
 * політика сторінки, прихований документ) ковтається: екран просто гасне як
 * раніше, сесія від цього не ламається.
 */
import { useEffect } from "react";

type WakeLockSentinelLike = Pick<WakeLockSentinel, "released" | "release">;

function getWakeLock(): WakeLock | null {
  if (typeof navigator === "undefined" || !("wakeLock" in navigator)) {
    return null;
  }
  // Safari < 16.4 і старі WebView не мають API зовсім; у jsdom його теж нема.
  const wl: WakeLock | undefined = navigator.wakeLock;
  return wl && typeof wl.request === "function" ? wl : null;
}

/** Чи вміє цей браузер тримати екран увімкненим (Screen Wake Lock API). */
export function isScreenWakeLockSupported(): boolean {
  return getWakeLock() !== null;
}

function releaseQuietly(s: WakeLockSentinelLike | null): void {
  if (!s || s.released) return;
  Promise.resolve()
    .then(() => s.release())
    .catch(() => {
      /* вже відпущене браузером — нічого робити */
    });
}

/** Тримає екран увімкненим, поки `enabled` і компонент змонтований. */
export function useScreenWakeLock(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;
    const wakeLock = getWakeLock();
    if (!wakeLock) return;

    let sentinel: WakeLockSentinelLike | null = null;
    let cancelled = false;
    let pending = false;

    const acquire = async () => {
      if (cancelled || pending) return;
      if (document.visibilityState !== "visible") return;
      if (sentinel && !sentinel.released) return;
      pending = true;
      try {
        const next = await wakeLock.request("screen");
        if (cancelled) {
          releaseQuietly(next);
          return;
        }
        sentinel = next;
      } catch {
        // Відмова браузера не є помилкою сесії: екран гасне як раніше.
      } finally {
        pending = false;
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") void acquire();
    };

    void acquire();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibility);
      releaseQuietly(sentinel);
      sentinel = null;
    };
  }, [enabled]);
}
