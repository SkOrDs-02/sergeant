/** @status Active */

/**
 * Спільні константи всіх чотирьох юридичних документів.
 *
 * AI-CONTEXT: перелік `PROCESSORS` — не маркетинговий текст, а декларація
 * за GDPR Art. 28. Він мусить збігатися з реальним стеком: кожен запис тут
 * має відповідник у `apps/server/src/env/env.ts`, і навпаки — новий
 * зовнішній сервіс, що отримує дані користувача, спершу зʼявляється тут,
 * потім у `docs/governance/security/llm-subprocessors.md`.
 */

// Дата набрання чинності спільна; дата останнього оновлення тексту — у
// кожного документа своя (`LegalDocument.lastUpdated`).
export const EFFECTIVE_DATE = "31 липня 2026";
export const CONTACT_EMAIL = "legal@sergeant.app";
export const PRIVACY_EMAIL = "privacy@sergeant.app";
export const SUPPORT_EMAIL = "support@sergeant.app";
export const SECURITY_EMAIL = "security@sergeant.app";

export const CONTROLLER_PLACEHOLDER =
  "ФОП [ПІБ], РНОКПП [xxxxxxxxxx, буде внесено перед public launch], адреса реєстрації [буде внесена перед public launch]";

export interface LegalProcessor {
  readonly name: string;
  readonly role: string;
  readonly region: string;
}

/**
 * Постачальник моделі за шлюзом OpenRouter. Шлюз сам моделей не має: запит
 * виконує модель одного з цих постачальників, і дані бачить і шлюз, і він.
 *
 * AI-CONTEXT: перелік звіряється з машиночитним блоком
 * `public-ai-processors` у `docs/governance/security/llm-subprocessors.md` і
 * з префіксами дефолтних моделей сервера (`legalProcessorsRegistry.test.ts`).
 * Змінилась модель на сервері → спершу реєстр, потім цей перелік; текст
 * політики й блок у Налаштуваннях збираються звідси самі.
 */
export interface AiGatewayVendor {
  /** Назва компанії латинкою, як у реєстрі. */
  readonly name: string;
  /** Префікс моделі в OpenRouter (`openai/gpt-6-luna` → `openai`). */
  readonly slug: string;
  /** Родина моделей у дужках, якщо назва компанії її не каже. */
  readonly models?: string;
}

export const AI_GATEWAY_VENDORS: ReadonlyArray<AiGatewayVendor> = [
  { name: "Google", slug: "google", models: "Gemini" },
  { name: "Z.ai", slug: "z-ai", models: "GLM" },
  { name: "DeepSeek", slug: "deepseek" },
  { name: "Anthropic", slug: "anthropic", models: "Claude" },
  { name: "OpenAI", slug: "openai", models: "GPT" },
] as const;

/**
 * Хто може розпізнавати фото чека й скриншот банківської виписки: чинний
 * постачальник за замовчуванням (`OPENROUTER_RECEIPT_MODEL`) і ті, на кого
 * власник може повернути шлях змінною без релізу. Текст політики називає
 * обох, тож відкат у межах цього списку не робить його неправдою.
 */
export const RECEIPT_VISION_VENDORS = {
  defaultSlug: "openai",
  rollbackSlugs: ["google"],
} as const;

export function gatewayVendorName(slug: string): string {
  const vendor = AI_GATEWAY_VENDORS.find((v) => v.slug === slug);
  if (!vendor) throw new Error(`Unknown AI gateway vendor: ${slug}`);
  return vendor.name;
}

function formatGatewayVendor(vendor: AiGatewayVendor): string {
  return vendor.models ? `${vendor.name} (${vendor.models})` : vendor.name;
}

/** «Google (Gemini), Z.ai (GLM), DeepSeek, Anthropic (Claude), OpenAI (GPT)». */
export const AI_GATEWAY_VENDOR_LIST =
  AI_GATEWAY_VENDORS.map(formatGatewayVendor).join(", ");

/** «OpenAI (за замовчуванням) або Google». */
export const RECEIPT_VISION_VENDOR_LIST = [
  `${gatewayVendorName(RECEIPT_VISION_VENDORS.defaultSlug)} (за замовчуванням)`,
  ...RECEIPT_VISION_VENDORS.rollbackSlugs.map(gatewayVendorName),
].join(" або ");

/**
 * Субпроцесори згруповані за призначенням, щоб користувач бачив не
 * алфавітний список вендорів, а маршрути своїх даних.
 *
 * `AI_PROCESSORS` — ті, з ким сервер говорить напряму. Імена в полі
 * `registryName` збігаються з блоком `public-ai-processors` реєстру.
 */
export interface AiLegalProcessor extends LegalProcessor {
  readonly registryName: string;
}

