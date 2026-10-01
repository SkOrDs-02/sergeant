/**
 * @status Active
 * @owner @Skords-01
 */
import { lazy, Suspense, useSyncExternalStore } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { isOnboardingPath } from "../app/appPaths";
import {
  getAnalyticsDecision,
  isAnalyticsServerHydrated,
  subscribeAnalyticsConsent,
} from "./analyticsConsent";

/**
 * Ліниво: банер потрібен один раз за життя пристрою, а `RootLayout` сидить на
 * критичному шляху, стеля якого гейтиться окремо (`size:eager`). Тут лишається
 * лише крихітна перевірка «чи вже відповідав».
 */
const AnalyticsConsentBanner = lazy(() => import("./AnalyticsConsentBanner"));

/**
 * Показує банер згоди, доки на цьому пристрої немає рішення. Залогіненому
 * чекає серверну гідрацію (`useAnalyticsConsentBoot`), щоб людина, яка вже
 * погодилась на іншому пристрої, не бачила банер на мить.
 *
 * З 2026-10-01 банер — запасний шлях: на екранах онбордингу згоду питає його
 * власний крок (`OnboardingConsentStep`), тож тут банер там не показується.
 * Лишається для тих, хто вже минув онбординг і ніколи не відповідав.
 */
export function AnalyticsConsentGate() {
  const { status } = useAuth();
  const { pathname } = useLocation();
  const decision = useSyncExternalStore(
    subscribeAnalyticsConsent,
    getAnalyticsDecision,
    getAnalyticsDecision,
  );
  const hydrated = useSyncExternalStore(
    subscribeAnalyticsConsent,
    isAnalyticsServerHydrated,
    isAnalyticsServerHydrated,
  );

  if (decision !== null) return null;
  if (isOnboardingPath(pathname)) return null;
  if (status === "loading") return null;
  if (status === "authenticated" && !hydrated) return null;

  return (
    <Suspense fallback={null}>
      <AnalyticsConsentBanner />
    </Suspense>
  );
}
