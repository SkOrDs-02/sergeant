/**
 * Boot-хук, який зводить вибір модулів між акаунтом і пристроєм —
 * знахідка B2 (частина 2) браузерного аудиту 2026-08-05. Логіка злиття
 * і причини асиметрії живуть у `activeModulesSync.ts`; тут лише
 * життєвий цикл.
 *
 * Свій хук, а не гілка в `useAnalyticsConsentBoot`, з тієї ж причини,
 * що й там: регрес у consent-гідратації не має мовчки ламати вибір
 * модулів і навпаки. Монтується один раз, app-wide, у `AppShell`
 * (`core/app/RootLayout.tsx`).
 *
 * Звичайний `useEffect`-fetch, а не React Query — збігається з рештою
 * викликів `/api/me/preferences` (`PrivacySection`, `useServerPreference`,
 * `useAnalyticsConsentBoot`): це one-shot boot-read, а не кешований
 * спільний ресурс, тож фабрики ключів (Hard Rule #2) тут не потрібні.
 */
import { useEffect, useRef } from "react";
import { logger } from "@shared/lib";
import { useAuth } from "../auth/AuthContext";
import { hydrateActiveModules } from "./activeModulesSync";

export function useActiveModulesSync(): void {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const hydratedForUserRef = useRef<string | null>(null);

  useEffect(() => {
    if (!userId) {
      // Вийшли з акаунта — скидаємо guard, щоб НАСТУПНИЙ вхід (можливо
      // іншим акаунтом на спільному пристрої) гідратувався заново, а не
      // лишався з вибором попереднього користувача.
      hydratedForUserRef.current = null;
      return;
    }
    if (hydratedForUserRef.current === userId) return;
    hydratedForUserRef.current = userId;

    void hydrateActiveModules().catch((err: unknown) => {
      logger.warn("[activeModules] boot hydrate failed", err);
    });
  }, [userId]);
}
