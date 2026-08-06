/**
 * Last validated: 2026-08-06
 * Status: Active
 *
 * Інвентар AI-шляхів: яка модель, який шлюз, скільки токенів, як часто.
 *
 * AI-CONTEXT: розміри промптів — ВИМІР 2026-08-06 (прогін прод-білдерів із
 * фікстур `scripts/eval/pipelines.*.ts`), а не оцінка. Формат `[символи,
 * частка кирилиці]`: розділення обов'язкове, бо JSON-схеми і українська проза
 * токенізуються по-різному в ~2 рази (див. `model.ts` § Токенізація).
 *
 * AI-DANGER: `perMonth` у `PERSONAS` — гіпотези про поведінку, не телеметрія.
 * PostHog на 2026-08-06 знає 7 повідомлень чату за 60 днів від 3 юзерів; це
 * замало навіть для порядку величини. Числа підібрані так, щоб їх було легко
 * замінити, коли трафік з'явиться, — а не щоб їм вірили сьогодні.
 */

/** Текстовий блок промпту: скільки символів і яка частка кирилиці. */
export type TextBlock = readonly [chars: number, cyrillicShare: number];

export interface Pipeline {
  key: string;
  label: string;
  /** Env-змінна моделі при прямому Anthropic. */
  anthropicModel: string;
  /** Що фактично поїде під дефолтним роутингом (`LLM_*_PROVIDER`). */
  gatewayModel: string;
  /** Дефолтний шлюз за `aiRoutingEnv.ts`. */
  defaultGateway: "anthropic" | "openrouter";
  /** Системний промпт (0 — прод не шле `system`). */
  system: TextBlock;
  /** Змінна частина входу: дані користувача, репліка, tool_result. */
  user: TextBlock;
  /** Токени зображення (лише зорові шляхи). */
  imageTokens?: number;
  /** `max_tokens` із коду. */
  maxTokens: number;
  /** Реалістичний вихід — частка від `max_tokens`. */
  outputRatio: number;
  /** Чим викликається. */
  trigger: string;
}

/**
 * Вимір 2026-08-06. Джерело кожного рядка — прод-білдер, імпортований
 * стендом (`scripts/eval/pipelines.*.ts` → `Pipeline.system` / `cases[].user`).
 * `maxTokens` — з коду відповідного модуля.
 */
