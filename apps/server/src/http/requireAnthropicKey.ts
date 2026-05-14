import type { Request, RequestHandler } from "express";

import { env } from "../env.js";

type WithAnthropicKey = Request & { anthropicKey?: string };

/**
 * Guard для ендпоінтів, що викликають Anthropic. Читає `env.ANTHROPIC_API_KEY`,
 * кладе у `req.anthropicKey`, або віддає 503 якщо ключ не сконфігурований.
 *
 * Заміняє повторення `if (!env.ANTHROPIC_API_KEY) return 500…` у
 * 11 handler-ах. 503 точніше 500: це не внутрішня помилка, а проблема
 * конфігурації деплою.
 *
 * AI-CONTEXT: `env.ANTHROPIC_API_KEY` парситься один раз при бутстрапі
 * (`apps/server/src/env/env.ts`). Тести, що хочуть «вимкнути» ключ для
 * 503-сценаріїв, мають використовувати канонічний pattern із
 * `apps/server/src/auth.test.ts` — `vi.stubEnv("ANTHROPIC_API_KEY", "")` +
 * `vi.resetModules()` + динамічний `import()`, бо `env` уже міг бути
 * прочитаний раніше і зафіксований у топ-level конст.
 */
export function requireAnthropicKey(): RequestHandler {
  return (req, res, next) => {
    const key = env.ANTHROPIC_API_KEY;
    if (!key) {
      // Не світимо назву env-змінної клієнту: вона потрапляє у formatApiError
      // і показується юзеру дослівно. Дискримінатор для frontend — `code`.
      res.status(503).json({
        error: "AI-помічник тимчасово недоступний. Спробуй пізніше.",
        code: "ANTHROPIC_KEY_MISSING",
      });
      return;
    }
    (req as WithAnthropicKey).anthropicKey = key;
    next();
  };
}
