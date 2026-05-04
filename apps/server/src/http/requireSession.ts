import type { Request, RequestHandler, Response } from "express";
import { getSessionUser } from "../auth.js";

type SessionUser = Awaited<ReturnType<typeof getSessionUser>>;
type AuthedRequest = Request & { user?: NonNullable<SessionUser> };

/**
 * H8 hardening: closes the login-state oracle on session-protected
 * endpoints. The global helmet config in `apiHelmetMiddleware` keeps
 * `Cross-Origin-Resource-Policy: cross-origin` (so the SPA on Vercel can
 * fetch the API), which means an attacker page on `evil.example` can
 * embed `<img src="https://api.../api/me">` and observe whether the
 * visitor is authenticated via `onload` / `onerror`. By overriding the
 * header to `same-origin` *for every response* served by a
 * `requireSession*` route — including 401s — we let the browser block
 * the resource regardless of body, killing both the oracle and the
 * future-framing risk described in the H8 hardening card.
 *
 * Public cross-origin endpoints (`/healthz`, `/api/metrics/web-vitals`,
 * `/api/csp-report`, OAuth callbacks under `/api/auth/*`) do not pass
 * through `requireSession*`, so they keep the helmet default. See
 * `docs/security/hardening/H8-corp-per-route.md`.
 */
function setSameOriginCorp(res: Response): void {
  res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
}

/**
 * Router-level auth-middleware. Резолвить Better Auth сесію, кладе юзера в
 * `req.user` і кличе `next()`. Якщо сесії немає — 401; якщо lookup впав
 * (наприклад, тимчасовий недоступ БД) — передаємо помилку далі у error-
 * handler (500), бо для звичайних endpoint-ів фронту важливо відрізняти
 * "ти не залогінений" від "у нас щас все горить".
 *
 * Для endpoint-ів, де фронт історично трактує будь-яку невдачу auth як
 * "не залогінений" (push subscribe/unsubscribe — сервіс-воркер не має
 * падати у 500 при тимчасовому збої), використовуй `requireSessionSoft()`.
 *
 * Цей middleware також override-ить `Cross-Origin-Resource-Policy` на
 * `same-origin` перед резолвом сесії — закриває login-state oracle і
 * embedding-атаки з cross-origin (закриває hardening-карту H8,
 * `docs/security/hardening/H8-corp-per-route.md`).
 */
export function requireSession(): RequestHandler {
  return async (req, res, next) => {
    setSameOriginCorp(res);
    try {
      const user = await getSessionUser(req);
      if (!user) {
        res
          .status(401)
          .json({ error: "Потрібна автентифікація", code: "UNAUTHORIZED" });
        return;
      }
      (req as AuthedRequest).user = user;
      next();
    } catch (err) {
      next(err);
    }
  };
}

/**
 * Як `requireSession()`, але ковтає будь-яку exception з `getSessionUser`
 * і мапить її у 401 замість 500. Потрібно для endpoint-ів, де фронт
 * обробляє "не залогінений" значно коректніше за "server error" —
 * насамперед push subscribe/unsubscribe, які смикає сервіс-воркер і де
 * історично був явний try/catch-to-401 у handler-і (pre-PR-4).
 *
 * Так само override-ить CORP на `same-origin` (див. коментар у
 * `requireSession`).
 */
export function requireSessionSoft(): RequestHandler {
  return async (req, res, next) => {
    setSameOriginCorp(res);
    let user: SessionUser = null;
    try {
      user = await getSessionUser(req);
    } catch {
      // swallow — transient auth/DB failure treated as "not logged in".
    }
    if (!user) {
      res
        .status(401)
        .json({ error: "Потрібна автентифікація", code: "UNAUTHORIZED" });
      return;
    }
    (req as AuthedRequest).user = user;
    next();
  };
}
