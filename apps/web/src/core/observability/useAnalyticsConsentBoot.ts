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
import {
  getPendingAnalyticsSync,
  hydrateAnalyticsConsent,
  markAnalyticsDecisionSynced,
  markAnalyticsServerHydrated,
} from "./analyticsConsent";

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
      markAnalyticsServerHydrated(false);
      return;
    }
    if (hydratedForUserRef.current === userId) return;
    hydratedForUserRef.current = userId;

    let cancelled = false;

    // Гість відповів на крок згоди (чи банер) і щойно увійшов: його вибір
    // свіжіший за серверний дефолт `analytics: false`, тож віддаємо його на
    // сервер, а не читаємо звідти. Без цього «Дозволити» гостя після
    // реєстрації мовчки ставало «Ні». Свідомий компроміс: якщо акаунт уже
    // мав явну відмову з іншого пристрою, перемагає останній явний вибір.
    const pending = getPendingAnalyticsSync();
    if (pending !== null) {
      const granted = pending === "granted";
      meApi
        .updatePreferences({ analytics: granted })
        .then(() => {
          if (cancelled) return;
          markAnalyticsDecisionSynced();
          hydrateAnalyticsConsent(granted);
        })
        .catch((err: unknown) => {
          logger.warn("[analyticsConsent] guest decision sync failed", err);
          // Прапорець лишається — спробуємо при наступному вході. На цьому
          // пристрої діє локальне рішення.
          if (!cancelled) markAnalyticsServerHydrated(true);
        });
      return () => {
        cancelled = true;
      };
    }

    meApi
      .getPreferences()
      .then((prefs) => {
        if (cancelled) return;
        hydrateAnalyticsConsent(prefs.analytics);
      })
      .catch((err: unknown) => {
        logger.warn("[analyticsConsent] boot hydrate failed", err);
        // Без відповіді сервера не тримаємо банер вічно прихованим:
        // покладаємось на локальне рішення пристрою.
        if (!cancelled) markAnalyticsServerHydrated(true);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);
}
