import crypto from "node:crypto";

import { FTUX_DRIP_CAMPAIGN_FAMILY } from "./ftuxDripCopy.js";

/**
 * HMAC-підписаний токен для public unsubscribe-link-ів у footer-ах
 * FTUX-drip-листів. Перевірка токена не вимагає сесії й не торкається
 * `email_unsubscribes` — це public route, тож ми не маємо authenticated
 * user-а у момент кліка.
 *
 * Формат: `<userId>.<hmac>`, де
 *   hmac = HMAC-SHA256(secret, `unsub:v1|${family}|${userId}`).slice(0,64)
 *
 * Простір ключів — 256 біт, truncated до 256 hex символів. Brute-force
 * нерелевантний; тампер-resistant без БД lookup-у.
 *
 * Версія `v1` у payload-і дозволяє ввести нову схему без поломок старих
 * листів, які все ще можуть прилітати у inbox-и через 3-7 днів. Verifier
 * далі перевіряє лише поточну версію — старі токени просто перестануть
 * валідуватись (опційно: paint-grace-window майбутньою рев'ю).
 *
 * Чому окремо від `auth.ts` HMAC-патернів: secret той самий
 * (`BETTER_AUTH_SECRET`), але scope різний (auth-cookies vs
 * marketing-unsubscribe). Розділення дає змогу дешево rotate-ити один з
 * них без зачіпання іншого, плюс не змішує public-side payload-и з
 * authenticated-side state-ом.
 */

const TOKEN_VERSION = "v1";

function getUnsubscribeSecret(): string | null {
  const secret = process.env.BETTER_AUTH_SECRET?.trim();
  if (!secret) return null;
  return secret;
}

function payloadFor(userId: string, family: string): string {
  return `unsub:${TOKEN_VERSION}|${family}|${userId}`;
}

function computeHmacHex(secret: string, payload: string): string {
  return crypto
    .createHmac("sha256", secret)
    .update(payload, "utf8")
    .digest("hex");
}

/**
 * Згенерувати unsubscribe-token. Повертає `null`, якщо `BETTER_AUTH_SECRET`
 * відсутній — caller має пропустити footer-link, не рендерити broken-link.
 */
export function signUnsubscribeToken(args: {
  userId: string;
  family?: string;
}): string | null {
  const secret = getUnsubscribeSecret();
  if (!secret) return null;
  if (!args.userId || typeof args.userId !== "string") return null;
  const family = args.family ?? FTUX_DRIP_CAMPAIGN_FAMILY;
  const payload = payloadFor(args.userId, family);
  const hmac = computeHmacHex(secret, payload);
  return `${args.userId}.${hmac}`;
}

export type UnsubscribeVerifyResult =
  | {
      ok: true;
      userId: string;
      family: string;
    }
  | {
      ok: false;
      reason: "missing_secret" | "malformed" | "invalid_signature";
    };

/**
 * Constant-time перевірка токена. Якщо `secret` відсутній (dev без env-ів)
 * → `missing_secret` — caller повертає 503, щоб не приймати fake-кліки за
 * валідний opt-out.
 *
 * Чому `timingSafeEqual` замість `===`: payload-у `userId.<hmac>` достатньо
 * щоб атакер міряв CPU branch на байтах HMAC і відновлював його byte-by-byte.
 * `timingSafeEqual` фіксує час порівняння для будь-якої пари однакової
 * довжини, тому такий side-channel atak зникає.
 */
export function verifyUnsubscribeToken(
  rawToken: string,
  options: { family?: string } = {},
): UnsubscribeVerifyResult {
  const secret = getUnsubscribeSecret();
  if (!secret) {
    return { ok: false, reason: "missing_secret" };
  }

  const family = options.family ?? FTUX_DRIP_CAMPAIGN_FAMILY;

  if (typeof rawToken !== "string" || rawToken.length === 0) {
    return { ok: false, reason: "malformed" };
  }

  const dot = rawToken.indexOf(".");
  if (dot <= 0 || dot === rawToken.length - 1) {
    return { ok: false, reason: "malformed" };
  }

  const userId = rawToken.slice(0, dot);
  const provided = rawToken.slice(dot + 1);

  // HMAC має бути hex 64 chars (sha256). Якщо щось інакше — навіть
  // не намагаємося порівнювати — це і так fail, але без leak-у часу.
  if (provided.length !== 64 || !/^[0-9a-f]+$/i.test(provided)) {
    return { ok: false, reason: "malformed" };
  }

  const expected = computeHmacHex(secret, payloadFor(userId, family));
  // Безпечне string-порівняння через `Buffer` однакової довжини.
  const a = Buffer.from(provided.toLowerCase(), "hex");
  const b = Buffer.from(expected, "hex");
  if (a.length !== b.length) {
    return { ok: false, reason: "invalid_signature" };
  }
  if (!crypto.timingSafeEqual(a, b)) {
    return { ok: false, reason: "invalid_signature" };
  }

  return { ok: true, userId, family };
}

/**
 * Будує абсолютну public URL для unsubscribe-кліка. Caller передає
 * `appUrl` — base URL фронта/API без trailing slash.
 *
 * Чому шлях `/api/email/unsubscribe` (а не `/email/unsubscribe`):
 * - express-маршрутизатор уже expose-ить `/api/*` без auth-middleware,
 *   а `/email/*` довелось би явно whitelist-ити у CORS / CSRF-flow.
 * - `/api/internal/email/*` — m2m-only (Bearer INTERNAL_API_KEY); цей
 *   роут — public, тому НЕ під `/api/internal/`.
 */
export function buildUnsubscribeUrl(args: {
  appUrl: string;
  token: string;
}): string {
  const trimmed = args.appUrl.replace(/\/+$/, "");
  return `${trimmed}/api/email/unsubscribe?u=${encodeURIComponent(args.token)}`;
}
