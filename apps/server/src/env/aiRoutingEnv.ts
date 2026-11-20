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

/** Дефолт текстових непотокових шляхів шлюзу (рішення власника 2026-11-19). */
const TEXT_PIPELINE_MODEL = "google/gemini-3.5-flash-lite";

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
 * Глибина туру синтезу на тирі Premium: `default` (поля немає, глибину
 * ставить шлюз) плюс ті самі значення, що в першого ходу, і та сама форма
 * поля для `/messages` (`chatReasoning.ts`).
 */
export const CHAT_SYNTHESIS_PREMIUM_REASONING_EFFORTS = [
  "default",
  ...CHAT_FIRST_TURN_REASONING_EFFORTS,
] as const;

export type ChatSynthesisPremiumReasoningEffort =
  (typeof CHAT_SYNTHESIS_PREMIUM_REASONING_EFFORTS)[number];

/**
 * `default`, а не `none`, за доперевіркою 2026-11-19 на прод-розмірі входу
 * (близько 10k токенів, `scripts/eval/pipelines.synthesisProd.ts`): з `none`
 * `z-ai/glm-5.2` на пастці «розбіжність у сумах» давала хибні числа в 3 з 10
 * відповідей (у режимі «як зараз» 0 з 10), хоч і вдвічі швидше й на 40 %
 * дешевше (`docs/work/research/2026-11-19-openrouter-new-models.md` § 6.4).
 */
export const CHAT_SYNTHESIS_PREMIUM_REASONING_EFFORT_DEFAULT: ChatSynthesisPremiumReasoningEffort =
  "default";

/**
 * Глибина міркувань скану чека й імпорту скриншота виписки
 * (`OPENROUTER_RECEIPT_MODEL`): той самий перелік і та сама граматика поля
 * `/messages`, що в синтезу Premium. `none` за замовчуванням, бо саме так
 * `openai/gpt-6-luna` міряли й обрали (рішення власника 2026-11-19, § 6.5
 * дослідження `2026-11-19-openrouter-new-models.md`): без вимкнення міркування
 * в неї зʼїдали `max_tokens` і множили латентність (§ 6.4).
 */
export const RECEIPT_VISION_REASONING_EFFORT_DEFAULT: ChatSynthesisPremiumReasoningEffort =
  "none";

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

/**
 * Постачальники OpenRouter, яких обходимо, коли змінна не задана.
 *
 * Рішення власника 2026-11-19 за заміром
 * `docs/work/research/2026-11-19-openrouter-new-models.md` § 6.4: під
 * квантизацією від 8 біт `deepseek/deepseek-v4-flash` (синтез Free/standard)
 * ішов на Baidu 100 %, а Baidu віддавав порожній текст із «салатом» у полі
 * `reasoning` (16 із 42 на стенді, 4 із 5 стрімів синтезу через `/messages`).
 * Без Baidu (`provider.ignore`) запити пішли на Fireworks: 39/42, порожня одна
 * (це без стріму). У стрімі той самий Fireworks дав 9 порожніх із 30
 * (`eval:stream --repeat=30`, 2026-11-19); їх закриває страховка-перезапит
 * без міркувань (`CHAT_SYNTHESIS_EMPTY_RETRY`).
 * Слаг звірено наживо в `GET /api/v1/models/deepseek/deepseek-v4-flash/endpoints`
 * (`tag: "baidu/fp8"`; базовий слаг `baidu` за документацією шлюзу ловить
 * усі варіанти й регіони постачальника).
 */
export const OPENROUTER_IGNORE_PROVIDERS_DEFAULT: readonly string[] = ["baidu"];

/**
 * Слаг постачальника OpenRouter: `provider[/variant][/region][/tier]`
 * (`baidu`, `deepinfra/turbo`, `google-vertex/us-east5`), після нормалізації
 * до нижнього регістру.
 */
