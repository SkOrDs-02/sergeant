import { useEffect, useRef } from "react";
import {
  UNCLAIMED_SWEEP_MS,
  commitStashedFormDrafts,
  discardAllFormDrafts,
  discardFormDraftsExcept,
  setFormDraftUser,
} from "@shared/lib/storage/formDrafts";

/**
 * Життєвий цикл чернеток форм під замком (sec-13, priv-15). Механізм описано в
 * `@shared/lib/storage/formDrafts`; тут оболонка лише:
 * - виставляє користувача, у чиїй партиції читаються чернетки, і стирає чужі
 *   (зміна користувача);
 * - при переході в `hidden` (locked/lockedOut) переносить знімки форм, що
 *   щойно розмонтувались, у sessionStorage. Passive-cleanup видалених дітей
 *   спрацьовує ПЕРЕД passive-ефектами батька того ж коміту, тож до цього
 *   ефекту знімки вже в памʼяті;
 * - через `UNCLAIMED_SWEEP_MS` після розблокування стирає незатребувані.
 */
export function useFormDraftLifecycle(
  userId: string | null,
  hidden: boolean,
  authLoading: boolean,
): void {
  useEffect(() => {
    // Поки сесія не розв'язалась, `userId === null` ще не означає «анонім»:
    // стерти чернетки власника на холодному старті під замком не можна.
    if (authLoading) return;
    setFormDraftUser(userId);
    discardFormDraftsExcept(userId);
  }, [userId, authLoading]);

  const wasHiddenRef = useRef(false);
  useEffect(() => {
    if (hidden) {
      wasHiddenRef.current = true;
      commitStashedFormDrafts(userId);
      return undefined;
    }
    if (!wasHiddenRef.current) return undefined;
    wasHiddenRef.current = false;
    const timer = setTimeout(discardAllFormDrafts, UNCLAIMED_SWEEP_MS);
    return () => clearTimeout(timer);
  }, [hidden, userId]);
}
