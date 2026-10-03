/**
 * Last validated: 2026-07-31
 * Status: Active
 */
import { useState, useEffect } from "react";
import { apiUrl } from "@shared/lib/api/apiUrl";

/**
 * Live online/offline status.
 *
 * AI-CONTEXT: `navigator.onLine` alone is NOT trustworthy, and this hook gates
 * user-visible capability — the HubChat composer renders «Асистент недоступний
 * без інтернету» and `useChatSend` refuses to send while it is `false`
 * (`HubChatComposer.tsx`, `useChatSend.ts`). iOS Safari / standalone PWAs and
 * Capacitor WebViews are known to latch `navigator.onLine === false` after a
 * radio handover (Wi-Fi → LTE, VPN toggle, resume from background) without
 * ever firing the matching `online` event, so the flag stays stuck at `false`
 * on a perfectly working connection. Founder hit exactly this: the assistant
 * declared itself unavailable on a full-bar LTE session (report 2026-07-31).
 *
 * Contract:
 *  - `navigator.onLine === true` is taken at face value — trusting a
 *    claimed-online device costs nothing, and a request that then fails has
 *    its own error path (`friendlyChatError`).
 *  - `navigator.onLine === false` is treated as a *suspicion*, verified with a
 *    cheap unauthenticated `/livez` probe. Any answer at all proves the network
 *    path is up; only a thrown `TypeError` / timeout means genuinely
 *    unreachable.
 *  - The `offline` event still flips the value to `false` synchronously, so a
 *    real disconnect surfaces instantly. The probe then either confirms it or
 *    corrects it a moment later.
 *  - While the value is `false`, the probe repeats on an interval and whenever
 *    the tab becomes visible, so a stuck flag self-heals without a reload.
 */

/** Liveness endpoint — no DB touch, no auth, no version prefix. */
const PROBE_PATH = "/livez";
const PROBE_TIMEOUT_MS = 5_000;
/** Re-probe cadence while we believe we are offline. */
const PROBE_INTERVAL_MS = 20_000;
/**
 * Grace period between an `offline` event and its confirmation probe. The
 * event itself is trusted immediately (below); this only avoids burning a
 * request on a connection that flaps online again within a beat.
 */
const PROBE_CONFIRM_DELAY_MS = 1_500;

function makeTimeoutSignal(ms: number): AbortSignal | undefined {
  // `AbortSignal.timeout` is missing on older Safari; a probe without a
  // timeout is still better than no probe (the interval re-fires anyway).
  if (typeof AbortSignal === "undefined") return undefined;
  if (typeof AbortSignal.timeout !== "function") return undefined;
  return AbortSignal.timeout(ms);
}

/**
 * `true` when the server answered at all — see the contract note above.
 *
 * AI-DANGER: `mode: "no-cors"` is load-bearing, not cargo-cult. In production
 * the web app is on Vercel and the API on Coolify, so this probe is
 * cross-origin — and the server mounts CORS on `/api` only
 * (`app.use("/api", apiCorsMiddleware())` in `apps/server/src/app.ts`), while
 * the health probes live at the app root (`createHealthRouter` → `/livez`).
 * A CORS-mode request would therefore be rejected by the browser, `fetch`
 * would throw, and this helper would report "offline" on a perfectly healthy
 * connection — i.e. the exact bug it exists to fix, just moved one layer down.
 *
 * `no-cors` sidesteps that: the request is a simple GET (no custom headers),
 * the browser sends it, and the promise resolves with an opaque response as
 * long as the network round-trip succeeded. We never read the body or status —
 * reachability is the whole signal — so opacity costs us nothing.
 *
 * Service-worker note: `/livez` is neither a navigation nor `/api/*`, so no
 * workbox route matches it (`sw/cache.ts`, `sw/cachePolicy.ts`) and it always
 * hits the real network. If that ever changes, this probe starts lying.
 */
async function probeReachable(): Promise<boolean> {
  if (typeof fetch !== "function") return false;
  const signal = makeTimeoutSignal(PROBE_TIMEOUT_MS);
  try {
    await fetch(apiUrl(PROBE_PATH), {
      method: "GET",
      mode: "no-cors",
      cache: "no-store",
      credentials: "omit",
      ...(signal ? { signal } : {}),
    });
    return true;
  } catch {
    return false;
  }
}

export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState<boolean>(() =>
    typeof navigator === "undefined" ? true : navigator.onLine,
  );

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const clearTimer = () => {
      if (timer !== undefined) {
        clearTimeout(timer);
        timer = undefined;
      }
    };

    /**
     * Verify a suspected-offline state. A successful probe means
     * `navigator.onLine` is lying, so we flip back to online.
     */
    const verify = async () => {
      if (cancelled) return;
      if (typeof navigator !== "undefined" && navigator.onLine) {
        // The platform corrected itself — no probe needed.
        clearTimer();
        setOnline(true);
        return;
      }
      const reachable = await probeReachable();
      if (cancelled) return;
      setOnline(reachable);
      clearTimer();
      // Keep watching: `navigator.onLine` is still `false`, so no `online`
      // event will tell us when the truth changes in either direction. Pause
      // while the tab is hidden — nothing is rendered there.
      if (typeof document === "undefined" || !document.hidden) {
        timer = setTimeout(() => void verify(), PROBE_INTERVAL_MS);
      }
    };

    const handleOnline = () => {
      clearTimer();
      setOnline(true);
    };

    const handleOffline = () => {
      // Flip immediately — a genuine disconnect must surface without waiting
      // on a probe that is about to time out anyway. Confirmation comes a beat
      // later; if the platform was wrong, `verify` flips us back.
      setOnline(false);
      clearTimer();
      timer = setTimeout(() => void verify(), PROBE_CONFIRM_DELAY_MS);
    };

    const handleVisibility = () => {
      if (typeof document !== "undefined" && document.hidden) {
        clearTimer();
        return;
      }
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        void verify();
      }
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    document.addEventListener("visibilitychange", handleVisibility);

    // A cold start already claiming offline is the stuck-flag case — verify
    // now instead of leaving the assistant disabled until the next radio event.
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      void verify();
    }

    return () => {
      cancelled = true;
      clearTimer();
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, []);

  return online;
}