const OPENROUTER_PROVIDER_SLUG_RE =
  /^[a-z0-9][a-z0-9._-]*(?:\/[a-z0-9][a-z0-9._-]*)*$/;

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

  /**
   * Постачальники, яких шлюз OpenRouter обходить для кожного запиту (поле
   * `provider.ignore`). Незадана — `baidu`
   * (`OPENROUTER_IGNORE_PROVIDERS_DEFAULT`, рішення власника 2026-11-19).
   * Значення — слаги постачальників через кому; регістр і пробіли не
   * важливі, дублікати зникають. Обидва транспорти, Jev і стенди евалу; явний
   * `ignore` стенду (`eval:models --provider-prefs`) перемагає цей список.
   *
   * Порожнє значення (`OPENROUTER_IGNORE_PROVIDERS=`) — аварійний відкат без
   * релізу: поля `ignore` немає, решта `provider` не змінюється. Знадобиться,
   * якщо модель лишиться без постачальника (шлюз відповідає 404 «All
   * providers have been ignored», у лозі `openrouter_data_policy_no_endpoints`
   * з `reason: "ignored"`). Будь-що, крім слагів через кому, валить старт.
   * Реєстр і умова зняття — `docs/engineering/architecture/feature-flags.md` § 3.1.
   */
  OPENROUTER_IGNORE_PROVIDERS: z
    .string()
    .optional()
    .transform((v, ctx) => {
      if (v === undefined) return [...OPENROUTER_IGNORE_PROVIDERS_DEFAULT];
      const slugs = v
        .split(",")
        .map((s) => s.trim().toLowerCase())
        .filter((s) => s.length > 0);
      const bad = slugs.filter((s) => !OPENROUTER_PROVIDER_SLUG_RE.test(s));
      if (bad.length > 0) {
        ctx.addIssue({
          code: "custom",
          message: `OPENROUTER_IGNORE_PROVIDERS: not a provider slug: ${bad.join(", ")} (expected comma-separated slugs like "baidu,deepinfra/turbo", or empty to disable)`,
        });
        return z.NEVER;
      }
      return [...new Set(slugs)];
    }),

  /** Глобальний override id; порожній — шлях бере власну змінну нижче. */
  OPENROUTER_MODEL: stringWithDefault(""),

  /**
   * Текстові непотокові шляхи: категоризація (`READONLY`), дайджест, Mono і
   * текстова нутриція (`NUTRITION`: день, тиждень, список покупок, рецепти,
   * розбір комори). `google/gemini-3.5-flash-lite` з 2026-11-19 (рішення
   * власника за заміром `docs/work/research/2026-11-19-openrouter-new-models.md`
   * § 6.4: 71/75 проти 51/57 і 18 відмов 429 з 75 у `gemini-2.5-flash-lite`,
   * швидкість та сама, дорожче у 3–5 разів). Міркування в неї обовʼязкові
   * (каталожний дефолт `minimal`), тож шляхи не шлють `reasoning`; запас
   * `max_tokens` звірено живим прогоном того ж дня. Відкат без релізу:
   * задати змінну назад `google/gemini-2.5-flash-lite`. Зір нутриції
   * (`OPENROUTER_VISION_MODEL`) лишився на 2.5; чеки й імпорт виписок
   * (`OPENROUTER_RECEIPT_MODEL`) з 2026-11-19 на `openai/gpt-6-luna`.
   */
  OPENROUTER_READONLY_MODEL: stringWithDefault(TEXT_PIPELINE_MODEL),
  OPENROUTER_DIGEST_MODEL: stringWithDefault(TEXT_PIPELINE_MODEL),
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
  OPENROUTER_NUTRITION_MODEL: stringWithDefault(TEXT_PIPELINE_MODEL),
  OPENROUTER_MONO_MODEL: stringWithDefault(TEXT_PIPELINE_MODEL),

  /**
   * `POST /api/finyk/receipts/analyze` (чек-скан v1, vision-fallback без
   * QR — `docs/work/specs/receipt-scan.md`) і імпорт скриншотів виписок.
   * `openai/gpt-6-luna` з 2026-11-19 (рішення власника за заміром
   * `docs/work/research/2026-11-19-openrouter-new-models.md` § 6.5, прод-
   * транспорт, ×3): виписки 24/24, чеки 21/24, вигадок на пастках 0, на
   * 11–14 % дешевша за `gemini-2.5-flash-lite`, яка дала 7/22 на чеках,
   * вигадала на всіх шести пастках і втратила 10 з 24 викликів виписки на
   * 429. Відомий ризик: на нахиленому розмитому фото чека плутає назви
   * позицій (підсумок вірний), p95 чека 10,6 с при таймауті 20 с. Міркування
   * вимкнені (`RECEIPT_VISION_REASONING_EFFORT`). Відкат без релізу: задати
   * змінну `google/gemini-2.5-flash-lite`.
   */
  OPENROUTER_RECEIPT_MODEL: stringWithDefault("openai/gpt-6-luna"),

  /**
   * Глибина міркувань для `OPENROUTER_RECEIPT_MODEL`, лише через шлюз.
   * Незадана або порожня — `none` (`RECEIPT_VISION_REASONING_EFFORT_DEFAULT`):
   * `thinking: {type: "disabled"}` у тілі `/messages`. `default` — поля немає,
   * глибину ставить шлюз; решта — `output_config.effort`. Як значення стає
   * полем і для яких моделей `none` не шлеться —
   * `modules/finyk/receipts/visionTransport.ts`. Регістр і пробіли не
   * важливі; будь-що поза переліком валить старт. Реєстр —
   * `docs/engineering/architecture/feature-flags.md` § 3.1.
   */
  RECEIPT_VISION_REASONING_EFFORT: z.preprocess(
    (v) => (typeof v === "string" ? v.trim().toLowerCase() || undefined : v),
    z
      .enum(CHAT_SYNTHESIS_PREMIUM_REASONING_EFFORTS)
      .default(RECEIPT_VISION_REASONING_EFFORT_DEFAULT),
  ),

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

  /**
   * Глибина міркувань ТУРУ СИНТЕЗУ `/api/chat` (після результатів
   * інструментів) лише на тирі Premium (`CHAT_MODEL_SYNTHESIS`, за
   * замовчуванням `z-ai/glm-5.2`) і лише через шлюз OpenRouter. Тир standard
   * (Free, `deepseek-v4-flash`) і floor її не читають: на стенді `none` там
   * гірша (33/42 проти 39/42, дослідження 2026-11-19 § 6.4).
   *
   * Незадана або порожня — `default`: поля глибини немає, шлюз ставить свій
   * дефолт (поведінка до 2026-11-19). Рішення власника того ж дня вимкнути
   * міркування стояло за умовою доперевірки на прод-розмірі входу; вона
   * показала втрату чисел, тож `none` лишився перемикачем, а не дефолтом
   * (`CHAT_SYNTHESIS_PREMIUM_REASONING_EFFORT_DEFAULT`).
   *
   * `none` — без міркувань (`thinking: {type: "disabled"}`): перший токен
   * удвічі швидше, виклик на 40 % дешевший, відповіді коротші. Регістр і
   * пробіли не важливі; будь-що поза переліком валить старт. Як значення
   * стає полем — `modules/chat/chatReasoning.ts`. Реєстр і умова зняття —
   * `docs/engineering/architecture/feature-flags.md` § 3.1.
   */
  CHAT_SYNTHESIS_PREMIUM_REASONING_EFFORT: z.preprocess(
    (v) => (typeof v === "string" ? v.trim().toLowerCase() || undefined : v),
    z
      .enum(CHAT_SYNTHESIS_PREMIUM_REASONING_EFFORTS)
      .default(CHAT_SYNTHESIS_PREMIUM_REASONING_EFFORT_DEFAULT),
  ),

  /**
   * Страховка-перезапит порожнього ТУРУ СИНТЕЗУ `/api/chat` (стрім і JSON), лише
   * через шлюз (рішення власника 2026-11-19). Незадана або порожня — `on`:
   * синтез завершився успішно без жодного символу тексту → сервер рівно
   * один раз перепитує той самий payload з `thinking: {type: "disabled"}` у
   * ту саму SSE-відповідь (`modules/chat/chatStreamEmptyRetry.ts`). Тур
   * синтезу без стріму робить той самий перезапит у JSON-відповідь
   * (`modules/chat/chatSynthesisJson.ts`, з 2026-11-19). Будь-яка модель
   * синтезу на шлюзі, будь-який тир.
   *
   * `off` — аварійний відкат без релізу: порожня відповідь знову одразу дає
   * людині загальну помилку і повертає квоту (стрім: поведінка до
   * 2026-11-19; JSON-синтез замість колишньої заглушки «Готово.» теж дає 502).
   * Регістр і пробіли не важливі; будь-що поза переліком валить старт.
   * Перший хід і прямий Anthropic її не читають. Реєстр і умова
   * зняття — `docs/engineering/architecture/feature-flags.md` § 3.1.
   */
  CHAT_SYNTHESIS_EMPTY_RETRY: z.preprocess(
    (v) => (typeof v === "string" ? v.trim().toLowerCase() || undefined : v),
    z.enum(["on", "off"]).default("on"),
  ),
  /**
   * Другий раунд інструментів у ході чату для пари «пошук → запис» (С-2 (б),
   * спека `docs/work/specs/hubchat-second-tool-round.md`). Незадана або
   * порожня — `on`: коли перший раунд складався лише з пошуку операцій
   * (`find_transaction`), сервер перед синтезом ще раз питає модель першого
   * ходу з інструментами запису; якщо вона обрала запис, хід повертає ці
   * виклики клієнту (стеля два раунди), інакше йде звичайний синтез.
   * Ціна: плюс один виклик моделі на хід із пошуком. Лише для клієнта,
   * що шле `second_tool_round: true` у запиті синтезу.
   *
   * `off` — аварійний відкат без релізу: хід знову має рівно один раунд
   * інструментів (поведінка до 2026-11-19), «зміни ту» працює наступним
   * повідомленням через блок записів (С-2 (а)). Регістр і пробіли не
   * важливі; будь-що поза переліком валить старт. Реєстр і умова зняття —
   * `docs/engineering/architecture/feature-flags.md` § 3.1.
   */
  CHAT_SECOND_TOOL_ROUND: z.preprocess(
    (v) => (typeof v === "string" ? v.trim().toLowerCase() || undefined : v),
    z.enum(["on", "off"]).default("on"),
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
