import type { Request, RequestHandler } from "express";

/**
 * H6 — sensitive-action gate. Має бути ПІСЛЯ `requireSession()` у ланцюгу
 * middleware, бо читає `req.user` (resolved Better Auth-ом). Якщо
 * `req.user.emailVerified !== true` — повертаємо 403 з code
 * `EMAIL_VERIFICATION_REQUIRED`, фронт показує банер "Підтвердіть email,
 * щоб під'єднати банк".
 *
 * Чому окремий middleware, а не inline-чек у handler-і `connectHandler`:
 *   - threat model H6 каже про **кожний** sensitive flow (Mono connect,
 *     password change, OpenClaw link, push subscribe). Нанизуємо однаковий
 *     middleware замість дубльованих if-ів — додавання нової поверхні
 *     (PR-13/Telegram/etc) — це один рядок у router-і.
 *   - помилка в handler-і потенційно після side-effects (Mono client-info
 *     fetch, шифрування токена); middleware відсіює ДО них.
 *
 * Не плутати з `requireSession()`:
 *   - `requireSession()` → 401 "не залогінений" (UNAUTHORIZED)
 *   - `requireVerifiedEmail()` → 403 "залогінений, але email не
 *     підтверджений" (EMAIL_VERIFICATION_REQUIRED)
 *
 * Дивись `docs/security/hardening/H6-email-verification.md` (Implementation
 * log) — список endpoint-ів, на які middleware ще треба нанизати.
 */
type AuthedRequest = Request & {
  user?: { id?: string; emailVerified?: boolean };
};

export function requireVerifiedEmail(): RequestHandler {
  return (req, res, next) => {
    const user = (req as AuthedRequest).user;
    if (!user) {
      // Структурно це не повинно статись — у каскаді
      // `requireSession() → requireVerifiedEmail()` `req.user` вже точно
      // є. Дублюємо 401 на випадок, якщо хтось забуде попередній
      // middleware (та і взагалі сюди не буде попадати без сесії).
      res
        .status(401)
        .json({ error: "Потрібна автентифікація", code: "UNAUTHORIZED" });
      return;
    }
    if (user.emailVerified !== true) {
      res.status(403).json({
        error:
          "Підтвердьте email, щоб виконати цю дію. Лист надіслано на адресу при реєстрації.",
        code: "EMAIL_VERIFICATION_REQUIRED",
      });
      return;
    }
    next();
  };
}
