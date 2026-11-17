/**
 * sec-10 (аудит 2026-10-01): облік невірного поточного пароля на перевірках
 * для вже автентифікованої сесії.
 *
 * Три джерела, одна метрика `auth_password_check_failures_total{route}`:
 *   - `DELETE /api/me` — наш роут, звіряє пароль сам (`routes/me.ts`);
 *   - `POST /api/auth/change-email` — наш middleware перед Better Auth
 *     (`http/changeEmailReauth.ts`, sec-06);
 *   - `POST /api/auth/change-password` — Better Auth, кидає
 *     `APIError` з `code: "INVALID_PASSWORD"`; ловимо в `hooks.after`, бо
 *     after-хуки Better Auth виконуються й на помилці (`ctx.context.returned`
 *     тоді містить сам `APIError`).
 *
 * Код відповіді 400 сам по собі не годиться: change-password повертає 400 і
 * на `PASSWORD_TOO_SHORT` / валідацію, а серія таких — не підбір пароля.
 *
 * Лог несе лише `userIdHash` (Hard Rule #21): за ним тріаж корелює серію з
 * однією вкраденою сесією, у Prometheus користувача немає (кардинальність).
 */

import { APIError } from "better-auth/api";
import { hashUserId } from "../lib/userIdHash.js";
import { logger } from "../obs/logger.js";
import { authPasswordCheckFailuresTotal } from "../obs/metrics.js";

export type PasswordCheckRoute =
  "account_delete" | "change_password" | "change_email";

export function recordPasswordCheckFailure(
  route: PasswordCheckRoute,
  userId: string | null | undefined,
): void {
  try {
    authPasswordCheckFailuresTotal.inc({ route });
    logger.warn({
      msg: "auth.password_check.failed",
      route,
      userIdHash: hashUserId(userId),
    });
  } catch {
    /* облік не має ламати відповідь */
  }
}

interface AfterHookCtx {
  path?: string;
  context?: unknown;
}

/** `hooks.after` в `auth.ts`: рахує лише справжній INVALID_PASSWORD. */
export function countChangePasswordFailureAfter(ctx: AfterHookCtx): void {
  if (ctx.path !== "/change-password") return;
  const context = ctx.context as
    | { returned?: unknown; session?: { user?: { id?: unknown } } | null }
    | undefined;
  const returned = context?.returned;
  if (!(returned instanceof APIError)) return;
  const code = (returned.body as { code?: unknown } | undefined)?.code;
  if (code !== "INVALID_PASSWORD") return;
  const userId = context?.session?.user?.id;
  recordPasswordCheckFailure(
    "change_password",
    typeof userId === "string" ? userId : null,
  );
}