export const PIPELINES: readonly Pipeline[] = [
  {
    key: "classify",
    label: "Категоризація транзакції",
    anthropicModel: "claude-haiku-4-5-20251001",
    gatewayModel: "google/gemini-2.5-flash-lite",
    defaultGateway: "openrouter",
    system: [1130, 0.0],
    user: [120, 0.5],
    maxTokens: 120,
    outputRatio: 0.35,
    trigger: "транзакція з невідомим MCC (відомий MCC не доходить до моделі)",
  },
  {
    key: "mono-enrichment",
    label: "Збагачення виписки Monobank (батч)",
    anthropicModel: "claude-haiku-4-5-20251001",
    gatewayModel: "google/gemini-2.5-flash-lite",
    defaultGateway: "openrouter",
    system: [1254, 0.0],
    user: [6000, 0.4],
    maxTokens: 1500,
    outputRatio: 0.8,
    trigger: "батч ≤100 транзакцій, годинний тік (вимкнено за замовчуванням)",
  },
  {
    key: "digest",
    label: "Тижневий дайджест",
    anthropicModel: "claude-sonnet-4-6",
    gatewayModel: "google/gemini-2.5-flash-lite",
    defaultGateway: "openrouter",
    system: [1843, 0.695],
    user: [1029, 0.473],
    maxTokens: 2500,
    outputRatio: 0.4,
    trigger: "1 раз на тиждень на юзера",
  },
  {
    key: "coach-insight",
    label: "Порада коуча",
    anthropicModel: "claude-sonnet-4-6",
    gatewayModel: "openai/gpt-5.1",
    defaultGateway: "openrouter",
    system: [0, 0],
    user: [2605, 0.72],
    maxTokens: 300,
    outputRatio: 0.7,
    trigger: "відкриття хабу / картка поради",
  },
  {
    key: "day-hint",
    label: "Підказка дня (нутриція)",
    anthropicModel: "claude-sonnet-4-6",
    gatewayModel: "google/gemini-2.5-flash-lite",
    defaultGateway: "openrouter",
    system: [0, 0],
    user: [492, 0.706],
    maxTokens: 400,
    outputRatio: 0.4,
    trigger: "екран дня в нутриції",
  },
  {
    key: "day-plan",
    label: "План харчування на день",
    anthropicModel: "claude-sonnet-4-6",
    gatewayModel: "google/gemini-2.5-flash-lite",
    defaultGateway: "openrouter",
    system: [1572, 0.525],
    user: [259, 0.617],
    maxTokens: 1500,
    outputRatio: 0.75,
    trigger: "кнопка «згенерувати план»",
  },
  {
    key: "week-plan",
    label: "План харчування на тиждень",
    anthropicModel: "claude-sonnet-4-6",
    gatewayModel: "google/gemini-2.5-flash-lite",
    defaultGateway: "openrouter",
    system: [925, 0.724],
    user: [222, 0.755],
    maxTokens: 2000,
    outputRatio: 0.8,
    trigger: "кнопка «тиждень»",
  },
  {
    key: "shopping-list",
    label: "Список покупок",
    anthropicModel: "claude-sonnet-4-6",
    gatewayModel: "google/gemini-2.5-flash-lite",
    defaultGateway: "openrouter",
    system: [1554, 0.645],
    user: [374, 0.692],
    maxTokens: 1200,
    outputRatio: 0.5,
    trigger: "екран «Комора» → список",
  },
  {
    key: "recommend-recipes",
    label: "Підбір рецептів",
    anthropicModel: "claude-sonnet-4-6",
    gatewayModel: "google/gemini-2.5-flash-lite",
    defaultGateway: "openrouter",
    system: [1807, 0.641],
    user: [548, 0.637],
    maxTokens: 2800,
    outputRatio: 0.7,
    trigger: "екран рецептів",
  },
  {
    key: "parse-pantry",
    label: "Розбір комори з тексту",
    anthropicModel: "claude-sonnet-4-6",
    gatewayModel: "google/gemini-2.5-flash-lite",
    defaultGateway: "openrouter",
    system: [1261, 0.674],
    user: [88, 0.679],
    maxTokens: 2000,
    outputRatio: 0.15,
    trigger: "надиктований/введений список продуктів",
  },
  {
    key: "analyze-photo",
    label: "Аналіз фото їжі",
    anthropicModel: "claude-sonnet-4-6",
    gatewayModel: "google/gemini-2.5-flash-lite",
    defaultGateway: "openrouter",
    system: [900, 0.65],
    user: [200, 0.7],
    imageTokens: 1500,
    maxTokens: 700,
    outputRatio: 0.5,
    trigger: "фото страви",
  },
  {
    key: "refine-photo",
    label: "Уточнення фото їжі",
    anthropicModel: "claude-sonnet-4-6",
    gatewayModel: "google/gemini-2.5-flash-lite",
    defaultGateway: "openrouter",
    system: [900, 0.65],
    user: [250, 0.7],
    imageTokens: 1500,
    maxTokens: 650,
    outputRatio: 0.5,
    trigger: "правка порції після фото",
  },
];

// ── Чат: окремо, бо він єдиний двотуровий і єдиний із tool-payload-ом ──

/**
 * Клієнтський `context` — фінансовий знімок, RAG-витяг і коуч-кореляції, які
 * веб-клієнт кладе в тіло `/api/chat`. Схема дозволяє до 40 000 символів
 * (`packages/shared/src/schemas/api.ts`), і це не теоретична стеля: A2
 * `ai-abuse-2026-08-05.md` показує, що вміст цього поля контролює клієнт.
 *
 * `typical` — знімок хаба з десятком транзакцій; `rich` — активний юзер із
 * чотирма модулями; `ceiling` — те, що дозволяє схема.
 */
export const CHAT_CONTEXT: Record<string, TextBlock> = {
  typical: [3000, 0.7],
  rich: [12000, 0.7],
  ceiling: [40000, 0.7],
};

/** Репліка користувача і tool_result — вимір фікстур стенду. */
export const CHAT_USER_MSG: TextBlock = [200, 0.465];
export const CHAT_TOOL_RESULT: TextBlock = [2000, 0.6];

export const CHAT_MAX_TOKENS = { firstTurn: 1500, synthesis: 2500 } as const;

/** Дефолти чату по слоту × шлюзу — дзеркало `env/chatModels.ts`. */
export const CHAT_MODELS = {
  anthropic: {
    firstTurn: "claude-haiku-4-5-20251001",
    premium: "claude-sonnet-4-6",
    standard: "claude-haiku-4-5-20251001",
    floor: "claude-haiku-4-5-20251001",
  },
  openrouter: {
    firstTurn: "deepseek/deepseek-v4-flash",
    premium: "z-ai/glm-5.2",
    standard: "deepseek/deepseek-v4-flash",
    floor: "google/gemini-2.5-flash-lite",
  },
} as const;

// ── Персони ──────────────────────────────────────────────────────────

