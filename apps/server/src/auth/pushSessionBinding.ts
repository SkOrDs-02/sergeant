import type { Request } from "express";
import { logger } from "../obs/logger.js";

/**
 * Прив'язка web-push підписки до сесії Better Auth (аудит 2026-10-01,
 * `priv-04`, серверна частина; клієнтська - #1341).
 *
 * Web-push endpoint належить БРАУЗЕРУ, не акаунту. Клієнтський `logout()`
 * знімає підписку best-effort, але сесія може завершитись і без нього:
 * таймаут/офлайн під час виходу, «вийти з інших пристроїв», revoke після зміни
 * пароля, видалення акаунта. Тоді банківські пуші A далі приходили б у браузер,
 * яким уже користується B. Тому `register` пише id сесії (міграція 161), а
 * `databaseHooks.session.delete.after` знімає підписки саме цієї сесії.
 *
 * Живе окремим модулем, щоб `auth.ts` (понад ліміт Hard Rule #18) отримав
 * лише два однорядкові виклики, а тест міг перевірити хук на справжньому
 * `betterAuth()` без Postgres.
 *
 * Hard Rule #21: id сесії - ідентифікатор автентифікації, у логи не потрапляє.
 */

type RequestWithSessionId = Request & { sessionId?: string };

/** Кладе id сесії в запит; читає `register` через {@link getRequestSessionId}. */
export function setRequestSessionId(
  req: Request,
  sessionId: string | null | undefined,
): void {
  if (typeof sessionId === "string" && sessionId.length > 0) {
    (req as RequestWithSessionId).sessionId = sessionId;
  }
}

/** id сесії поточного запиту або `null` (немає сесії / не резолвилась). */
export function getRequestSessionId(req: Request): string | null {
  return (req as RequestWithSessionId).sessionId ?? null;
}

interface Queryable {
  query: (
    text: string,
    values: unknown[],
  ) => Promise<{ rowCount: number | null }>;
}

export const REVOKE_SESSION_PUSH_SQL = `UPDATE push_subscriptions
    SET deleted_at = NOW()
  WHERE session_id = $1 AND deleted_at IS NULL`;

/**
 * Soft-delete web-push підписок, зареєстрованих із завершеної сесії. Чужі
 * сесії та рядки без `session_id` не чіпає. Ніколи не кидає: збій тут не має
 * зривати вихід чи revoke (сесію вже видалено, клієнт однаково знімає
 * підписку сам), тож лише логуємо без id сесії.
 */
export async function revokePushSubscriptionsForSession(
  db: Queryable,
  sessionId: string | null | undefined,
): Promise<void> {
  if (typeof sessionId !== "string" || sessionId.length === 0) return;
  try {
    const res = await db.query(REVOKE_SESSION_PUSH_SQL, [sessionId]);
    if (res.rowCount) {
      logger.info({ msg: "push_session_revoked", revoked: res.rowCount });
    }
  } catch (err) {
    logger.warn({
      msg: "push_session_revoke_failed",
      err: err instanceof Error ? err.message : String(err),
    });
  }
}
