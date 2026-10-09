import crypto from "node:crypto";
import type { CookieOptions, Request, Response } from "express";

/**
 * Прив'язка OAuth `state` до браузера, що почав потік (RFC 9700 § 4.7,
 * sec-15 аудиту 2026-10-01).
 *
 * Проблема: `/api/silpo/callback` стоїть без сесії, а власника токенів бере
 * лише з `silpo_oauth_state.user_id`. Зловмисник міг зняти з `Location` свого
 * `/connect` готовий authorize-URL і переслати жертві: після згоди жертви в
 * Сільпо її токени лягали б на акаунт зловмисника. Кука нижче цього не
 * дозволяє: вона ставиться лише тому браузеру, який зробив `/connect`, і
 * зловмисник не може підкласти її в браузер жертви.
 *
 * У куку кладемо `sha256(state)` у base64url, а не сам `state`: значення
 * `state` це bearer-секрет flow (він ще й летить через URL).
 *
 * Без міграції і без нового екрана: кука `HttpOnly`, `SameSite=Lax` (повернення
 * з auth.silpo.ua це top-level GET, тож Lax кука їде), `Path` звужений до
 * callback-а, TTL збігається з TTL `silpo_oauth_state` (10 хв).
 */

export const SILPO_OAUTH_BINDING_COOKIE = "silpo_oauth_binding";
const BINDING_PATH = "/api/silpo/callback";
const BINDING_MAX_AGE_MS = 10 * 60 * 1000;

export function hashStateForBinding(state: string): string {
  return crypto.createHash("sha256").update(state).digest("base64url");
}

function cookieOptions(secure: boolean): CookieOptions {
  return { httpOnly: true, secure, sameSite: "lax", path: BINDING_PATH };
}

/** Ставить куку-прив'язку на відповіді `/connect`. `secure` — коли callback-URL https (у проді завжди). */
export function setOAuthBindingCookie(
  res: Response,
  state: string,
  secure: boolean,
): void {
  res.cookie(SILPO_OAUTH_BINDING_COOKIE, hashStateForBinding(state), {
    ...cookieOptions(secure),
    maxAge: BINDING_MAX_AGE_MS,
  });
}

/** Прибирає куку (ті самі `path`/`secure`/`sameSite`, інакше браузер її не зітре). */
export function clearOAuthBindingCookie(res: Response, secure: boolean): void {
  res.clearCookie(SILPO_OAUTH_BINDING_COOKIE, cookieOptions(secure));
}

/**
 * Мінімальний розбір заголовка `Cookie` (`cookie-parser` у сервері немає).
 * Повертає значення першої куки з таким іменем або `null`.
 */
export function readCookie(req: Request, name: string): string | null {
  const header = req.headers.cookie;
  if (!header) return null;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() !== name) continue;
    const raw = part.slice(eq + 1).trim();
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  }
  return null;
}

/** `true`, лише якщо кука-прив'язка є і дорівнює `sha256(state)` (timing-safe). */
export function verifyOAuthBinding(req: Request, state: string): boolean {
  const cookie = readCookie(req, SILPO_OAUTH_BINDING_COOKIE);
  if (!cookie) return false;
  const expected = Buffer.from(hashStateForBinding(state));
  const actual = Buffer.from(cookie);
  return (
    actual.length === expected.length &&
    crypto.timingSafeEqual(actual, expected)
  );
}
