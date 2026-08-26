import { z } from "zod";

/**
 * Маршрутизація AI-викликів: який шлюз, яка модель, куди відкочуватись.
 *
 * WHY окремий модуль. `env.ts` перетнув стелю Hard Rule #18 (600 рядків коду),
 * і саме цей блок ріс найшвидше — кожен новий шлях додає пару «провайдер +
 * модель». Тримати їх разом заодно корисно: розійшовшись, `LLM_*_PROVIDER` і
 * `OPENROUTER_*_MODEL` дають шлюзу id, якого він не знає, і кожен запит падає
 * з 404. Тут вони видно поруч.
 *
 * Форма (`shape`), а не окрема схема: `envSchema` лишається одним zod-обʼєктом,
 * інакше `parseEnv()` довелося б зшивати два результати й помилки валідації
 * розповзлися б на два повідомлення.
 */

const stringWithDefault = (defaultValue: string) =>
  z
    .string()
    .optional()
    .transform((v) => v ?? defaultValue);

const llmProviderEnum = (d: "anthropic" | "openrouter" | "stub") =>
  z.enum(["anthropic", "openrouter", "stub"]).default(d);

export const aiRoutingEnvShape = {
  OPENROUTER_API_KEY: stringWithDefault(""),

  /** Глобальний override id; порожній — шлях бере власну змінну нижче. */
  OPENROUTER_MODEL: stringWithDefault(""),

  OPENROUTER_READONLY_MODEL: stringWithDefault("google/gemini-2.5-flash-lite"),
  OPENROUTER_DIGEST_MODEL: stringWithDefault("google/gemini-2.5-flash-lite"),
  /**
   * `anthropic/claude-sonnet-4.6`, НЕ `openai/gpt-5.1` (стояло тут до
   * 2026-08-25 — B37). Це другий source of truth для тієї самої моделі:
   * тир-таблиця `modules/chat/aiQuotaTierModels.ts::PRO_TIER_MODEL.premium.coach`
   * читає `OPENROUTER_COACH_MODEL` через `envStr()` з ХАРДКОДНИМ fallback-ом
   * `anthropic/claude-sonnet-4.6` — свідомо переозначеним 2026-08-07 за
   * фактом 12-денного проду: 9 із 10 викликів коуча з `openai/gpt-5.1`
   * мовчки обслуговував Anthropic-фолбек (`FallbackProvider`), бо
   * reasoning-токени gpt-5.1 зʼїдали 20-секундний timeout у `coach.ts`.
   * Той сам gpt-5.1 фактично ніколи не відповідав напряму. Дефолт тут мав
   * лишитись зі старою моделлю — будь-який шлях, що читає
   * `env.OPENROUTER_COACH_MODEL` НАПРЯМУ (в обхід тир-таблиці), досі
   * отримував модель, доведену непрацездатною в проді. Тепер обидва шляхи
   * узгоджені.
   *
   * Відкрите продуктове питання (НЕ причина міняти тир-таблицю тут —
   * рішення власника): живий замір 2026-08-25 показав gpt-5.1 11/12 за
   * $2.82/1k, тоді як стандартний тир `google/gemini-2.5-flash-lite`
   * дав 12/12 за $0.174/1k — тобто дешевша модель у 16 разів і не гірша
   * за якістю. Якщо це підтвердиться, кандидат на premium-заміну —
   * gemini-flash-lite, не gpt-5.1.
   */
  OPENROUTER_COACH_MODEL: stringWithDefault("anthropic/claude-sonnet-4.6"),
  OPENROUTER_NUTRITION_MODEL: stringWithDefault("google/gemini-2.5-flash-lite"),
  OPENROUTER_MONO_MODEL: stringWithDefault("google/gemini-2.5-flash-lite"),

  /**
   * `POST /api/finyk/receipts/analyze` (чек-скан v1, vision-fallback без
   * QR — `docs/90-work/planning/specs/receipt-scan.md`). Той самий
   * Flash-Lite, що вже дефолт для nutrition/mono — 10/10 на пастках
   * зорового стенду за копійки/чек (спека § Вартість).
   */
  OPENROUTER_RECEIPT_MODEL: stringWithDefault("google/gemini-2.5-flash-lite"),

  /**
   * Модель зору під шлюзом. `gemini-2.5-flash-lite` — 10/10 на пастках
   * зорового стенду (розмите фото, порожній кадр, етикетка іноземною,
   * перерахунок порції) за $0.13/1k і 1.3 с. Новіші `gemini-3.1/3.5-flash-lite`
   * дали 7/10: не читають обʼєм з етикетки й недораховують порцію.
   */
  OPENROUTER_VISION_MODEL: stringWithDefault("google/gemini-2.5-flash-lite"),

  LLM_PROVIDER: llmProviderEnum("anthropic"),
  LLM_READONLY_PROVIDER: llmProviderEnum("openrouter"),
  LLM_DIGEST_PROVIDER: llmProviderEnum("openrouter"),
  LLM_COACH_PROVIDER: llmProviderEnum("openrouter"),
  LLM_NUTRITION_PROVIDER: llmProviderEnum("openrouter"),
  LLM_MONO_PROVIDER: llmProviderEnum("openrouter"),
  /**
   * Провайдер для `POST /api/finyk/receipts/analyze`. `openrouter`
   * (дефолт) маршрутизує крізь `anthropicMessages({allowOpenRouter:true})`
   * — той самий транспорт, що nutrition analyze-photo, лише інша
   * env-пара моделі/провайдера (`modules/finyk/receipts/visionTransport.ts`).
   * `stub` — без мережі взагалі (тести/dev без ключів).
   */
  LLM_RECEIPT_PROVIDER: llmProviderEnum("openrouter"),

  LLM_FALLBACK_ENABLED: boolFromEnvLocal(true),
  LLM_DIGEST_FALLBACK_ON_ERROR: boolFromEnvLocal(true),

  /**
   * Зорові шляхи (`analyze-photo`, `refine-photo`) через OpenRouter.
   *
   * WHY окремий прапорець від `CHAT_VIA_OPENROUTER`: ці два ендпоінти НЕ
   * ходять через `getLLMProvider()` — їм потрібен `image`-блок у тілі, тож
   * вони кличуть `anthropicMessages` напряму й `LLM_NUTRITION_PROVIDER` їх
   * не стосується. Спільний із чатом прапорець зробив би відкат одного
   * відкатом обох, а це різні за ризиком поверхні.
   *
   * Дефолт `true` з 2026-08-05; виміри й умова відкату — у
   * `modules/nutrition/visionTransport.ts`.
   */
  VISION_VIA_OPENROUTER: boolFromEnvLocal(true),
};

function boolFromEnvLocal(defaultValue: boolean) {
  return z
    .string()
    .optional()
    .transform((v) => {
      if (v === undefined) return defaultValue;
      const lower = v.toLowerCase();
      if (lower === "true" || lower === "1") return true;
      if (lower === "false" || lower === "0") return false;
      return defaultValue;
    });
}
