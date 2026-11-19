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

/**
 * Допустима глибина міркувань першого ходу чату.
 *
 * Це `REASONING_EFFORTS` з `lib/llm/provider.ts` БЕЗ `minimal`. Перший хід
 * ходить на Anthropic-сумісний `/api/v1/messages` шлюзу, а там глибину задають
 * `output_config.effort` (`low | medium | high | xhigh | max`) і
 * `thinking: { type: "disabled" }` для `none`; значення `minimal` цей
 * ендпоінт не приймає взагалі. Перелік тут, а не імпортом із `provider.ts`:
 * той модуль читає `env`, і імпорт звідси дав би цикл. Розходження двох
 * переліків стереже `chatReasoning.test.ts`.
 */
export const CHAT_FIRST_TURN_REASONING_EFFORTS = [
  "none",
  "low",
  "medium",
  "high",
  "xhigh",
] as const;

export type ChatFirstTurnReasoningEffort =
  (typeof CHAT_FIRST_TURN_REASONING_EFFORTS)[number];

/**
 * Глибина першого ходу, коли змінна не задана. Один експорт на прод і стенди
 * (`tool-selection-eval.ts`, `stream-check.ts`): без `--reasoning` вони міряють
 * рівно те, що йде в прод.
 */
export const CHAT_FIRST_TURN_REASONING_EFFORT_DEFAULT: ChatFirstTurnReasoningEffort =
  "low";

/**
 * Чи дозволено шлюзу OpenRouter обирати постачальників, які зберігають
 * запити (і можуть на них тренуватись). Значення поля
 * `provider.data_collection` у тілі запиту; як саме воно стає полем —
 * `lib/llm/openrouterDataPolicy.ts`.
 */
export const OPENROUTER_DATA_COLLECTION_MODES = ["deny", "allow"] as const;

export type OpenRouterDataCollection =
  (typeof OPENROUTER_DATA_COLLECTION_MODES)[number];

/**
 * Нижня межа квантизації постачальників у OpenRouter: `fp8` — лише
 * ендпойнти від 8 біт (поле `provider.quantizations`), `off` — без фільтра.
 * Як значення стає полем — `lib/llm/openrouterDataPolicy.ts`.
 */
export const OPENROUTER_QUANTIZATION_FLOORS = ["fp8", "off"] as const;

export type OpenRouterQuantizationFloor =
  (typeof OPENROUTER_QUANTIZATION_FLOORS)[number];

export const aiRoutingEnvShape = {
  OPENROUTER_API_KEY: stringWithDefault(""),

  /**
   * Заборона збереження даних у OpenRouter (рішення власника 2026-11-19: у
   * запитах фінанси й дані про здоровʼя). Незадана або порожня — `deny`:
   * кожен запит у шлюз несе `provider.data_collection=deny`, тобто шлюз бере
   * лише постачальників, які дані не збирають. Обидва транспорти
   * (`/api/v1/messages` і `/api/v1/chat/completions`) і стенди евалу.
   *
   * `allow` — аварійний відкат без релізу: поле `provider` не шлеться
   * взагалі, шлюз знову обирає серед усіх постачальників моделі (поведінка до
   * 2026-11-19). Знадобиться, якщо модель лишиться без жодного ендпойнта під
   * `deny` (шлюз відповідає 404 «No endpoints found matching your data
   * policy», у лозі `openrouter_data_policy_no_endpoints`).
   *
   * Регістр і пробіли не важливі; будь-що поза переліком валить старт.
   * Прямого Anthropic, Groq і Voyage не стосується. Реєстр і умова зняття —
   * `docs/engineering/architecture/feature-flags.md` § 3.1.
   */
  OPENROUTER_DATA_COLLECTION: z.preprocess(
    (v) => (typeof v === "string" ? v.trim().toLowerCase() || undefined : v),
    z.enum(OPENROUTER_DATA_COLLECTION_MODES).default("deny"),
  ),

  /**
   * Квантизація постачальників не нижче 8 біт (рішення власника 2026-11-19:
   * на `relace/fp4` `deepseek/deepseek-v4-flash` давав російську в 16 з 37
   * відповідей, без 4-бітних — 0 з 79). Незадана або порожня — `fp8`: кожен
   * запит у шлюз несе `provider.quantizations` зі списком від 8 біт плюс
   * `unknown`. Обидва транспорти і стенди евалу.
   *
   * `off` — аварійний відкат без релізу: прибирає ЛИШЕ поле `quantizations`;
   * `data_collection` від нього не залежить (його відкат —
   * `OPENROUTER_DATA_COLLECTION`). Знадобиться, якщо модель лишиться без
   * жодного ендпойнта від 8 біт (шлюз відповідає 404 «No endpoints found for
   * the request with quantization», у лозі
   * `openrouter_data_policy_no_endpoints` з `reason: "quantization"`).
   *
   * Регістр і пробіли не важливі; будь-що поза переліком валить старт.
   * Прямого Anthropic, Groq і Voyage не стосується. Реєстр і умова зняття —
   * `docs/engineering/architecture/feature-flags.md` § 3.1.
   */
  OPENROUTER_QUANTIZATION_FLOOR: z.preprocess(
    (v) => (typeof v === "string" ? v.trim().toLowerCase() || undefined : v),
    z.enum(OPENROUTER_QUANTIZATION_FLOORS).default("fp8"),
  ),

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
   * QR — `docs/work/specs/receipt-scan.md`). Той самий
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

  /**
   * Глибина міркувань ПЕРШОГО ходу `/api/chat` (JSON і стрім), лише через
   * шлюз OpenRouter. Незадана або порожня — `low`
   * (`CHAT_FIRST_TURN_REASONING_EFFORT_DEFAULT`, рішення founder-а 2026-11-18
   * після заміру: на `gemini-3.7-flash` та сама правильність вибору
   * інструмента, нуль вигаданих id, медіана ~2,8 с проти ~3,5 с; спека
   * `hubchat-first-turn-stream.md` § Замір 2026-11-18).
   *
   * Повернення без релізу: `CHAT_FIRST_TURN_REASONING_EFFORT=medium` — це
   * дефолт шлюзу для `google/gemini-3.7-flash` за `GET /api/v1/models`
   * (2026-11-18), тобто поведінка до цього рішення. Інша модель першого ходу
   * може мати інший дефолт шлюзу: звір його в тому ж каталозі.
   *
   * Регістр і пробіли не важливі; будь-що поза переліком валить старт. Тур
   * синтезу, коуч і дайджест її не читають; на прямому Anthropic поле не йде.
   * Як значення стає полем запиту — `modules/chat/chatReasoning.ts`.
   * Реєстр і умова зняття — `docs/engineering/architecture/feature-flags.md` § 3.1.
   */
  CHAT_FIRST_TURN_REASONING_EFFORT: z.preprocess(
    (v) => (typeof v === "string" ? v.trim().toLowerCase() || undefined : v),
    z
      .enum(CHAT_FIRST_TURN_REASONING_EFFORTS)
      .default(CHAT_FIRST_TURN_REASONING_EFFORT_DEFAULT),
  ),

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
