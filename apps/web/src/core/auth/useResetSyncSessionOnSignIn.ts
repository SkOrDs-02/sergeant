/**
 * Last validated: 2026-10-05
 * Status: Active
 *
 * Скидає сигнал «синк не бачить сесії» (`sec-18`, `syncSessionSignal.ts`) у
 * момент переходу `unauthenticated → authenticated`. Спостереження «сесії
 * немає», записане на анонімному пристрої, до входу не стосується: без скидання
 * щойно залогінена людина бачила б «Сесія завершилась» до наступного тіку
 * writer-а. Хук реагує на сам перехід статусу, а не на окремий шлях входу, тож
 * покриває `login`, `register` і будь-який інший вхід без перезавантаження.
 *
 * Лише `unauthenticated → authenticated`: холодний старт (`loading →
 * authenticated`) і повернення з `pending_deletion` спостережень не стирають.
 */
import { useEffect, useRef } from "react";

import { resetSyncSessionMissing } from "../syncEngine/syncSessionSignal";

export function useResetSyncSessionOnSignIn(status: string): void {
  const prev = useRef(status);
  useEffect(() => {
    if (prev.current === "unauthenticated" && status === "authenticated") {
      resetSyncSessionMissing();
    }
    prev.current = status;
  }, [status]);
}
