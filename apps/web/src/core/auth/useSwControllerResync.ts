import { useEffect, type RefObject } from "react";
import { logger } from "@shared/lib";
import { onSwControllerChange, swSetActiveUser } from "../app/swControl";

/**
 * priv-08: новий SW-контролер (перший після install, оновлення версії) міг
 * стартувати без ключа партиції, а `SW_SET_USER` в `AuthContext` шлеться лише
 * на зміну `user.id`. Повторюємо його для поточного користувача на
 * `controllerchange`. Без користувача нічого не шлемо: вихід і втрата сесії
 * самі шлють `swSetActiveUser(null)`.
 *
 * Читає користувача з ref, щоб підписка жила один раз, а не перезапускалась
 * на кожен новий `user`-референс.
 */
export function useSwControllerResync(
  userRef: RefObject<{ id: string } | null | undefined>,
): void {
  useEffect(
    () =>
      onSwControllerChange(() => {
        const id = userRef.current?.id;
        if (!id) return;
        void swSetActiveUser(id).catch((err) =>
          logger.warn("[auth.controllerchange] swSetActiveUser failed", err),
        );
      }),
    [userRef],
  );
}
