import { useCallback } from "react";
import { usePullRefreshErrorToast } from "@shared/hooks/usePullRefreshErrorToast";
import { requestCloudPull } from "@shared/lib/modules/cloudPullRequest";

/**
 * Жест «потягни, щоб оновити» в Операціях: банк (Mono + Privat через
 * уніфікований `mergedRefresh`) і хмарний пул разом. Пул чекаємо з коротким
 * таймаутом, щоб спінер не висів довше за розумний мережевий хоп.
 *
 * Провал хмарного пулу (офлайн, 5xx: `requestCloudPull` відхиляється)
 * перекидається, щоб жест показав тост із «Повторити», а не тихий «успіх»
 * (PR-X3 продуктового огляду, хвиля 8; так само, як Їжа). Провал банку
 * тосту не дає: його стан уже показують шапка й рядок синку
 * (`syncStatusLabels`), і другий сигнал був би шумом.
 */
export function useTransactionsPullRefresh(
  monoRefresh: (() => Promise<unknown> | void) | undefined,
) {
  const onRefresh = useCallback(async () => {
    const [, cloud] = await Promise.allSettled([
      typeof monoRefresh === "function" ? monoRefresh() : Promise.resolve(),
      requestCloudPull(2500),
    ]);
    if (cloud.status === "rejected") throw cloud.reason;
  }, [monoRefresh]);
  const onRefreshError = usePullRefreshErrorToast(onRefresh);
  return { onRefresh, onRefreshError };
}
