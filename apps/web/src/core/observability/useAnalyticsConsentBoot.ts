/**
 * Hydrates the in-memory `analyticsConsent` cache from
 * `GET /api/me/preferences` on every authenticated boot, so a synchronous
 * consent gate (`getAnalyticsConsent()` — e.g. `InsightCard`'s
 * `advice_shown` / `advice_dismissed` telemetry) reflects the server's
 * persisted choice as soon as possible after a reload, not only after the
 * user opens Settings → Privacy (`PrivacySection`, the other writer of
 * this cache).
 *
 * `cachedAnalyticsConsent` now defaults to `false` (deny until hydrated —
 * see `analyticsConsent.ts`'s doc comment for the race this closes,
 * CodeRabbit PR #627), so a page reload never fires analytics before this
 * fetch resolves.
 *
 * Mounted once, app-wide, right next to `useProfileWriteThroughBoot` in
 * `AppShell` (`core/app/RootLayout.tsx`) — deliberately its own hook (not
 * folded into that one) so a profile/biometrics regression can never
 * silently break analytics-consent hydration and vice versa. Uses a plain
 * `useEffect` fetch (not React Query) to match the existing
 * `/api/me/preferences` call sites (`PrivacySection`, `useServerPreference`),
 * which take the same approach for the same endpoint — this is a one-shot
 * boot read, not a cached/shared resource.
 */
import { useEffect, useRef } from "react";
import { meApi } from "@shared/api";
import { logger } from "@shared/lib";
import { useAuth } from "../auth/AuthContext";
import { setAnalyticsConsent } from "./analyticsConsent";

export function useAnalyticsConsentBoot(): void {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const hydratedForUserRef = useRef<string | null>(null);

  useEffect(() => {
    if (!userId) {
      // Signed out — clear the guard so the NEXT sign-in (possibly a
      // different account on a shared device) hydrates again instead of
      // keeping the previous user's cached consent value.
      hydratedForUserRef.current = null;
      return;
    }
    if (hydratedForUserRef.current === userId) return;
    hydratedForUserRef.current = userId;

    let cancelled = false;
    meApi
      .getPreferences()
      .then((prefs) => {
        if (cancelled) return;
        setAnalyticsConsent(prefs.analytics);
      })
      .catch((err: unknown) => {
        logger.warn("[analyticsConsent] boot hydrate failed", err);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);
}
