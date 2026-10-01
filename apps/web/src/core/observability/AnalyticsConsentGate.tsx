/**
 * @status Active
 * @owner @Skords-01
 */
import { lazy, Suspense, useSyncExternalStore } from "react";
import { useLocation } from "react-router-dom";
import { isLegalRoutePath } from "../app/appPaths";
import { useAuth } from "../auth/AuthContext";
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
 * На юридичних сторінках (`/legal/*`) банер не показується: його посилання
 * «Про приватність» веде якраз туди, і фіксований банер лишався б поверх самого
 * тексту політики. Рішення при цьому не ухвалюється — на решті маршрутів банер
 * з'явиться, доки згоди немає.
 */
export function AnalyticsConsentGate() {
  const { pathname } = useLocation();
  const { status } = useAuth();
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
  if (isLegalRoutePath(pathname)) return null;
  if (status === "loading") return null;
  if (status === "authenticated" && !hydrated) return null;

  return (
    <Suspense fallback={null}>
      <AnalyticsConsentBanner />
    </Suspense>
  );
}