export interface Persona {
  key: string;
  label: string;
  /** Повідомлень у чат за місяць. */
  chatMessages: number;
  /** Частка повідомлень, що спричиняють tool-use → другий тур. */
  toolUseRate: number;
  /** Середня довжина сесії (повідомлень) — ділитель кешованого запису. */
  sessionMessages: number;
  /** Скільки разів на місяць спрацьовує кожен не-чатовий шлях. */
  perMonth: Partial<Record<string, number>>;
  /** Який тир чату отримує (визначає модель синтезу). */
  tier: "premium" | "standard" | "floor";
  note: string;
}

/**
 * Чому саме такі числа:
 *
 * - **free** — квота 5 одиниць/добу (`effectiveLimits.ts`), виклик з
 *   інструментом коштує 3 (`aiQuota.ts`), тож стеля доби це 1 tool-виклик +
 *   2 прості. Активних днів 12 з 30 — Free-юзер заходить не щодня.
 * - **trial** — ті самі 7 днів повного Pro (ADR-0068), але поведінка новачка:
 *   багато пробних дій у перші дні, майже нічого далі.
 * - **pro-typical** — щоденний користувач одного-двох модулів.
 * - **pro-ceiling** — стеля, яку ДОЗВОЛЯЄ код: 20 premium + 80 standard на
 *   добу, floor без ліміту. Не «зловмисник», а те, за що вже заплачено.
 */
export const PERSONAS: readonly Persona[] = [
  {
    key: "free",
    label: "Free (стеля квоти)",
    chatMessages: 36,
    toolUseRate: 0.5,
    sessionMessages: 3,
    perMonth: { classify: 20, "day-hint": 4 },
    tier: "premium",
    note: "12 активних днів × 3 повідомлення; синтез — premium-модель (інверсія)",
  },
  {
    key: "trial",
    label: "Trial (7 днів Pro)",
    chatMessages: 60,
    toolUseRate: 0.6,
    sessionMessages: 4,
    perMonth: {
      classify: 40,
      "analyze-photo": 6,
      "refine-photo": 3,
      "day-hint": 7,
      "day-plan": 3,
      "week-plan": 1,
      "shopping-list": 2,
      "recommend-recipes": 3,
      "parse-pantry": 2,
      digest: 1,
      "coach-insight": 7,
    },
    tier: "premium",
    note: "сплеск за 7 днів; далі юзер або платить, або падає у free",
  },
  {
    key: "pro-typical",
    label: "Pro (типовий)",
    chatMessages: 132,
    toolUseRate: 0.6,
    sessionMessages: 5,
    perMonth: {
      classify: 120,
      "mono-enrichment": 4,
      "analyze-photo": 30,
      "refine-photo": 12,
      "day-hint": 22,
      "day-plan": 8,
      "week-plan": 4,
      "shopping-list": 4,
      "recommend-recipes": 6,
      "parse-pantry": 4,
      digest: 4,
      "coach-insight": 22,
    },
    tier: "premium",
    note: "22 активні дні × 6 повідомлень; перші 20 на добу — premium-тир",
  },
  {
    key: "pro-ceiling",
    label: "Pro (стеля, яку дозволяє код)",
    chatMessages: 3000,
    toolUseRate: 0.6,
    sessionMessages: 8,
    perMonth: {
      classify: 400,
      "mono-enrichment": 30,
      "analyze-photo": 90,
      "refine-photo": 45,
      "day-hint": 30,
      "day-plan": 30,
      "week-plan": 8,
      "shopping-list": 12,
      "recommend-recipes": 20,
      "parse-pantry": 12,
      digest: 4,
      "coach-insight": 60,
    },
    tier: "premium",
    note: "30 днів × (20 premium + 80 standard); floor-хвіст не рахований",
  },
];

// ── Комерція ─────────────────────────────────────────────────────────

export const COMMERCE = {
  /** ADR-0068 + `PRO_MONTHLY_UAH_KOPIYKAS` (19900 коп.). */
  proMonthlyUah: 199,
  proAnnualUahPerMonth: 124,
  /** Курс не зафіксований у коді — параметр звіту, не константа продукту. */
  uahPerUsd: 42,
  /** Комісія платіжного провайдера. */
  paymentFeeRate: 0.03,
  /** Hetzner CX23 $7 + домен $2 (ADR-0074; Vercel/PostHog/Resend — free tier). */
  fixedMonthlyUsd: 9,
  /** Гіпотеза міксу парку: частка MAU в кожній персоні. */
  fleetMix: {
    free: 0.75,
    trial: 0.15,
    "pro-typical": 0.09,
    "pro-ceiling": 0.01,
  },
} as const;
