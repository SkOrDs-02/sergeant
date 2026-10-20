/**
 * Last validated: 2026-10-20
 * Status: Active
 *
 * Реакція цієї вкладки на «сесію завершено в іншій» (`priv-02`). Живе окремо
 * від `AuthContext` (ліміт 600 рядків, Hard Rule #18) і не імпортує нічого
 * важкого: це eager-чанк.
 *
 * Те саме, що робить `logout()` для локальних даних: стампимо owner ДО
 * `setSignedOut` (інакше identity-ефект `AuthContext` запустив би другий
 * teardown), перемикаємо UI, чистимо кеш, локальний teardown і екран входу.
 * Повідомлення НЕ розсилаємо далі (вийшло б ехо між вкладками). SQLite-
 * партицію не чіпаємо: це priv-05.
 */
import { useEffect, useRef } from "react";
import type { QueryClient } from "@tanstack/react-query";

import { logger } from "@shared/lib";
import { clearPersistedQueryCache } from "@shared/lib/api/queryClientPersister";

import { reconcileChatOwnerOnAuthChange } from "../hub/hubChatSessions";
import { clearHubQuickStatsSnapshots } from "./hubQuickStatsSnapshots";
import { navigateToSignIn } from "./logoutBeforeNavigate";
import { subscribeSessionEnded } from "./sessionBroadcast";
import { teardownLocalStateAfterSessionLoss } from "./sessionLossTeardown";

/**
 * `active` — у вкладки є користувач: анонімній вкладці стирати нічого, і
 * перезавантажувати її через чужий вихід немає причин.
 */
export function useCrossTabSessionEnd(
  active: boolean,
  queryClient: QueryClient,
  setSignedOut: (value: boolean) => void,
): void {
  const latest = useRef({ active, queryClient, setSignedOut });
  useEffect(() => {
    latest.current = { active, queryClient, setSignedOut };
  });

  useEffect(
    () =>
      subscribeSessionEnded(() => {
        const {
          active: isActive,
          queryClient: qc,
          setSignedOut: out,
        } = latest.current;
        if (!isActive) return;
        reconcileChatOwnerOnAuthChange(null);
        clearHubQuickStatsSnapshots();
        out(true);
        qc.clear();
        void teardownLocalStateAfterSessionLoss()
          .then(() => clearPersistedQueryCache())
          .catch((err) => {
            logger.warn("[auth.crossTab] teardown failed", err);
          })
          .finally(() => {
            navigateToSignIn();
          });
      }),
    [],
  );
}
