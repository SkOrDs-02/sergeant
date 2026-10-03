/**
 * Звірка пароля для операцій, які цього вимагають (сьогодні одна:
 * прохання видалити акаунт).
 *
 * > **Last validated:** 2026-09-20. **Status:** Active
 *
 * ЧОМУ цей файл існує. До появи 30-денного вікна видалення йшло живим
 * шляхом `POST /api/auth/delete-user`, і пароль звіряв сам Better Auth.
 * Той шлях довелось вимкнути: після свого `beforeDelete` Better Auth
 * БЕЗУМОВНО виконує `internalAdapter.deleteUser`, тобто вікно на ньому
 * нездійсненне в принципі (`node_modules/better-auth/dist/api/routes/
 * update-user.mjs`, рядки навколо виклику `beforeDelete`). Видалення
 * переїхало на власний `DELETE /api/me`, і разом із ним сюди переїхала
 * планка, яку Better Auth тримав: знання пароля.
 *
 * Механіка повторює `checkPassword` самого Better Auth
 * (`dist/utils/password.mjs`): знайти `credential`-акаунт, узяти його
 * hash, звірити через той самий `password.verify` із контексту. Власного
 * хешування тут немає і не має бути.
 */

import { auth } from "../../auth.js";

export type PasswordCheck =
  /** Пароль звірено, або його в акаунта немає (лише OAuth-вхід). */
  | { ok: true }
  /** Пароль є, але переданий не збігся (або його не передали зовсім). */
  | { ok: false; reason: "invalid_password" };

/**
 * `password` не передали і в акаунта є credential-вхід -> `invalid_password`:
 * мовчазний пропуск зробив би перевірку декоративною.
 *
 * Акаунт без credential-входу (зайшов через Google) пароля не має взагалі,
 * тож звіряти нічого; такі акаунти захищає вимога свіжої сесії на роуті.
 * Це та сама розвилка, яку робить і Better Auth.
 */
export async function verifyAccountPassword(
  userId: string,
  password: string | undefined,
): Promise<PasswordCheck> {
  const ctx = await auth.$context;
  const accounts = await ctx.internalAdapter.findAccounts(userId);
  const credential = accounts?.find(
    (account) => account.providerId === "credential",
  );
  const hash = credential?.password;

  if (!credential || !hash) return { ok: true };
  if (!password) return { ok: false, reason: "invalid_password" };

  const matches = await ctx.password.verify({ hash, password });
  return matches ? { ok: true } : { ok: false, reason: "invalid_password" };
}
