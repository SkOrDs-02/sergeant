import type { Request, Response } from "express";
import { env } from "../env/env.js";
import { logger } from "../obs/logger.js";
import { getWebAppOrigin } from "../auth/verificationMail.js";
import {
  consumeAuthorizationState,
  exchangeCode,
} from "../modules/silpo/oauth.js";
import {
  clearOAuthBindingCookie,
  verifyOAuthBinding,
} from "../modules/silpo/oauthBinding.js";
import { persistTokens, silpoKeyRing } from "../modules/silpo/tokenStore.js";
import {
  assertSilpoEnabled,
  type AuthedRequest,
} from "../modules/silpo/routeHelpers.js";

/**
 * `GET /api/silpo/callback` - друга половина OAuth authorization_code
 * round-trip. Винесено з `routes/silpo.ts` (Hard Rule #18, max-lines 600).
 *
 * Роут реєструється ДО router-level `requireSession()` (порядок реєстрації
 * і є механізмом), але з `optionalSession()`: сесія тут не вимагається, а
 * лише зчитується, якщо вона є на ЦЬОМУ хості.
 */

/** Маркер «вже перенаправлено на хост сесії»: другий relay заборонено (захист від циклу). */
const RELAY_MARKER = "silpo_relay";
const CALLBACK_PATH = "/api/silpo/callback";

export function callbackRedirectUri(): string | null {
  return env.PUBLIC_API_BASE_URL
    ? `${env.PUBLIC_API_BASE_URL}${CALLBACK_PATH}`
    : null;
}

/** Redirects the browser back to the web Settings page with a `?silpo=` status flag. Falls back to a JSON body when the web origin cannot be resolved (misconfigured deploy — see `getWebAppOrigin`). */
export function redirectToSettings(
  res: Response,
  status: "connected" | "error",
  reason?: string,
): void {
  const webOrigin = getWebAppOrigin();
  if (!webOrigin) {
    res.status(status === "connected" ? 200 : 400).json({ status, reason });
    return;
  }
  const url = new URL("/settings", webOrigin);
  url.searchParams.set("silpo", status);
  if (reason) url.searchParams.set("reason", reason);
  res.redirect(302, url.toString());
}

function str(v: unknown): string | undefined {
  return typeof v === "string" && v ? v : undefined;
}

/**
 * Колбек приземляється на PUBLIC_API_BASE_URL, а сесія (і кука-привʼязка)
 * живе на хості, через який користувач відкривав `/connect`. У проді це
 * веб-хост із Vercel-проксі `/api/*` (`apps/web/middleware.ts`), тобто ІНШИЙ
 * сайт: тут сесії немає ні в кого (інцидент 2026-08-25). Тож без сесії
 * робимо один relay на веб-origin з тим самим шляхом, де сесія й кука є.
 *
 * Relay нічого не споживає і не довіряє: передає лише `code`/`state`/`error`
 * (вони й так у URL), `redirect_uri` у Сільпо лишається зареєстрованим.
 */
function relayToSessionHost(req: Request, res: Response): boolean {
  const webOrigin = getWebAppOrigin();
  const redirectUri = callbackRedirectUri();
  if (!webOrigin || !redirectUri) return false;
  // Той самий origin: relay нічого не змінить, а лише зациклить.
  if (new URL(webOrigin).origin === new URL(redirectUri).origin) return false;

  const target = new URL(CALLBACK_PATH, webOrigin);
  for (const key of ["code", "state", "error"] as const) {
    const value = str(req.query[key]);
    if (value) target.searchParams.set(key, value);
  }
  target.searchParams.set(RELAY_MARKER, "1");
  res.redirect(302, target.toString());
  return true;
}

/**
 * Fail-loud для розбіжності топології: колбек добереться до сесії лише якщо
 * `/connect` відкрито через хост із `PUBLIC_API_BASE_URL` (сесія й кука на
 * ньому) або через веб-origin (`WEB_APP_URL`, куди веде relay). Інший хост
 * (напр. прямий `api.sergeant.com.ua`, коли redirect_uri вшито на sslip) дасть
 * `session_expired` усім - тож гучно логуємо на `/connect`, а не мовчимо.
 * Лише лог: заголовок хоста клієнтський, 503 за ним був би зайвим ризиком.
 */
export function warnIfConnectHostUnreachable(req: Request): void {
  const redirectUri = callbackRedirectUri();
  const webOrigin = getWebAppOrigin();
  if (!redirectUri || !webOrigin) return;
  const forwarded = req.get("x-forwarded-host")?.split(",")[0]?.trim();
  const host = (forwarded || req.get("host") || "").toLowerCase();
  if (!host) return;
  const allowed = [redirectUri, webOrigin].map((u) => new URL(u).host);
  if (allowed.includes(host)) return;
  logger.error({ msg: "silpo_connect_host_mismatch", host, allowed });
}

