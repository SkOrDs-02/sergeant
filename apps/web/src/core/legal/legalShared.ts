/** @status Active */

/**
 * Спільні константи всіх чотирьох юридичних документів.
 *
 * AI-CONTEXT: перелік `PROCESSORS` — не маркетинговий текст, а декларація
 * за GDPR Art. 28. Він мусить збігатися з реальним стеком: кожен запис тут
 * має відповідник у `apps/server/src/env/env.ts`, і навпаки — новий
 * зовнішній сервіс, що отримує дані користувача, спершу зʼявляється тут,
 * потім у `docs/04-governance/security/llm-subprocessors.md`.
 */

export const LAST_UPDATED = "31 липня 2026";
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
 * Субпроцесори згруповані за призначенням, щоб користувач бачив не
 * алфавітний список вендорів, а маршрути своїх даних.
 */
export const AI_PROCESSORS: ReadonlyArray<LegalProcessor> = [
  {
    name: "Anthropic (Claude)",
    role: "AI-чат, поради коуча, аналіз фото страв, автокатегоризація транзакцій",
    region: "США",
  },
  {
    name: "OpenRouter",
    role: "Маршрутизація частини AI-запитів (поради коуча, тижневий дайджест, планування харчування, категоризація транзакцій Monobank) до сторонніх моделей — зокрема Google Gemini",
    region: "США; upstream-модель може працювати в іншій юрисдикції",
  },
  {
    name: "Groq",
    role: "Розпізнавання голосових записів у текст (транскрипція)",
    region: "США",
  },
  {
    name: "Voyage AI",
    role: "Векторні представлення (embeddings) текстів для памʼяті AI-асистента",
    region: "США",
  },
] as const;

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
    role: "Хостинг веб-фронтенду і CDN",
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
    region: "ЄС / США — залежно від регіону інстансу",
  },
] as const;

export const REFERENCE_PROCESSORS: ReadonlyArray<LegalProcessor> = [
  {
    name: "USDA FoodData Central, UPCitemdb",
    role: "Довідники продуктів і штрихкодів. Отримують лише пошуковий запит або штрихкод — без даних акаунта",
    region: "США",
  },
] as const;

export function formatProcessor(processor: LegalProcessor): string {
  return `• ${processor.name} — ${processor.role}. Регіон обробки: ${processor.region}.`;
}
