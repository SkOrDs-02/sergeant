import type { Express, Request, RequestHandler } from "express";

import { BODY_SIZE_POLICY } from "./bodySizePolicy.js";
import { apiCorsMiddleware } from "./apiCors.js";
import { rateLimitExpress } from "./rateLimit.js";

/**
 * B28 (знахідка AIP-20260805-B28): body-парсери стоять ДО `requireSession`,
 * тож анонімний запит на AI/фото-роут буферизував до 10 MB, перш ніж
 * отримати 401 або потрапити під rate limit. Цей guard mount-иться
 * ПЕРЕД `applyBodySizePolicy()` і для префіксів з `requireCredentials: true`
 * відсікає запит ще до читання тіла:
 *
 *   1. Метод без тіла (GET/HEAD/OPTIONS) — пропускаємо (preflight і читання
 *      обробляють далі CORS/роутери, тіла там нема).
 *   2. Немає ні `Authorization: Bearer …`, ні session-cookie Better Auth —
 *      401 у тій самій формі, що й `requireSession()`.
 *   3. Облікові дані формально є — спільний per-IP ліміт `api:preparse:ip`,
 *      щоб підроблена кука не давала необмежений потік 10 MB-тіл.
 *
 * Перевірка наявності навмисно дешева: справжня валідація сесії лишається в
 * `requireSession()` на роутері.
 */

const BODY_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

// Better Auth: `better-auth.session_token`, у проді з префіксом `__Secure-`.
const SESSION_COOKIE_RE =
  /(?:^|[;\s])(?:__Secure-)?better-auth\.session_token=/;

/** Чи є в запиті хоч якісь облікові дані сесії (без валідації). */
export function hasSessionCredentials(req: Request): boolean {
  const auth = req.headers.authorization;
  if (typeof auth === "string" && /^Bearer\s+\S/i.test(auth)) return true;
  const cookie = req.headers.cookie;
  return typeof cookie === "string" && SESSION_COOKIE_RE.test(cookie);
}

/** Спільний per-IP бакет для всіх large-body роутів (після presence-check). */
export const PRE_PARSE_IP_LIMIT = { limit: 600, windowMs: 60_000 } as const;

export function createPreParseAuthGuard(
  limiter: RequestHandler = rateLimitExpress({
    key: "api:preparse:ip",
    ...PRE_PARSE_IP_LIMIT,
  }),
): RequestHandler {
  const cors = apiCorsMiddleware();
  return (req, res, next) => {
    if (!BODY_METHODS.has(req.method)) {
      next();
      return;
    }
    if (hasSessionCredentials(req)) {
      limiter(req, res, next);
      return;
    }
    // 401 віддаємо ДО `apiCorsMiddleware` з app.ts, тож CORS-заголовки
    // ставимо самі — інакше крос-оригін клієнт побачить network error.
    cors(req, res, () => {
      res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
      res.status(401).json({
        error: "Потрібна автентифікація",
        message: "Потрібна автентифікація",
        code: "UNAUTHORIZED",
        // `requestIdMiddleware` стоїть у app.ts раніше за цей гейт, тож id є
        // і 401 несе його, як відповідь errorHandler (гейт
        // check-inline-error-responses).
        requestId: (req as Request & { requestId?: string }).requestId,
      });
    });
  };
}

export function applyPreParseAuthGuard(
  app: Express,
  guard: RequestHandler = createPreParseAuthGuard(),
): void {
  for (const rule of BODY_SIZE_POLICY) {
    if (rule.kind === "urlencoded" || !rule.requireCredentials) continue;
    app.use(rule.pathPrefix, guard);
  }
}
