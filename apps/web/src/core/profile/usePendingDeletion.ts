import { useQuery } from "@tanstack/react-query";
import { apiQueryKeys } from "@sergeant/api-client/react";
import { meApi } from "@shared/api";
import { useAuth } from "../auth/AuthContext";

/**
 * Чи стоїть акаунт у 30-денному вікні на скасування видалення.
 *
 * ЧОМУ окремий запит, а не читання 403 з випадкового роута. Сервер
 * закриває позначений акаунт гейтом у `requireSession` (403
 * `account_pending_deletion`), але покладатись на те, що кожен екран
 * правильно обробить свій 403, означало б пускати людину в застосунок
 * рівно там, де обробки немає. Один запит на старті сесії дає відповідь
 * до того, як щось відрендериться.
 *
 * `enabled` прив'язаний до сесії: анонімним і демо-сесіям питати нема про
 * що, а сам роут за `requireSession` віддав би 401.
 */
export function usePendingDeletion() {
  const { user } = useAuth();
  const query = useQuery({
    queryKey: apiQueryKeys.me.deletionStatus(),
    queryFn: ({ signal }) => meApi.deletionStatus({ signal }),
    enabled: Boolean(user),
    // Стан змінюється рівно двома діями самої людини (попросила видалити,
    // скасувала), і обидві інвалідовують ключ вручну. Фоновий рефетч тут
    // додав би запитів без жодної нової інформації.
    staleTime: Infinity,
    // Мережевий збій не має перетворюватись на блокер: якщо статус
    // невідомий, застосунок працює як звичайно.
    retry: 1,
  });

  const status = query.data;
  return {
    isPending: status?.pending === true,
    scheduledPurgeAt: status?.pending ? status.scheduledPurgeAt : null,
    requestedAt: status?.pending ? status.requestedAt : null,
    isLoading: query.isLoading,
  };
}
