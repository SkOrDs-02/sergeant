import type { Request, RequestHandler } from "express";

import { env } from "../env.js";
import { chatViaOpenRouter } from "../env/chatModels.js";
import { visionViaOpenRouter } from "../modules/nutrition/visionTransport.js";

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

/**
 * Шляхи AI, чий транспорт визначається окремою env-змінною.
 *
 * `vision` стоїть окремо, бо це ЄДИНИЙ із них, хто ходить сирим
 * `anthropicMessages()` замість `getLLMProvider()` — тож і питання про ключ
 * у нього інше (див. нижче).
 */
export type LlmPath = "coach" | "digest" | "nutrition" | "vision";

/**
 * Guard для AI-роутів поза чатом: `coach/insight`, `weekly-digest` і
 * нутриція (текстова + зорова).
 *
 * ЧОМУ НЕ `requireAnthropicKey()`. Той питає «чи існує Anthropic-ключ» —
 * питання, яке в дефолтній конфігурації не має стосунку до справи. Дефолти
 * (`env/aiRoutingEnv.ts`): `LLM_COACH_PROVIDER`, `LLM_DIGEST_PROVIDER`,
 * `LLM_NUTRITION_PROVIDER` = `openrouter`, `VISION_VIA_OPENROUTER` = true.
 * Тобто ВСІ чотири шляхи типово ходять шлюзом, і Anthropic-ключ їм або
 * потрібен лише як фолбек, або не потрібен узагалі. Та сама хвороба, що
 * була в чаті (знахідка B31) — просто виявлена в решті роутів під час
 * перевірки, чи баг одиничний. Не одиничний.
 *
 * Дві різні механіки, тому дві гілки:
 *
 * 1. **`vision`** (`analyze-photo`, `refine-photo`) — сирий транспорт.
 *    `pickTransport()` у гілці шлюзу авторизується `Bearer
 *    ${OPENROUTER_API_KEY}` і переданий `apiKey` НЕ ЧИТАЄ взагалі. Отже
 *    під шлюзом Anthropic-ключ не потрібен буквально; без шлюзу —
 *    обовʼязковий, бо ланцюжка фолбеку в сирому транспорті немає.
 *
 * 2. **Решта** — `getLLMProvider()`, і тут важлива несподіванка. Він
 *    **fail-soft**: без потрібного ключа тихо повертає `StubProvider`
 *    (`lib/llm/provider.ts:678` і `:700-703`), тобто роут віддає
 *    ЗАГЛУШКУ з кодом 200. Це прод-двійник знахідки B44, де стенд видавав
 *    відсутність виклику за результат. Наслідок для гейта:
 *      - `provider=openrouter` без `OPENROUTER_API_KEY` → заглушка.
 *        `requireAnthropicKey()` цього не ловив ВЗАГАЛІ: за наявності
 *        Anthropic-ключа він пускав запит далі, і користувач отримував
 *        stub-текст як відповідь коуча.
 *      - `provider=anthropic` без `ANTHROPIC_API_KEY` → теж заглушка;
 *        тут старий гейт випадково рятував, і цю поведінку зберігаємо.
 *    Anthropic-ключ під `provider=openrouter` лишається бажаним (він
 *    вмикає `FallbackProvider`), але його відсутність шлях не ламає —
 *    просто знімає запасний варіант. 503 через це — зайвий.
 *
 * `provider=stub` пропускаємо свідомо: це явний вибір у конфізі
 * (dev/preview), а не наслідок забутого ключа.
 */
export function requireLlmUpstream(path: LlmPath): RequestHandler {
  return (req, res, next) => {
    const reachable =
      path === "vision" ? visionUpstreamReady() : providerUpstreamReady(path);
    if (!reachable) {
      // Формулювання й `code` спільні з рештою гейтів: назву env-змінної
      // клієнту не світимо (вона їде у `formatApiError` дослівно).
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

/** Сирий транспорт: ключ рівно того шлюзу, який обере `pickTransport()`. */
function visionUpstreamReady(): boolean {
  // `visionViaOpenRouter()` уже включає перевірку `OPENROUTER_API_KEY`
  // у сам предикат — якщо true, ключ шлюзу гарантовано є.
  return visionViaOpenRouter() || Boolean(env.ANTHROPIC_API_KEY);
}

/** `getLLMProvider()`-шляхи: чи дотягнеться він до РЕАЛЬНОЇ моделі. */
function providerUpstreamReady(path: Exclude<LlmPath, "vision">): boolean {
  const provider =
    path === "coach"
      ? env.LLM_COACH_PROVIDER
      : path === "digest"
        ? env.LLM_DIGEST_PROVIDER
        : env.LLM_NUTRITION_PROVIDER;
  if (provider === "stub") return true;
  if (provider === "openrouter") return Boolean(env.OPENROUTER_API_KEY);
  return Boolean(env.ANTHROPIC_API_KEY);
}
