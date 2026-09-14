/**
 * Last validated: 2026-09-14
 * Status: Active
 *
 * Boot-хук, який зводить налаштування вигляду хаба між акаунтом і
 * пристроєм — знахідка PR-S13 продуктового огляду 2026-09-13, рішення
 * founder-а 2026-09-14. Логіка злиття і причини асиметрії живуть у
 * `hubPrefsSync.ts`; тут лише життєвий цикл.
 *
 * Свій хук, а не гілка в `useActiveModulesSync`, з тієї ж причини, з якої
 * той — окремий від `useAnalyticsConsentBoot`: регрес у гідратації вибору
 * модулів не має мовчки ламати налаштування вигляду й навпаки. Ціна —
 * другий GET `/api/me/preferences` на буті; це той самий дешевий
 * one-shot-read, який уже роблять чотири сусідні поверхні.
 *
 * Звичайний `useEffect`-fetch, а не React Query — збігається з рештою
 * викликів `/api/me/preferences` (`PrivacySection`, `useServerPreference`,
 * `useAnalyticsConsentBoot`, `useActiveModulesSync`): це one-shot
 * boot-read, а не кешований спільний ресурс, тож фабрики ключів
 * (Hard Rule #2) тут не потрібні.
 */
import { useEffect, useRef } from "react";
import { logger } from "@shared/lib";
import { useAuth } from "../auth/AuthContext";
import { readHubPrefsBag, writeHubPrefsBag } from "./hubPrefs";
import { hydrateHubPrefs, setHubPrefsSyncEnabled } from "./hubPrefsSync";

export function useHubPrefsSync(): void {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const hydratedForUserRef = useRef<string | null>(null);

  useEffect(() => {
    if (!userId) {
      // Вийшли з акаунта — скидаємо guard, щоб НАСТУПНИЙ вхід (можливо
      // іншим акаунтом на спільному пристрої) гідратувався заново, а не
      // лишався з налаштуваннями попереднього користувача.
      hydratedForUserRef.current = null;
      // І глушимо вихідний канал: у гостя кожен тумблер слав би PATCH,
      // приречений на 401 (розбір — у `hubPrefsSync.ts`).
      setHubPrefsSyncEnabled(false);
      return;
    }
    if (hydratedForUserRef.current === userId) return;
    hydratedForUserRef.current = userId;
    setHubPrefsSyncEnabled(true);

    void hydrateHubPrefs(readHubPrefsBag, writeHubPrefsBag).catch(
      (err: unknown) => {
        logger.warn("[hubPrefs] boot hydrate failed", err);
      },
    );
  }, [userId]);
}