export async function callbackHandler(
  req: Request,
  res: Response,
): Promise<void> {
  if (!assertSilpoEnabled(res)) return;

  const sessionUserId = (req as AuthedRequest).user?.id;
  if (!sessionUserId) {
    // sec-15: без сесії власника токенів встановити неможливо. Або ми на
    // хості без сесії (api-домен): один relay туди, де вона є; або relay уже
    // був / сесії немає взагалі: жодних токенів, людина логіниться й пробує
    // ще раз.
    if (str(req.query[RELAY_MARKER]) !== "1" && relayToSessionHost(req, res)) {
      return;
    }
    logger.warn({ msg: "silpo_callback_session_missing" });
    redirectToSettings(res, "error", "session_expired");
    return;
  }

  const {
    code,
    state,
    error: oauthError,
  } = req.query as {
    code?: string;
    state?: string;
    error?: string;
  };

  if (oauthError) {
    redirectToSettings(res, "error", "denied");
    return;
  }
  if (
    !code ||
    typeof code !== "string" ||
    !state ||
    typeof state !== "string"
  ) {
    redirectToSettings(res, "error", "invalid_request");
    return;
  }

  // sec-15 (RFC 9700 § 4.7), шар 2: кука-привʼязка, ДО споживання state.
  // Вона є лише в браузері, що зробив `/connect`. Чужий state не споживаємо:
  // це не наш flow, і його власник завершить його сам.
  if (!verifyOAuthBinding(req, state)) {
    logger.warn({ msg: "silpo_callback_binding_mismatch" });
    redirectToSettings(res, "error", "invalid_state");
    return;
  }
  const secureCookie = callbackRedirectUri()?.startsWith("https://") ?? false;
  // Кука своє відслужила за будь-якого подальшого результату.
  clearOAuthBindingCookie(res, secureCookie);

  const pending = await consumeAuthorizationState(state);
  if (!pending) {
    // Unknown, expired or already-consumed state — the only hard gate here.
    redirectToSettings(res, "error", "invalid_state");
    return;
  }

  // sec-15, шар 1: власник токенів = користувач ПОТОЧНОЇ сесії, а не те, що
  // лежить у `state`. `state` видно в `Location` будь-якого `/connect`:
  // зловмисник під своєю сесією забирає свій authorize-URL і пересилає його
  // жертві (свіжий можна генерувати на льоту, TTL 10 хв не заважає). Жертва
  // погоджується на справжній сторінці Сільпо, і без звірки колбек обміняв би
  // ЇЇ `code` та поклав ЇЇ токени на userId зловмисника, який потім читає
  // чеки й керує кошиком жертви. Тобто підсунутий чужий `state` шкодить саме
  // жертві (колишній висновок «привʼяже до самого зловмисника, отже
  // нешкідливо» був хибним). Сесія жертви (або її відсутність) не збігається
  // зі `state` зловмисника: відмова, токени не зберігаються, `code` жертви не
  // обмінюється. Replay того самого state неможливий: він згорає одним
  // атомарним `DELETE ... RETURNING`.
  if (pending.userId !== sessionUserId) {
    logger.warn({ msg: "silpo_callback_session_mismatch" });
    redirectToSettings(res, "error", "invalid_state");
    return;
  }
  const userId = pending.userId;

  const ring = silpoKeyRing();
  if (!ring) {
    redirectToSettings(res, "error", "config_missing");
    return;
  }

  try {
    const tokens = await exchangeCode({
      code,
      codeVerifier: pending.codeVerifier,
      redirectUri: pending.redirectUri,
    });
    if (!tokens.refresh_token) {
      // Migration 123 has NOT NULL refresh_token_* columns — a code
      // exchange without one is unusable and must not be persisted.
      logger.warn({ msg: "silpo_callback_missing_refresh_token" });
      redirectToSettings(res, "error", "missing_refresh_token");
      return;
    }
    await persistTokens(userId, ring, {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAtMs: tokens.expires_in
        ? Date.now() + tokens.expires_in * 1000
        : null,
    });
    logger.info({ msg: "silpo.connected" });
    redirectToSettings(res, "connected");
  } catch (err) {
    logger.warn({
      msg: "silpo_callback_exchange_failed",
      err: err instanceof Error ? err.message : String(err),
    });
    redirectToSettings(res, "error", "exchange_failed");
  }
}
