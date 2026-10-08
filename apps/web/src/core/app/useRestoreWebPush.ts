import { useEffect } from "react";
import { restoreWebPushSubscriptionIfLost } from "@shared/hooks/restoreWebPushSubscription";

/**
 * Після входу перевіряє, чи не загубилась web-push підписка (наприклад,
 * «Скинути кеш PWA» знімає реєстрацію SW, а з нею і підписку), і ставить її
 * заново. Серверний `register` вимагає сесії, тож крутимо лише при `userId`.
 * Деталі — `@shared/hooks/restoreWebPushSubscription`.
 */
export function useRestoreWebPush(userId: string | null | undefined): void {
  useEffect(() => {
    if (!userId) return;
    void restoreWebPushSubscriptionIfLost();
  }, [userId]);
}
