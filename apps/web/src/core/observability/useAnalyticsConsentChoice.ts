/**
 * @status Active
 * @owner @Skords-01
 */
import { useRef, useState } from "react";
import { meApi } from "@shared/api";
import { logger } from "@shared/lib";
import { useAuth } from "../auth/AuthContext";
import { setAnalyticsConsent } from "./analyticsConsent";

/**
 * Явний вибір людини про продуктову аналітику: «Дозволити» / «Ні, дякую».
 *
 * Спільний для обох поверхонь, що питають згоду, щоб шлях запису не роздвоївся:
 *   - крок онбордингу (`core/onboarding/OnboardingConsentStep.tsx`, рішення
 *     власника 2026-10-01) — основний шлях для нових людей;
 *   - плаваючий банер (`AnalyticsConsentBanner`) — запасний шлях для тих, хто
 *     вже минув онбординг і ніколи не відповідав.
 *
 * Вибір іде в `setAnalyticsConsent` — єдине джерело правди згоди (воно ж
 * живить PostHog opt-in/out і тумблер у Налаштування → Приватність); для
 * залогіненого дублюється на сервер, гість лишає рішення на пристрої.
 * `onChosen` викликається після локального запису, тож подія, яку хост шле
 * наступним рядком, уже бачить нове значення згоди.
 */
export function useAnalyticsConsentChoice(
  onChosen?: (granted: boolean) => void,
): { choose: (granted: boolean) => void; saving: boolean } {
  const { user } = useAuth();
  const [saving, setSaving] = useState(false);
  // `useState` сам по собі не блокує другий тап у тому ж тіку (оновлення
  // видно лише наступному рендеру), а запис згоди й сервер-запит не
  // ідемпотентні.
  const chosenRef = useRef(false);

  const choose = (granted: boolean) => {
    if (chosenRef.current) return;
    chosenRef.current = true;
    setSaving(true);
    // Локально й одразу: PostHog opt-in/out і зникнення банера без мережі.
    setAnalyticsConsent(granted);
    if (user) {
      meApi.updatePreferences({ analytics: granted }).catch((err: unknown) => {
        // Вибір на пристрої вже діє; сервер підтягнеться тумблером.
        logger.warn("[analyticsConsent] persist failed", err);
      });
    }
    onChosen?.(granted);
  };

  return { choose, saving };
}
