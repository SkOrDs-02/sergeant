import type { Request, RequestHandler } from "express";

import { env } from "../env.js";
import { chatViaOpenRouter } from "../env/chatModels.js";

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

/**
 * Guard для `/api/chat` — вимагає ключ ТОГО транспорту, яким піде запит.
 *
 * Чому окремо від `requireAnthropicKey()`. Чат ходить сирим транспортом
 * (`lib/anthropic.ts::anthropicMessagesStream`), а той обирає адресу в
 * `pickTransport()`: при активному шлюзі — `OPENROUTER_URL` з
 * `Bearer ${env.OPENROUTER_API_KEY}`, і переданий `apiKey` там **не
 * використовується взагалі**. Ланцюжка фолбеку в сирому транспорті немає —
 * `FallbackProvider` живе у `lib/llm/provider.ts`, яким чат не користується.
 *
 * Через це `requireAnthropicKey()` на чаті давав 503 `ANTHROPIC_KEY_MISSING`
 * навіть у повністю OpenRouter-івській конфігурації (дефолтній:
 * `CHAT_VIA_OPENROUTER=true`), тобто блокував чат через відсутність
 * креденшела, якого той запит не торкнеться. Рівно те, що описує коментар
 * у `chatModels.ts`: рішення про модель і про транспорт мають одне джерело
 * істини — тепер і рішення про потрібний ключ теж.
 *
 * `chatViaOpenRouter()` уже включає перевірку наявності `OPENROUTER_API_KEY`
 * у сам предикат, тож якщо він true — ключ шлюзу гарантовано є, і питати
 * більше нема про що. Anthropic-ключ лишається потрібним рівно тоді, коли
 * шлюз вимкнено (або його ключа немає) і `pickTransport` піде на
 * `api.anthropic.com` з `x-api-key`.
 *
 * `req.anthropicKey` виставляємо в обох випадках: під шлюзом він порожній і
 * ігнорується, а тримати одну форму запиту простіше, ніж дві.
 */
export function requireChatUpstreamKey(): RequestHandler {
  return (req, res, next) => {
    if (!chatViaOpenRouter() && !env.ANTHROPIC_API_KEY) {
      res.status(503).json({
        error: "AI-помічник тимчасово недоступний. Спробуй пізніше.",
        code: "ANTHROPIC_KEY_MISSING",
      });
      return;
    }
    (req as WithAnthropicKey).anthropicKey = env.ANTHROPIC_API_KEY;
    next();
  };
}
