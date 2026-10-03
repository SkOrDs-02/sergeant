import { useEffect } from "react";
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
 * `enabled` прив'язаний до сесії, а не лише до `user`: для позначеного
 * акаунта `GET /api/me` віддає 403, тож `user` порожній, і запит ніколи не
 * стартував — екран відновлення був недосяжний (аудит 2026-10-01, logic-01).
 * Сесію тут показує `pendingDeletion` з AuthContext (403 на `me`). Анонімним
 * сесіям питати нема про що, а сам роут за `requireSession` віддав би 401.
 *
 * 403 на `me` — авторитетна відповідь, тож поки `deletion-status` не
 * відповів (або впав), вікно вважається відкритим із датою з тіла 403.
 */
export function usePendingDeletion() {
  const { user, pendingDeletion, refresh } = useAuth();
  const query = useQuery({
    queryKey: apiQueryKeys.me.deletionStatus(),
    queryFn: ({ signal }) => meApi.deletionStatus({ signal }),
    enabled: Boolean(user) || Boolean(pendingDeletion),
    // Стан змінюється рівно двома діями самої людини (попросила видалити,
    // скасувала), і обидві інвалідовують ключ вручну. Фоновий рефетч тут
    // додав би запитів без жодної нової інформації.
    staleTime: Infinity,
    // Мережевий збій не має перетворюватись на блокер: якщо статус
    // невідомий, застосунок працює як звичайно.
    retry: 1,
  });

  const status = query.data;

  // AI-DANGER: 403 `account_pending_deletion` на `me` авторитетніший за
  // кеш `deletion-status`. Кеш живе з `staleTime: Infinity` і міг лишитись
  // від доби до видалення (`pending: false`); якщо довіряти йому, позначений
  // акаунт отримав би застосунок замість екрана відновлення.
  const windowOpen = Boolean(pendingDeletion) || status?.pending === true;

  // `me` ще віддає 403, а свіжий `deletion-status` каже «не в черзі»
  // (скасовано з іншого пристрою): перепитуємо `me`, щоб людину пустило в
  // застосунок. Один раз на перехід: якщо `me` і далі 403, цикла немає.
  const staleBlocker = Boolean(pendingDeletion) && status?.pending === false;
  useEffect(() => {
    if (staleBlocker) void refresh();
  }, [staleBlocker, refresh]);

  return {
    isPending: windowOpen,
    scheduledPurgeAt:
      pendingDeletion?.scheduledPurgeAt ??
      (status?.pending ? status.scheduledPurgeAt : null),
    requestedAt: status?.pending ? status.requestedAt : null,
    isLoading: query.isLoading,
  };
}
