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
 * модулів не має мовчки ламати налаштування вигляду й навпаки.
 *
 * Звичайний `useEffect`-fetch, а не React Query — збігається з рештою
 * викликів `/api/me/preferences` (`PrivacySection`, `useServerPreference`,
 * `useAnalyticsConsentBoot`, `useActiveModulesSync`): це one-shot
 * boot-read, а не кешований спільний ресурс, тож фабрики ключів
 * (Hard Rule #2) тут не потрібні.
 */
import { useEffect, useRef, useState } from "react";
import { logger } from "@shared/lib";
import { useAuth } from "../auth/AuthContext";
import { readHubPrefsBag, writeHubPrefsBag } from "./hubPrefs";
import { hydrateHubPrefs, setHubPrefsSyncEnabled } from "./hubPrefsSync";

/**
 * Скільки разів повторювати гідратацію після невдалого GET-а і з якими
 * паузами. Обмежено навмисно: нескінченний ретрай по мережі, якої може не
 * бути, палив би батарею й нічого не гарантував — незбережені локальні
 * зміни й так переживають перезавантаження через мітку
 * `HUB_PREFS_UNSYNCED`.
 */
const RETRY_DELAYS_MS = [2_000, 8_000, 30_000] as const;
const MAX_HYDRATE_RETRIES = RETRY_DELAYS_MS.length;

export function useHubPrefsSync(): void {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const hydratedForUserRef = useRef<string | null>(null);
  /**
   * Хто саме залогінений ПРЯМО ЗАРАЗ. Потрібен усередині async-колбека,
   * бо замикання тримає `userId` на момент запуску ефекту, а до моменту
   * відповіді акаунт міг змінитись.
   */
  const currentUserRef = useRef<string | null>(userId);
  /**
   * Лічильник спроб гідратації. У залежностях ефекту — і це єдине, що
   * реально дає ПОВТОР після невдалого GET-а.
   *
   * Перша версія покладалась на скидання `hydratedForUserRef` у `.catch`,
   * і я написав на PR, що «наступний ререндер спробує ще раз». Це було
   * невірно, і рев'ю це знайшло: запис у ref не викликає ререндера, а
   * залежності ефекту — `[userId]`, тож без зміни акаунта ефект більше не
   * запускається взагалі. Один невдалий GET вимикав би синхронізацію до
   * кінця сесії, і мовчки.
   */
  const [attempt, setAttempt] = useState(0);
  const retryCountRef = useRef(0);
  const retryTimerRef = useRef<number | null>(null);

  useEffect(() => {
    // Пишеться в ефекті, не в рендері (`react-hooks/refs`). Порядок
    // безпечний: ефект перезапускається на КОЖНУ зміну `userId`, тож ref
    // оновлюється перед стартом нової гідратації, а колбек попередньої
    // бачить уже новий id і мовчки виходить.
    currentUserRef.current = userId;

    if (!userId) {
      // Вийшли з акаунта — скидаємо guard, щоб НАСТУПНИЙ вхід (можливо
      // іншим акаунтом на спільному пристрої) гідратувався заново, а не
      // лишався з налаштуваннями попереднього користувача.
      hydratedForUserRef.current = null;
      retryCountRef.current = 0;
      setHubPrefsSyncEnabled(false);
      return;
    }
    if (hydratedForUserRef.current === userId) return;
    hydratedForUserRef.current = userId;

    // AI-DANGER: канал вмикається ЛИШЕ ПІСЛЯ гідратації, і порядок тут
    // несучий (знахідка рев'ю CodeRabbit на #1195). Перша версія вмикала
    // його перед запитом, і це лишало вікно рівно на час GET-а: тумблер,
    // перемкнутий у ньому, відправляв повний ЛОКАЛЬНИЙ мішок — можливо,
    // гостьовий або від попереднього акаунта, — а гідратація потім
    // бачила зсунутий лічильник і відкидала серверну відповідь.
    //
    // Зміни, зроблені у вікні, не губляться: `pushHubPrefs` кладе їх у
    // чергу навіть при вимкненому каналі, а `setHubPrefsSyncEnabled(true)`
    // її зливає.
    void hydrateHubPrefs(
      readHubPrefsBag,
      writeHubPrefsBag,
      () => currentUserRef.current === userId,
    )
      .then(() => {
        // Сесія могла змінитись, поки запит був у польоті — тоді вмикати
        // канал для ЦЬОГО userId вже немає сенсу: ефект для нового
        // користувача вмикає його сам після своєї гідратації.
        if (currentUserRef.current === userId) setHubPrefsSyncEnabled(true);
      })
      .catch((err: unknown) => {
        logger.warn("[hubPrefs] boot hydrate failed", err);
        // Канал НЕ вмикаємо: ми не знаємо, що на акаунті, тож піднімати
        // туди локальний мішок наосліп означало б ризикувати затерти
        // налаштування з іншого пристрою.
        if (hydratedForUserRef.current !== userId) return;
        hydratedForUserRef.current = null;

        if (retryCountRef.current >= MAX_HYDRATE_RETRIES) {
          logger.warn("[hubPrefs] boot hydrate gave up", {
            attempts: retryCountRef.current + 1,
          });
          return;
        }
        const delay = RETRY_DELAYS_MS[retryCountRef.current] ?? 0;
        retryCountRef.current += 1;
        // Таймер скасовується у cleanup нижче — вихід з акаунта чи вхід
        // іншим не має тягнути за собою спробу для попереднього.
        retryTimerRef.current = window.setTimeout(() => {
          if (currentUserRef.current === userId) setAttempt((n) => n + 1);
        }, delay);
      });

    return () => {
      if (retryTimerRef.current !== null) {
        window.clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
    };
  }, [userId, attempt]);
}
