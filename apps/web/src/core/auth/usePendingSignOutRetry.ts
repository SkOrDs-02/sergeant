/**
 * Last validated: 2026-10-04
 * Status: Active
 *
 * Повтор `sign-out`, що не дійшов до сервера (`sec-07`, див.
 * `pendingSignOut.ts`): одразу на старті провайдера (якщо маркер стоїть) і на
 * кожну появу мережі. Хук лише ганяє повтор; рішення «пристрій розлогінений,
 * поки маркер стоїть» живе в `AuthContext` (початкове значення `signedOut`).
 *
 * AI-DANGER: eager-чанк, без runtime-імпорту `@sergeant/shared`.
 */
import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { logger } from "@shared/lib";
import { swClearCaches } from "../app/swControl";
import { signOut } from "./authClient";
import { retryPendingSignOut } from "./pendingSignOut";

export function usePendingSignOutRetry(): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    const run = () => {
      void retryPendingSignOut(signOut).then((outcome) => {
        if (outcome !== "confirmed") return;
        // Сервер підтвердив вихід: усе, що за живої сесії встигло осісти в
        // памʼяті (відповідь `me`, authed-запити модулів), і SW-кеш зайве.
        queryClient.clear();
        swClearCaches().catch((err) =>
          logger.warn("[auth.pendingSignOut] swClearCaches failed", err),
        );
      });
    };
    run();
    window.addEventListener("online", run);
    return () => window.removeEventListener("online", run);
  }, [queryClient]);
}