export const AI_PROCESSORS: ReadonlyArray<AiLegalProcessor> = [
  {
    name: "OpenRouter",
    registryName: "OpenRouter",
    role: `Шлюз, через який за замовчуванням ідуть текстові запити й фото до ШІ: чат Сержанта, поради коуча, тижневий дайджест, план харчування, аналіз фото страв, категоризація транзакцій Monobank, розпізнавання чеків і скриншотів банківських виписок. Відповідає модель одного з постачальників за шлюзом: ${AI_GATEWAY_VENDOR_LIST}. Які саме моделі стоять за шлюзом, може змінюватись; цей перелік ми тримаємо актуальним`,
    region: "США; модель постачальника може працювати в іншій юрисдикції",
  },
  {
    name: "Anthropic (Claude)",
    registryName: "Anthropic",
    role: "Резервний шлях для тих самих ШІ-функцій, коли шлюз OpenRouter недоступний",
    region: "США",
  },
  {
    name: "Groq",
    registryName: "Groq",
    role: "Розпізнавання голосових записів у текст (транскрипція)",
    region: "США",
  },
  {
    name: "Voyage AI",
    registryName: "Voyage AI",
    role: "Векторні представлення (embeddings) текстів для памʼяті ШІ-асистента",
    region: "США",
  },
] as const;

function aiProcessorName(registryName: string): string {
  const processor = AI_PROCESSORS.find((p) => p.registryName === registryName);
  if (!processor) throw new Error(`Unknown AI processor: ${registryName}`);
  return processor.registryName;
}

/**
 * Підставляє назви обробників ШІ в короткий текст каталогу (блок «Куди
 * їдуть дані для AI» у Налаштуваннях), щоб і він, і політика брали назви з
 * одного переліку. Плейсхолдери: `{gateway}`, `{gatewayVendors}`,
 * `{fallback}`, `{voice}`, `{memory}`.
 */
export function fillAiProcessorNames(template: string): string {
  const names: Record<string, string> = {
    gateway: aiProcessorName("OpenRouter"),
    gatewayVendors: AI_GATEWAY_VENDOR_LIST,
    fallback: aiProcessorName("Anthropic"),
    voice: aiProcessorName("Groq"),
    memory: aiProcessorName("Voyage AI"),
  };
  return template.replace(/\{(\w+)\}/g, (match, key: string) => {
    const name = names[key];
    if (name === undefined) {
      throw new Error(`Unknown AI processor placeholder: ${match}`);
    }
    return name;
  });
}

export const PAYMENT_PROCESSORS: ReadonlyArray<LegalProcessor> = [
  {
    name: "LiqPay (АТ КБ «ПриватБанк»)",
    role: "Приймання платежів і керування підписками",
    region: "Україна",
  },
  {
    name: "Plata by Mono (АТ «Універсал Банк»)",
    role: "Приймання платежів і керування підписками",
    region: "Україна",
  },
  {
    name: "Stripe",
    role: "Приймання міжнародних платежів і керування підписками",
    region: "США / ЄС",
  },
  {
    name: "Apple (App Store)",
    role: "Внутрішні покупки в iOS-застосунку та обробка квитанцій",
    region: "США / ЄС",
  },
] as const;

export const INFRA_PROCESSORS: ReadonlyArray<LegalProcessor> = [
  {
    name: "Monobank (АТ «Універсал Банк»)",
    role: "Підключення банківських рахунків, банок і транзакцій через банківський API",
    region: "Україна",
  },
  {
    name: "Hetzner",
    role: "Хостинг бекенду і бази даних PostgreSQL",
    region: "ЄС (Німеччина)",
  },
  {
    name: "Vercel",
    role: "Хостинг веб-фронтенду і CDN; статистика переглядів сторінок (Web Analytics) лише за згодою на аналітику",
    region: "Глобальний edge",
  },
  {
    name: "Resend",
    role: "Транзакційні та інформаційні email-и",
    region: "США",
  },
  {
    name: "Firebase Cloud Messaging (Google) та Apple Push Notification service",
    role: "Доставка пуш-нотифікацій на мобільні пристрої",
    region: "США / глобально",
  },
  {
    name: "Telegram",
    role: "Бот запису у список очікування та бета-запрошення; службові технічні сповіщення команді",
    region: "Глобально",
  },
  {
    name: "Sentry",
    role: "Збір помилок і продуктивності фронтенду й бекенду",
    region: "США",
  },
  {
    name: "PostHog",
    role: "Продуктова аналітика подій",
    region: "ЄС",
  },
  {
    name: "Grafana Cloud (Loki) та Google Cloud Storage",
    role: "Архів серверних логів, коли архівування ввімкнене",
    region: "ЄС / США, залежно від регіону інстансу",
  },
] as const;

export const REFERENCE_PROCESSORS: ReadonlyArray<LegalProcessor> = [
  {
    name: "Open Food Facts",
    role: "Відкрита база продуктів. Отримує лише пошуковий запит або штрихкод, без даних акаунта",
    region: "Франція",
  },
  {
    name: "USDA FoodData Central, UPCitemdb",
    role: "Довідники продуктів і штрихкодів. Отримують лише пошуковий запит або штрихкод, без даних акаунта",
    region: "США",
  },
] as const;

export function formatProcessor(processor: LegalProcessor): string {
  return `• ${processor.name}: ${processor.role}. Регіон обробки: ${processor.region}.`;
}
