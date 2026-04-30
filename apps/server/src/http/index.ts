/**
 * Barrel-module — єдина точка імпорту HTTP-інфраструктури для `server/app.js`,
 * доменних роутерів (`server/routes/*`) і тестів. Реалізації розбито по
 * доменних файлах у цій теці; якщо треба додати новий middleware — клади його
 * у відповідний файл і ре-експортуй тут.
 */
export { requestIdMiddleware } from "./requestId.js";
export { requestLogMiddleware } from "./requestLog.js";
export { withRequestContext } from "../obs/requestContext.js";

export { buildApiCspDirectives, apiHelmetMiddleware } from "./security.js";

export {
  authSensitiveRateLimit,
  authMetricsMiddleware,
} from "./authMiddleware.js";

export {
  livezHandler,
  createReadyzHandler,
  createHealthzHandler,
} from "./health.js";

export { errorHandler } from "./errorHandler.js";

// CORS / rate-limit / validation / schemas / json-extract — перенесено сюди
// з історичної `server/api/lib/` у PR 1 (#236); реекспортимо з одного місця.
export { setCorsHeaders, getAllowedOrigins, isOriginAllowed } from "./cors.js";
export { apiCorsMiddleware } from "./apiCors.js";
export {
  checkRateLimit,
  getIp,
  rateLimitExpress,
  rateLimitSubject,
} from "./rateLimit.js";
export { validateBody, validateQuery } from "./validate.js";
export { extractJsonFromText } from "./jsonSafe.js";
export * as schemas from "./schemas.js";

// Нові middleware для доменних роутерів (PR 1 додає файли; PR 3 почне
// використовувати їх замість per-handler boilerplate).
export { asyncHandler } from "./asyncHandler.js";
export { setModule } from "./setModule.js";
export { requireSession, requireSessionSoft } from "./requireSession.js";
export { requireApiSecret } from "./requireApiSecret.js";
export { safeStringEqual } from "./safeCompare.js";
export { requireAnthropicKey } from "./requireAnthropicKey.js";
export { requireGroqKey } from "./requireGroqKey.js";
export { requireAiQuota } from "./requireAiQuota.js";
export { requestTimeout } from "./timeout.js";
export { createCompressionMiddleware } from "./compression.js";
