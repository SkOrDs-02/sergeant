import { useCallback } from "react";
import { useToast } from "@shared/hooks/useToast";

/** Копія тосту провалу жесту «потягни, щоб оновити» — одна на весь веб. */
export const PULL_REFRESH_ERROR_MESSAGE =
  "Не вдалося оновити дані. Перевір зʼєднання.";
export const PULL_REFRESH_RETRY_LABEL = "Повторити";

/**
 * `onError` для `<PullToRefresh>`: тост провалу з дією «Повторити».
 *
 * ЧОМУ ОДИН ХУК. Провал жесту (офлайн, 5xx: `requestCloudPull` відхиляється
 * з `CloudPullError`, PR-H3 tail) до 2026-11-18 мав тост лише в Рутині та
 * Їжі, кожна зі своєю копією коду, а Фінік, Фізрук і хаб `onError` не
 * передавали зовсім, тож хук жесту ковтав відмову і спінер мовчки зникав, як
 * після успіху (PR-X3, хвиля 8). Тепер кожен `<PullToRefresh>` бере цей хук,
 * а контракт `pullToRefreshOnError.contract.test.ts` не пускає новий жест без
 * `onError`.
 *
 * `retry` — той самий виклик, що й жест: людині не треба повторювати рух.
 * Невдалий повтор показує той самий тост знову, а не проходить мовчки.
 */
export function usePullRefreshErrorToast(
  retry: () => Promise<unknown>,
): (err?: unknown) => void {
  const toast = useToast();
  return useCallback(() => {
    const showError = () => {
      toast.error(PULL_REFRESH_ERROR_MESSAGE, undefined, {
        label: PULL_REFRESH_RETRY_LABEL,
        onClick: () => {
          retry().catch(showError);
        },
      });
    };
    showError();
  }, [toast, retry]);
}
